# Worker (Python)

Reads CVs with the AI and saves the profiles (design §4). It is a plain script that runs forever.
There is no web server: it only talks to the Supabase database.

## Set up (once)

You need Python 3.12 (task S1-02).

```bash
cd worker
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
python -m cv_worker              # runs forever, Ctrl+C to stop
python -m cv_worker --once       # one pass, then exits
```

It reads its keys from the environment (or the repo's `.env`): see the `worker` block of
[`../.env.example`](../.env.example). Without `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` it stops
and says so. For the local Supabase, `python3 scripts/local_env.py` (repo root) writes them to
`.env.local`; export them before running the worker.

To check search with real embeddings (S2-12), on the local Supabase only:

```bash
python -m cv_worker.check_search          # loads 18 fictional profiles, runs the searches, deletes them
python -m cv_worker.check_search --keep   # leaves them in, to build the search page on
```

It makes about 20 embedding calls (out of 1,000 a day) and prints PASS or FAIL for each S2-12 check.

## What the loop does (S1-24, `cv_worker/jobs.py`)

1. At start-up, jobs a crash left in `processing` go back in line (`requeue_stuck_jobs()`).
2. It claims the oldest job that may run now (`claim_next_job()`), runs it, and only then takes
   the next one: **one at a time**, because the free AI allows only a few calls per minute.
3. **extract job:** downloads the file from `uploads-tmp`, calls `extract_cv` with the candidate's
   `looking_for`, saves the result in `profile_drafts` (a newer upload replaces the older draft),
   marks the job `done`. If the AI is busy (429, timeout, server error), the job goes back in line
   with `run_after` 30 s × attempts later (or what Gemini asked), up to 3 tries; then it `failed`
   with the message the candidate sees. **The file is deleted when the job ends, success or
   failure** (`finally` in `run_job`); it is kept only while the job waits for another try.
4. **embed job:** only for an `approved` profile. Builds the text (no name or contact details),
   calls Gemini, stores the 1,024 numbers in `profiles.embedding`. A failure waits 1, 2, 4… up to
   15 minutes between tries, 10 tries: the profile stays visible through text search meanwhile.
5. A bug in one job fails that job only; the worker carries on. Nothing in the logs comes from a CV.

## Before opening a pull request

```bash
ruff check .
pytest
```

## Where things go

| Path | What |
|---|---|
| `cv_worker/__main__.py` | Start-up: checks the keys, then runs the loop forever (`--once`: what's ready, then exit) |
| `cv_worker/jobs.py` | The loop: claim a job, run it, mark it done or failed; the only code that touches the database (S1-24) |
| `cv_worker/schema.py` | The profile schema, the one source of truth (S1-15) |
| `cv_worker/prompts.py` | The extraction prompt (S1-19) |
| `cv_worker/ai/` | The AI calls: `gemini.py` (extraction), `embed.py` (embeddings, S1-33), `errors.py` |
| `cv_worker/extract.py` | File in, profile out. No database code here (S1-20) |
| `cv_worker/extract_one.py` | `python -m cv_worker.extract_one path/to/cv.pdf`: real extraction on one file, prints the profile |
| `tests/` | `pytest` tests. `test_queue.py` needs the local Supabase (`supabase start`); without it, it is skipped |

A new library goes in `requirements.txt` with an exact version (`name==1.2.3`), and the PR says why.

## When Gemini is busy (S1-21)

The main model is `gemini-3.5-flash-lite` (`GEMINI_MODEL`): the free `gemini-3.5-flash` allows only 20 requests
a day (docs/AI_LIMITS.md). When the main model answers 429, another HTTP error or times out, `extract_cv` asks
`GEMINI_FALLBACK_MODEL` (`gemini-3.5-flash`, its own quota) once. A bad file, a missing key or an answer that fails validation is not retried.
`meta.model` says which model produced the profile and `meta.fallback_from` why the main one was skipped.
If both fail, the candidate sees "We couldn't read your CV right now, please try again later".
