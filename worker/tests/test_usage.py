"""
S3-10 · Every Gemini request is counted once, failed ones too, and a broken counter never breaks
the CV. No real API calls and no database: the counter is replaced by a list.
"""
import httpx
import pytest

from cv_worker import usage
from cv_worker.ai.embed import embed
from cv_worker.extract import extract_cv
from tests.test_embed import FakeGemini as FakeEmbed
from tests.test_embed import embedding_ok, gemini_error
from tests.test_fallback import FALLBACK, MAIN, FakeGemini, error, ok


@pytest.fixture
def counted(monkeypatch):
    calls = []
    monkeypatch.setattr(usage, "_record", calls.append)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.delenv("GEMINI_FALLBACK_MODEL", raising=False)
    return calls


def test_an_extraction_counts_the_main_model_once(counted):
    extract_cv(b"%PDF-1.4 test", "application/pdf", client=FakeGemini({MAIN: ok(MAIN)}).client)
    assert counted == [MAIN]


def test_a_failed_main_call_and_the_fallback_are_both_counted(counted):
    fake = FakeGemini({MAIN: error(429, "RESOURCE_EXHAUSTED"), FALLBACK: ok(FALLBACK)})
    extract_cv(b"%PDF-1.4 test", "application/pdf", client=fake.client)
    assert counted == [MAIN, FALLBACK]


def test_each_embedding_attempt_is_counted(counted):
    embed("Python developer", client=FakeEmbed(lambda r: gemini_error(503), lambda r: embedding_ok()).client,
          sleep=lambda s: None)
    assert counted == ["gemini-embedding-001", "gemini-embedding-001"]


def test_a_broken_counter_does_not_break_the_cv(monkeypatch):
    def broken(kind):
        raise httpx.ConnectError("database unreachable")

    monkeypatch.setattr(usage, "_record", broken)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    result = extract_cv(b"%PDF-1.4 test", "application/pdf", client=FakeGemini({MAIN: ok(MAIN)}).client)
    assert result.status == "succeeded"
