"""
S1-20 / S1-21 · Gemini client: reads a CV file and returns profile JSON.

Gemini Flash sees PDFs and images directly, so there is no separate OCR step:
one call sends the file with the S1-19 prompt and the S1-15 schema as
structured output.

Every call logs the model and duration only. Never log the CV, the request
or the AI answer: they contain personal data.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx  # the HTTP library used by google-genai
from google import genai
from google.genai import errors, types

from cv_worker import usage
from cv_worker.ai.errors import (
    AiTimeout,
    ConfigError,
    ExtractionFailed,
    InvalidOutput,
    ProviderError,
    RateLimited,
    UnsupportedFile,
)
from cv_worker.export_schema import _inline_refs
from cv_worker.prompts import EXTRACTION_SYSTEM_PROMPT, build_user_text
from cv_worker.schema import AiProfile

log = logging.getLogger("cv_worker.ai")

SUPPORTED_MIME_TYPES = ("application/pdf", "image/jpeg", "image/png", "image/webp")
DEFAULT_TIMEOUT_MS = 90_000

# The AI fills AiProfile, never looking_for (the candidate chooses it).
_schema = AiProfile.model_json_schema()
RESPONSE_SCHEMA = _inline_refs(_schema, _schema.get("$defs", {}))


def model_name() -> str:
    # Flash-Lite is the main model since 29 Oct (Ahmed's call): Flash's free 20 requests a day are gone
    # by mid-morning, and Flash-Lite scored the same on the S1-22 test set.
    # Google retires old versions for new keys, so change it here or in .env when that happens.
    return os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")


def fallback_model_name() -> str | None:
    """
    S1-21: the model to ask when the main one fails. Each Gemini model has its own free quota,
    so Flash (20 requests a day on 29 Oct) can still answer when Flash-Lite is busy or used up.
    Set GEMINI_FALLBACK_MODEL to an empty value to turn the fallback off.
    """
    return os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash") or None


def make_client(api_key: str | None = None) -> genai.Client:
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ConfigError("GEMINI_API_KEY is not set")
    return genai.Client(api_key=key)


def _retry_after(error: errors.APIError) -> float | None:
    # Gemini says how long to wait in the error details ("retryDelay": "12s").
    match = re.search(r"'retryDelay': '(\d+(?:\.\d+)?)s'", str(error.details))
    return float(match.group(1)) if match else None


@dataclass
class ExtractProfileResult:
    data: Any  # parsed JSON, not validated yet: extract.py validates it
    model: str
    duration_ms: int


def extract_profile(
    file_bytes: bytes,
    mime_type: str,
    *,
    today: date | None = None,
    client: genai.Client | None = None,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
    model: str | None = None,
) -> ExtractProfileResult:
    """Turns one CV file into profile JSON. Raises an ExtractionFailed on any error."""
    if mime_type not in SUPPORTED_MIME_TYPES:
        raise UnsupportedFile(f"Unsupported file type: {mime_type}")
    client = client or make_client()
    model = model or model_name()

    started = time.perf_counter()
    error: str | None = None
    status: int | None = None
    try:
        try:
            response = client.models.generate_content(
                model=model,
                contents=[types.Part.from_bytes(data=file_bytes, mime_type=mime_type), build_user_text(today or date.today())],
                config=types.GenerateContentConfig(
                    system_instruction=EXTRACTION_SYSTEM_PROMPT,
                    temperature=0,
                    response_mime_type="application/json",
                    response_json_schema=RESPONSE_SCHEMA,
                    http_options=types.HttpOptions(timeout=timeout_ms),
                ),
            )
        # "from None": the SDK's error message quotes the response body, which we never keep.
        except errors.APIError as e:
            if e.code == 429:
                raise RateLimited("Gemini rate limit reached (HTTP 429)", retry_after=_retry_after(e)) from None
            raise ProviderError(f"Gemini failed with HTTP {e.code}", status=e.code) from None
        except httpx.TimeoutException:
            raise AiTimeout("Gemini timed out") from None
        except httpx.HTTPError:
            raise ProviderError("Network error calling Gemini") from None

        content = response.text or ""
        if not content.strip():
            raise InvalidOutput("The AI returned an empty answer")
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            raise InvalidOutput("The AI answer is not valid JSON") from None
        duration_ms = round((time.perf_counter() - started) * 1000)
        return ExtractProfileResult(data=data, model=response.model_version or model, duration_ms=duration_ms)
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
                    "step": "extract",
                    "model": model,
                    "duration_ms": round((time.perf_counter() - started) * 1000),
                    "ok": error is None,
                    "error": error,
                    "status": status,
                }
            )
        )
