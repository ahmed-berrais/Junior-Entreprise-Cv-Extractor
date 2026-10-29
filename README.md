# CV Extractor · Pristini JE

The job-fair CV platform for **Wed 11-11-2026**. Candidates upload a CV, the AI fills in their
profile, they check it and get a QR code. Companies search the profiles and scan QR codes at the fair.

It is two programs in one repository, sharing one Supabase database:

| Part | Folder | Language | What it does |
|---|---|---|---|
| **web** | repo root | Next.js + TypeScript | Every page and every API the browser calls |
| **worker** | `worker/` | Python 3.12 | Reads CVs with the AI, saves the profiles, computes embeddings |

They never call each other. The web app writes a job into the `extraction_jobs` table, and the
worker picks it up from there. If the worker is down, jobs just wait.

## Where things go

| Folder | What goes in it |
|---|---|
| `app/(public)/` | Pages anyone can open: the landing page, login (the brackets keep it out of the URL) |
| `app/candidate/` | The candidate space: upload, review, my profile → `/candidate/...` |
| `app/company/` | The company space: CVs, search, scan → `/company/...` |
| `app/admin/` | Ahmed's dashboard → `/admin/...` |
| `components/` | Shared UI. `components/ui/` holds the shadcn/ui components: copy them, don't rewrite them |
| `lib/` | Shared code: `lib/supabase/` (database clients), `lib/profile/` (the generated profile schema) |
| `messages/` | Every text on screen, in `en.json` **and** `fr.json`. No sentence is typed directly in a page |
| `supabase/` | Database migrations (`migrations/`) and access tests (`tests/`) |
| `scripts/` | Helper scripts (seeding, checks) |
| `shared/` | `profile.schema.json`, exported by the worker, read by the web app |
| `worker/` | The Python worker. It has its own [README](worker/README.md) |

## Run the web app

You need Node.js 20+ (task S1-02).

```bash
npm install
cp .env.example .env     # then ask Ahmed for the values
npm run dev              # http://localhost:3000
```

Before opening a pull request:

```bash
npm run lint
npm run build
```

The shared candidate profile schema is authored in Python and generated for the
web app. See [docs/PROFILE-SCHEMA.md](docs/PROFILE-SCHEMA.md) for regeneration and
[docs/PROFILE-REVIEW.md](docs/PROFILE-REVIEW.md) for the review form and remaining
staging checks. Run `npm run test:web` for form and draft persistence tests.

## Talking to the database from the web app

Always go through these files, never create a Supabase client yourself:

| You are writing… | Use | It acts as |
|---|---|---|
| A component with `"use client"` | `createClient()` from `lib/supabase/client.ts` | the logged-in user (database rules apply) |
| A server component, server function or API route | `await createClient()` from `lib/supabase/server.ts` | the logged-in user (database rules apply) |
| Server code that must skip the rules (approval, upload, admin actions) | `createAdminClient()` from `lib/supabase/admin.ts` | **the service role: sees and changes everything**. Check who is asking first |
| "Who is logged in, and as what?" | `await getCurrentUser()` from `lib/auth.ts` | returns `{ id, email, role }` or `null` |

- `lib/supabase/admin.ts` can't be imported by a `"use client"` file: the build fails on purpose.
- A component that calls `getCurrentUser()` must sit inside `<Suspense>`, or the build fails.
  See [`app/(public)/whoami/page.tsx`](app/(public)/whoami/page.tsx): open `/whoami` to see who you are logged in as.
- `proxy.ts` (Next.js 16's name for middleware) keeps the login fresh on every page.

## Run the worker

Only if you work on a task tagged `python`. See [worker/README.md](worker/README.md).

## Run the database locally

The tables, access rules and their tests are SQL files in `supabase/`. You can run the full,
open-source Supabase on your laptop with Docker: see [docs/DATABASE.md](docs/DATABASE.md).

## Environment variables

Every name is listed in [`.env.example`](.env.example), grouped by service. `.env` itself is
gitignored. **Never commit a key, paste it in ClickUp, or put it in a `NEXT_PUBLIC_` variable**
(those are visible in the browser).

| Variable | Used by | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Public Supabase address and key; safe in the browser because the database rules (RLS) protect the data |
| `SUPABASE_URL` | worker | Same address as above |
| `SUPABASE_SERVICE_ROLE_KEY` | web (server only), worker | Bypasses every database rule. Server side only |
| `APP_URL` | web | The site's address, used in QR codes and emails |
| `MISTRAL_API_KEY` | web, worker | Mistral: OCR and extraction (worker), search embeddings (web) |
| `MISTRAL_EMBED_MODEL` | web, worker | Always `mistral-embed`. The one embedding model, forever |
| `GEMINI_API_KEY` | worker | Fallback when Mistral can't read a CV |
| `NVIDIA_API_KEY` | web | Smart search (bonus) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | web | The club Gmail that sends company access codes |

## How we work

1. Pick a task in ClickUp, move it to *in progress*.
2. Branch: `CU-<clickup-id>-short-name` (ClickUp then links it automatically).
3. Open a pull request into `main`, move the task to *in review*. The checks must be green.
4. Ahmed reviews and merges. Nobody pushes to `main` directly.

The full guide is `CONTRIBUTING.md` (task S1-06).
