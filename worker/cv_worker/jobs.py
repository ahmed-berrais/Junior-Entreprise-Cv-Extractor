"""
S1-24 · The job queue: claim the next job, run it, mark it done or failed.

Two kinds of jobs live in extraction_jobs (docs/DATABASE.md):
 - extract: read the uploaded CV with the AI (S1-20/21) and save it as the candidate's draft.
 - embed:   compute the approved profile's embedding (S1-33) and store it for search.

Rules this file keeps (design §3, §4, §10a):
 - One job at a time, oldest first: the free AI tiers allow only a few calls per minute.
 - The uploaded file is deleted when its extract job ends, success or failure (the `finally`).
   It is kept only when the job goes back in line to be tried again later.
 - Errors are caught per job: one bad CV never stops the worker.
 - A busy AI (429, timeout, server error) puts the job back with run_after a little later,
   up to MAX_ATTEMPTS tries. The candidate always ends with a result or a message.
 - Logs say which job and what happened, never CV content or personal data.

SupabaseStore is the only code that talks to the database and the bucket. run_job does the rest.
"""
from __future__ import annotations

import json
import logging
import os
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from cv_worker.ai import embed as embedding
from cv_worker.ai.errors import InvalidOutput
from cv_worker.extract import ExtractionResult, extract_cv
from cv_worker.schema import CandidateProfile

log = logging.getLogger("cv_worker.jobs")

BUCKET = "uploads-tmp"
# claim_next_job() counts the tries; this many and a busy AI fails the job instead of waiting again.
MAX_ATTEMPTS = 3
# Embeddings wait longer: the profile is already visible through text search meanwhile, and a broken
# key fixed within the hour still gets every embedding (S1-33).
EMBED_MAX_ATTEMPTS = 10
RETRY_LATER_CODES = {"rate_limited", "provider_error", "timeout"}
# Same text as requeue_stuck_jobs() in the database, so the candidate sees one message.
FAILED_TO_READ = "We couldn't read this file. Try a PDF export of your CV."
NOT_APPROVED = "The profile is not approved, so there is nothing to embed."
EMBED_FAILED = "The embedding could not be computed."
MIME_BY_EXTENSION = {"pdf": "application/pdf", "jpg": "image/jpeg", "png": "image/png"}

Extract = Callable[..., ExtractionResult]
Embed = Callable[[str], list[float]]


def _gemini_embed(text: str) -> list[float]:
    return embedding.embed(text, task="document").vector


def retry_delay(attempts: int, retry_after: float | None = None) -> float:
    """Seconds to wait before the next try: 30 s, 60 s, 90 s… or longer if the AI asked for it."""
    return max(retry_after or 0, 30.0 * attempts)


def embed_retry_delay(attempts: int) -> float:
    """1, 2, 4, 8… minutes, never more than 15."""
    return min(60.0 * 2 ** (attempts - 1), 900.0)


class SupabaseStore:
    """Everything the worker reads and writes, through the service role key (server only)."""

    def __init__(self, client):
        self.db = client

    @classmethod
    def from_env(cls) -> SupabaseStore:
        from supabase import create_client

        return cls(create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]))

    def claim(self) -> dict | None:
        jobs = self.db.rpc("claim_next_job").execute().data
        return jobs[0] if jobs else None

    def requeue_stuck(self) -> int:
        return self.db.rpc("requeue_stuck_jobs").execute().data

    def download(self, path: str) -> bytes:
        return self.db.storage.from_(BUCKET).download(path)

    def delete_file(self, path: str) -> None:
        self.db.storage.from_(BUCKET).remove([path])

    def looking_for(self, user_id: str) -> str | None:
        row = self.db.table("profiles").select("looking_for").eq("user_id", user_id).maybe_single().execute()
        return row.data["looking_for"] if row and row.data else None

    def save_draft(self, user_id: str, data: dict) -> None:
        # One draft per candidate: a newer upload replaces the older one.
        self.db.table("profile_drafts").upsert(
            {"user_id": user_id, "data": data, "provider": "gemini"}, on_conflict="user_id"
        ).execute()

    def approved_profile(self, user_id: str) -> dict | None:
        row = self.db.table("profiles").select("status, data").eq("user_id", user_id).maybe_single().execute()
        return row.data["data"] if row and row.data and row.data["status"] == "approved" else None

    def save_embedding(self, user_id: str, vector: list[float]) -> None:
        literal = "[" + ",".join(repr(float(v)) for v in vector) + "]"  # pgvector's text format
        self.db.table("profiles").update({"embedding": literal}).eq("user_id", user_id).execute()

    def finish(self, job_id: str, status: str, error_message: str | None = None) -> None:
        self.db.table("extraction_jobs").update({
            "status": status,
            "error_message": error_message,
            "finished_at": datetime.now(UTC).isoformat(),
        }).eq("id", job_id).execute()

    def count_usage(self, kind: str) -> None:
        self.db.rpc("count_usage", {"p_kind": kind}).execute()

    def try_later(self, job_id: str, seconds: float) -> None:
        run_after = datetime.now(UTC) + timedelta(seconds=seconds)
        self.db.table("extraction_jobs").update({
            "status": "queued", "run_after": run_after.isoformat(), "started_at": None,
        }).eq("id", job_id).execute()


def _run_extract(job: dict, store: SupabaseStore, extract: Extract) -> str:
    path = job["file_path"]
    mime = MIME_BY_EXTENSION.get(path.rsplit(".", 1)[-1].lower(), "application/octet-stream")
    # The choice made with this upload (S2-16); jobs queued before it was stored use the profile's.
    looking_for = job.get("looking_for") or store.looking_for(job["user_id"])
    result = extract(store.download(path), mime, looking_for=looking_for)
    if result.status == "succeeded":
        store.save_draft(job["user_id"], result.profile.model_dump(mode="json"))
        store.finish(job["id"], "done")
        return "done"
    if result.code in RETRY_LATER_CODES and job["attempts"] < MAX_ATTEMPTS:
        store.try_later(job["id"], retry_delay(job["attempts"], result.retry_after))
        return "requeued"
    store.finish(job["id"], "failed", result.message)
    return "failed"


def _run_embed(job: dict, store: SupabaseStore, embed: Embed) -> str:
    data = store.approved_profile(job["user_id"])
    if data is None:
        store.finish(job["id"], "failed", NOT_APPROVED)
        return "failed"
    text = embedding.build_profile_text(CandidateProfile.model_validate(data))
    try:
        vector = embed(text)
    except InvalidOutput:
        store.finish(job["id"], "failed", EMBED_FAILED)  # the profile itself is the problem
        return "failed"
    except Exception:  # noqa: BLE001 (a busy AI or a broken key: try again later)
        if job["attempts"] < EMBED_MAX_ATTEMPTS:
            store.try_later(job["id"], embed_retry_delay(job["attempts"]))
            return "requeued"
        store.finish(job["id"], "failed", EMBED_FAILED)
        return "failed"
    store.save_embedding(job["user_id"], vector)
    store.finish(job["id"], "done")
    return "done"


def _quietly(what: str, job: dict, fn: Callable[[], object]) -> None:
    """Runs a clean-up step; if it fails, logs it loudly instead of crashing the worker."""
    try:
        fn()
    except Exception as e:  # noqa: BLE001
        log.error(json.dumps({"event": "cleanup_failed", "step": what, "job": job["id"], "error": type(e).__name__}))


def run_job(job: dict, store: SupabaseStore, *, extract: Extract = extract_cv, embed: Embed = _gemini_embed) -> str:
    """Runs one claimed job to the end. Returns "done", "failed" or "requeued". Never raises."""
    started = time.perf_counter()
    outcome, error = "failed", None
    try:
        if job["kind"] == "extract":
            outcome = _run_extract(job, store, extract)
        else:
            outcome = _run_embed(job, store, embed)
    except Exception as e:  # noqa: BLE001 (one bad job must never stop the worker)
        error = type(e).__name__
        message = FAILED_TO_READ if job["kind"] == "extract" else EMBED_FAILED
        _quietly("mark_failed", job, lambda: store.finish(job["id"], "failed", message))
    finally:
        # The promise to candidates: no CV file is kept once its job is over.
        if job["kind"] == "extract" and outcome != "requeued" and job.get("file_path"):
            _quietly("delete_file", job, lambda: store.delete_file(job["file_path"]))
    log.info(json.dumps({
        "event": "job", "job": job["id"], "kind": job["kind"], "attempt": job["attempts"],
        "outcome": outcome, "error": error, "duration_ms": round((time.perf_counter() - started) * 1000),
    }))
    return outcome


def process_ready(store: SupabaseStore, *, extract: Extract = extract_cv, embed: Embed = _gemini_embed) -> int:
    """Runs every job that may run now, one at a time, oldest first. Returns how many ran."""
    ran = 0
    while (job := store.claim()) is not None:
        run_job(job, store, extract=extract, embed=embed)
        ran += 1
    return ran


def run_pending(store: SupabaseStore, *, extract: Extract = extract_cv, embed: Embed = _gemini_embed) -> int:
    """What the worker does when it starts: put crashed jobs back in line, then run what's ready."""
    store.requeue_stuck()
    return process_ready(store, extract=extract, embed=embed)
