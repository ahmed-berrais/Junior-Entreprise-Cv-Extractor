# AI provider limits (free tier)

What each dashboard shows on the free plan. Update this when a plan changes.

We use **Google Gemini only** (decided 29 Oct 2026, approved by Ahmed). Mistral was dropped: its free API refused every call
(HTTP 429) until a paid plan was turned on. NVIDIA was skipped for Sprint 1 (agreed with the team).

## Google Gemini (extraction)

Key created in Google AI Studio (aistudio.google.com), stored in `.env` as `GEMINI_API_KEY` (ask Ahmed for the value). Check it with `python scripts/check_keys.py`.

- Main model: **`gemini-3.5-flash-lite`** (`GEMINI_MODEL`), fallback `gemini-3.5-flash` (`GEMINI_FALLBACK_MODEL`).
  Swapped on 29 Oct (Ahmed's call): Flash's 20 requests a day are gone by mid-morning, and Flash-Lite scored the same
  on the test set (1.00 on every field, also on 5 real CVs labelled afterwards). `gemini-flash-latest` (3.8) timed out
  on the free tier and `gemini-2.5-flash` is retired for new keys.
- Free limits, measured 29 Oct: **`gemini-3.5-flash` allows only 20 requests per day** per project (Google's 429 answer:
  "Generate content requests per day limit exceeded on Free Tier", quota counted on `gemini-3.6-flash`, reset after about 20 h).
  Each model has its own quota: `gemini-3.5-flash-lite` still answered after that and handled about 80 CVs the same day
  without hitting a limit, with perfect scores on the 10 labelled CVs (S1-22). 20 a day is far too few for a job fair, so
  Flash-Lite is now the main model and Flash only the fallback.
- 29 Oct: the key is valid, but the first test calls got "high demand, try again later" (HTTP 503) and timeouts.
  The free tier can be busy at peak times; the worker returns `provider_error` / `timeout` and the candidate
  sees "We couldn't read your CV right now, please try again later".

## Google Gemini (smart search, S3-04)

Smart search turns a recruiter's sentence into filters with one call to **`gemini-3.5-flash-lite`** (`GEMINI_SEARCH_MODEL`),
on its own key, **`GEMINI_SEARCH_API_KEY`**, created on 8 Nov in a **separate Google project** ("search"). Gemini replaces
Nemotron from the task (Ahmed's OK): one provider for the team. Because limits are per project, smart searches never use
the 500 Flash-Lite requests CV extraction needs: that project has its own 15 a minute and 500 a day.

- Called on Enter only, never while typing. Each smart search also costs the usual embedding call for the text that's left.
- Over 4 seconds, a 429 or any error: the page searches the sentence as typed. At the busiest minute of the fair some
  smart searches will fall back that way, which is expected.
- Measured 8 Nov: 0.7 to 2.7 s per sentence.

## Per-model limits (free tier, AI Studio → Rate limits, read 29 Oct)

Limits are per Google Cloud project, not per key. Requests per day reset at midnight Pacific time (9:00 in Tunis from November).

| Model | Used for | Requests / minute | Requests / day | Tokens / minute |
|---|---|---|---|---|
| `gemini-3.5-flash-lite` | extraction (main) | 15 | 500 | 250,000 |
| `gemini-3.5-flash` | extraction (fallback) | 5 | 20 (counted on `gemini-3.6-flash`) | 250,000 |
| `gemini-embedding-001` | embeddings (S1-33, search) | 100 | 1,000 | 30,000 |

## How many calls we make

| Event | Calls |
|---|---|
| A candidate uploads a CV | 1 extraction call (+1 if the main model fails and the fallback is asked) |
| A candidate approves their profile | 1 embedding call (the `embed` job, S1-33) |
| A company searches | 1 embedding call (the query, S2-13) |
| A company uses smart search | 1 Flash-Lite call on the **search** project (S3-04) + the embedding call above if words are left |

Retries add calls too: the worker puts a busy job back in the queue (S1-24), and `embed()` retries 429, timeouts and 5xx.

**What this means on 07-11:**
- **About 500 CV extractions a day is the ceiling** (Flash-Lite's 500, plus Flash's 20 as fallback). Retries
  of a busy job count too. Above that, Gemini answers 429 with a wait time and the worker puts the job back until
  then (3 attempts at most, S1-24), so a CV uploaded after the ceiling is read after the 9:00 reset at the earliest.
- 15 requests a minute is not the problem: the worker reads one CV at a time (about 6-10 s each).
- Embeddings: 1,000 a day **shared** between approvals and company searches. 100 a minute and 30,000 tokens
  a minute are far above what one worker sends.
- **Our own tests use the same quota** (one project): on 29 Oct the test runs alone used 162 of Flash-Lite's 500.
  No quality-script runs on fair day or the day before.
- If more is needed: turn on billing (Tier 1) for that week, or ask for a separate project for the fair.
