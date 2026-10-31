# The database

Everything lives in one Supabase Postgres database. The tables are created by the SQL files in
`supabase/migrations/`, applied in order. Nobody creates or changes a table by clicking in the
Supabase dashboard: a change is a new migration file, reviewed in a PR like any code.

## The idea in one picture

```
 candidate uploads ──► extraction_jobs (queued) ──► Python worker ──► profile_drafts
                                                                          │ candidate checks and approves
                                                                          ▼
                                    companies ──── read approved ────► profiles
```

- **`profiles`** is what companies see. It only changes when the candidate approves.
- **`profile_drafts`** is what the AI extracted, waiting for the candidate to check it. Companies never see it.
- **`extraction_jobs`** is the queue between the web app and the worker.
- **`companies`** is one row per company login.

Every table has **row-level security (RLS)** switched on. That means the database itself decides
who can read which row, so a bug in a page cannot leak data.

## Who can see and change what

The role comes from `app_metadata.role` in the login token, which only the server can set
(never `user_metadata`: users can edit that themselves).

| Who | Can read | Can change from the browser |
|---|---|---|
| **Logged out** | nothing | nothing |
| **Candidate** | their own profile, draft and jobs | their profile's `looking_for` and `hidden`; their draft's `data` (the review form) |
| **Company** (active) | approved, non-hidden profiles; their own company row | their company's name, sector, description, website, logo |
| **Company** (disabled, or no company row) | their own company row only, no profiles | same as above |
| **Admin** | everything | nothing from the browser: admin actions go through server code |
| **Server** (service role key) | everything | everything. That's why that key never leaves the server |

Everything else goes through server code that checks first: approving (the schema is
validated), uploading (type, size, daily limit), deleting an account, creating companies.

It's enforced in two layers (`supabase/migrations/*_access_rules.sql`):
1. **Permissions** say which *columns* a browser role may change at all. RLS alone can't stop a
   candidate from setting their own `status` to `approved`, or a disabled company from enabling itself.
2. **RLS policies** say which *rows* each person sees.

`supabase/tests/03_rls.test.sql` logs in as each role and checks every line of this table.
**A new table must get its policies and tests in the same PR**: a test fails if any table in
`public` has RLS off.

Every table is linked to the user's account (`auth.users`, Supabase's own table) with
`on delete cascade`: **deleting an account deletes every row about that person**, in every table.

## profiles

| Column | What it holds |
|---|---|
| `user_id` | The candidate's account. One profile per account |
| `public_id` | A random 22-character token used in the QR code link (`/p/<public_id>`). Never a number, so nobody can guess other profiles' links |
| `status` | `draft` until the candidate approves for the first time, then `approved`. Companies only see `approved` |
| `hidden` | The candidate's "hide my profile" switch. Hidden profiles are invisible to companies but not deleted |
| `looking_for` | `pfe`, `internship` or `job`. Chosen by the candidate at upload, never by the AI |
| `data` | The whole profile (name, education, skills…) as JSON, shaped by `worker/cv_worker/schema.py` |
| `search_tsv` | Filled automatically from `data`: every word in the profile, ready for fast word search ("PyTorch", "ENIT"). Never written by hand |
| `embedding` | 1,024 numbers from `gemini-embedding-001` (was `mistral-embed` before 29 Oct; no vector was stored with it) that represent the profile's meaning, for "search by meaning". Empty until the worker computes it |
| `approved_at` | When the candidate last approved |
| `created_at`, `updated_at` | When the row was created and last changed (`updated_at` updates itself) |

## profile_drafts

| Column | What it holds |
|---|---|
| `user_id` | The candidate's account. At most one draft at a time: a new upload replaces it |
| `data` | What the AI extracted, same shape as `profiles.data`. The review form edits this |
| `provider` | Which AI produced it: `gemini` (the project is Gemini only since 29 Oct; the column still accepts `mistral`) |
| `created_at`, `updated_at` | As above |

**Why a separate table and not a column on `profiles`?** RLS works per row. A company allowed
to read an approved profile row would also read any column on it, including an unreviewed draft.

## companies

| Column | What it holds |
|---|---|
| `user_id` | The company's login, created by the admin |
| `name`, `sector`, `description`, `website`, `logo_url` | The "My company" page. The company edits these |
| `disabled` | Set by the admin. A disabled company can no longer see any profile |
| `created_at`, `updated_at` | As above |

## extraction_jobs

| Column | What it holds |
|---|---|
| `id` | The job's id; the "Processing your CV" page asks for its status with it |
| `user_id` | Whose CV it is |
| `kind` | `extract` (read a CV) or `embed` (compute a profile's embedding) |
| `status` | `queued` → `processing` → `done` or `failed` |
| `attempts` | How many times the worker has tried it. After 3 tries with a busy AI an extract job fails; an embed job gets 10 (it can wait, the profile is already visible) |
| `error_message` | Shown to the candidate when it fails, so plain words only, never a technical error |
| `file_path` | Where the uploaded file waits in the temporary storage bucket. The file is deleted when the job ends |
| `run_after` | The job is not picked before this time. Used to wait after the AI says "too many requests" (429) |
| `started_at`, `finished_at` | When the worker started and finished it |
| `created_at`, `updated_at` | As above. Jobs are handled oldest first |

## The server's functions (never the browser)

| Function | What it does |
|---|---|
| `claim_next_job()` | Gives the worker the oldest job that may run now and marks it `processing`. Two workers asking at the same time get different jobs (`FOR UPDATE SKIP LOCKED`) |
| `requeue_stuck_jobs()` | Run when the worker starts: jobs cut off by a crash go back to `queued`, or fail if they already had 3 attempts |

| `approve_profile(user_id, data, draft_updated_at)` | Approval in one step (S1-32): deletes the draft, copies the checked data into `profiles`, sets `approved` and `approved_at`, queues an `embed` job. If the draft changed since the candidate reviewed it, it does nothing and returns `null`. Returns the `public_id` |

Only the server (the service role key) can run them. For `approve_profile` that matters most: a
candidate who could call it could approve any data, skipping the schema check
(`supabase/tests/05_approve_profile.test.sql`).

## Search: `search_profiles` (S2-12)

`search_profiles(query_text, query_embedding, filters, page)` finds profiles two ways at once and
merges the results:

- **by words**: `search_tsv` against the query text ("PyTorch", "ENIT", a name);
- **by meaning**: `embedding` against the query's embedding, so "computer vision" finds a profile
  about object detection that never uses those words. Only the 50 closest profiles count.

The two lists are merged with **reciprocal rank fusion**: each profile scores
`1/(60 + its rank in the word list) + 1/(60 + its rank in the meaning list)`, and a list it isn't
in adds nothing. Being found both ways wins. Without `query_embedding` (Gemini down or busy, S2-13)
it searches by words only. Without any query it lists the filtered profiles, most recently approved first.

`filters` is a JSON object, every key optional; an unknown key is an error, so a typo never turns a filter off:

| Key | Example | Matches |
|---|---|---|
| `looking_for` | `["pfe", "internship"]` | any of them |
| `domains` | `["data_ai"]` | any of them (the list in `worker/cv_worker/schema.py`) |
| `skills` | `["python", "react"]` | any of them, or all of them with `"skills_match": "all"`. A project's or job's technologies count |
| `cities` | `["Tunis"]` | any of them |
| `schools` | `["ENIT"]` | any of them, as a whole word of the school name ("ENIS" doesn't match "ENISo") |
| `languages` | `["English", "French"]` | all of them |

Upper and lower case never matter. It returns 20 profiles per page (`page` starts at 1) with
`public_id`, `looking_for`, `data`, `approved_at`, `score` and `total_count`.

**Drafts and hidden profiles never come back**, whoever asks. The function runs with the caller's
rights, so the access rules above still apply: an active company sees approved, visible profiles; a
disabled company sees nothing. Logged-out visitors can't run it.

Tests: `supabase/tests/07_search_profiles.test.sql` (18 fictional profiles with hand-made vectors).
The same profiles with real Gemini embeddings: `python -m cv_worker.check_search` (worker/README.md).

## The temporary CV bucket: `uploads-tmp`

A private Supabase Storage bucket where an uploaded CV waits for the worker
(`<user id>/<random>.pdf`). It has **no access policy on purpose**: the browser can't list, read
or write anything in it, not even the file's owner. Only server code with the service role key
reaches it: the upload API puts the file in, and the worker deletes it when the job ends,
success or failure. Storage itself refuses files over 5 MB or of another type than PDF, JPG
and PNG. Tests: `supabase/tests/04_uploads_bucket.test.sql`.

## Work on the database locally

You need Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development).
The local database is the open-source Supabase, the same software as the cloud one.

```bash
supabase start      # starts Postgres, Auth and Storage in Docker (first time: a few minutes)
supabase db reset   # wipes the local database and applies every migration from scratch
supabase test db    # runs the tests in supabase/tests/
supabase stop       # when you're done
```

The local Studio (a dashboard to look at the tables) is at http://127.0.0.1:54623.
Our ports are 546xx, so they don't collide with another local Supabase project.

To change the database: add a new file with `supabase migration new <what_it_does>`, write the SQL,
then run `supabase db reset` and `supabase test db`. Never edit a migration that is already on `main`:
the cloud database has already run it.
