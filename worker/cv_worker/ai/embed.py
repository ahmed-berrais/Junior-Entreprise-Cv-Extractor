"""
S1-33 · Profile embeddings with Gemini.

An embedding is a list of EMBED_DIMENSIONS numbers that represents the meaning
of a profile, so search (S2-13) can find "object detection with YOLO" when a
recruiter types "computer vision".

 - build_profile_text(profile): the text that describes what the candidate does.
   Name and contact details are left out: they carry no meaning for search.
 - embed(text, task="document" | "query"): calls the Gemini embedding model.
   Profiles use "document", search queries use "query".

Search embeds the query on the web side, in TypeScript. Both sides must use the
same model and size: GEMINI_EMBED_MODEL and EMBED_DIMENSIONS.

Never log the profile text or the vector.
"""
from __future__ import annotations

import json
import logging
import math
import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

import httpx
from google import genai
from google.genai import errors, types

from cv_worker import usage
from cv_worker.ai.errors import (
    AiTimeout,
    ExtractionFailed,
    InvalidOutput,
    ProviderError,
    RateLimited,
)
from cv_worker.ai.gemini import _retry_after, make_client
from cv_worker.schema import CandidateProfile

log = logging.getLogger("cv_worker.ai")

EMBED_DIMENSIONS = 1024
DEFAULT_TIMEOUT_MS = 30_000
MAX_ATTEMPTS = 3
FIRST_BACKOFF_S = 2.0
# Errors worth retrying: the provider is busy or slow. A bad key or a bad request is not retried.
RETRYABLE = (RateLimited, AiTimeout, ProviderError)

TASK_TYPES = {"document": "RETRIEVAL_DOCUMENT", "query": "RETRIEVAL_QUERY"}


def model_name() -> str:
    return os.environ.get("GEMINI_EMBED_MODEL", "gemini-embedding-001")


# ---------------------------------------------------------------------------
# Profile text
# ---------------------------------------------------------------------------


def _join(*parts: str | None, sep: str = " ") -> str:
    return sep.join(p for p in parts if p)


def build_profile_text(profile: CandidateProfile) -> str:
    """Combines headline, summary, skills, experience, projects and education into one text."""
    lines: list[str] = []
    basics = profile.basics
    lines += [basics.headline or "", basics.summary or ""]

    if profile.skills:
        lines.append("Skills: " + ", ".join(s.name for s in profile.skills))
    for e in profile.experience:
        tech = f"Technologies: {', '.join(e.technologies)}." if e.technologies else None
        lines.append(_join(f"Experience ({e.type}): {e.position}.", e.description, tech))
    for p in profile.projects:
        tech = f"Technologies: {', '.join(p.technologies)}." if p.technologies else None
        lines.append(_join(f"Project: {p.name}.", p.description, tech))
    for ed in profile.education:
        lines.append("Education: " + _join(ed.degree, ed.field, ed.institution, sep=", ") + ".")
    if profile.certifications:
        lines.append("Certifications: " + ", ".join(c.name for c in profile.certifications))

    return "\n".join(line for line in lines if line.strip())


# ---------------------------------------------------------------------------
# Embedding call
# ---------------------------------------------------------------------------


@dataclass
class EmbedResult:
    vector: list[float]
    model: str
    attempts: int
    duration_ms: int


def _normalise(values: list[float]) -> list[float]:
    # Gemini only returns unit-length vectors at full size; shorter ones must be normalised for cosine search.
    norm = math.sqrt(sum(v * v for v in values))
    return [v / norm for v in values] if norm else values


def _embed_once(client: genai.Client, model: str, text: str, task: str, timeout_ms: int) -> list[float]:
    started = time.perf_counter()
    error: str | None = None
    status: int | None = None
    try:
        try:
            response = client.models.embed_content(
                model=model,
                contents=text,
                config=types.EmbedContentConfig(
                    task_type=TASK_TYPES[task],
                    output_dimensionality=EMBED_DIMENSIONS,
                    http_options=types.HttpOptions(timeout=timeout_ms),
                ),
            )
        # "from None": the SDK's error message quotes the response body, which we never keep.
        except errors.APIError as e:
            if e.code == 429:
                raise RateLimited("Gemini embedding rate limit reached (HTTP 429)", retry_after=_retry_after(e)) from None
            if e.code is not None and e.code < 500:
                raise ExtractionFailed(f"Gemini embedding failed with HTTP {e.code}", status=e.code) from None
            raise ProviderError(f"Gemini embedding failed with HTTP {e.code}", status=e.code) from None
        except httpx.TimeoutException:
            raise AiTimeout("Gemini embedding timed out") from None
        except httpx.HTTPError:
            raise ProviderError("Network error calling Gemini embedding") from None

        values = list(response.embeddings[0].values or []) if response.embeddings else []
        if len(values) != EMBED_DIMENSIONS:
            raise InvalidOutput(f"Expected {EMBED_DIMENSIONS} numbers, got {len(values)}")
        return _normalise(values)
    except ExtractionFailed as e:
        error, status = e.code, e.status
        raise
    finally:
        usage.count(model)
        log.info(
            json.dumps(
                {
                    "event": "ai_call",
                    "provider": "gemini",
                    "step": "embed",
                    "model": model,
                    "duration_ms": round((time.perf_counter() - started) * 1000),
                    "ok": error is None,
                    "error": error,
                    "status": status,
                }
            )
        )


def embed(
    text: str,
    *,
    task: Literal["document", "query"] = "document",
    client: genai.Client | None = None,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
    sleep: Callable[[float], None] = time.sleep,
) -> EmbedResult:
    """Embeds one text, retrying with backoff when Gemini is busy. Raises an ExtractionFailed if all attempts fail.

    The embed job (S1-24) catches that error and re-queues the job later: the profile
    stays approved and is still found by text search meanwhile.
    """
    if not text.strip():
        raise InvalidOutput("Nothing to embed: the profile text is empty")
    client = client or make_client()
    model = model_name()
    started = time.perf_counter()

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            vector = _embed_once(client, model, text, task, timeout_ms)
            return EmbedResult(vector, model, attempt, round((time.perf_counter() - started) * 1000))
        except RETRYABLE as e:
            if attempt == MAX_ATTEMPTS:
                raise
            wait = FIRST_BACKOFF_S * 2 ** (attempt - 1)
            if isinstance(e, RateLimited) and e.retry_after:
                wait = max(wait, e.retry_after)
            sleep(wait)
    raise AssertionError("unreachable")
