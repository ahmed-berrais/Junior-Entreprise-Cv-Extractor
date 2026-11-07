"""
S3-10 · Counts every Gemini call in the usage_counters table, so the admin overview shows how close
the day is to a free limit (docs/AI_LIMITS.md).

The AI clients call count(model) once per request sent, failed ones included: Google counts them too.
`python -m cv_worker` installs the real counter (SupabaseStore.count_usage). Until then counting does
nothing, so the tests and the one-off scripts never need a database.
"""
from __future__ import annotations

import json
import logging
from collections.abc import Callable

log = logging.getLogger("cv_worker.usage")

_record: Callable[[str], object] = lambda kind: None


def install(record: Callable[[str], object]) -> None:
    global _record
    _record = record


def count(kind: str) -> None:
    """Never raises: a CV must not fail because the counter couldn't be written."""
    try:
        _record(kind)
    except Exception as e:  # noqa: BLE001
        log.warning(json.dumps({"event": "usage_count_failed", "kind": kind, "error": type(e).__name__}))
