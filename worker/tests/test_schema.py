import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from cv_worker.export_schema import export_schema
from cv_worker.schema import CandidateProfile, ExtractedProfile


def test_complete_profile():
    profile = CandidateProfile.model_validate({
        "basics": {"name": "Test Candidate", "email": "candidate@example.com"},
        "looking_for": "pfe", "availability": "February",
        "education": [{"school": "University", "degree": "Engineering", "end": "present"}],
        "experience": [{"company": "Company", "role": "Intern", "start": "2025-06"}],
        "projects": [{"name": "Portfolio", "technologies": ["React"]}],
        "skills": ["Python"], "languages": [{"language": "French", "level": "B2"}],
        "certifications": [{"name": "Certificate", "year": "2025"}],
        "classification": {"domain": "software_engineering", "seniority": "student",
                           "years_experience": 0},
    })
    assert profile.education[0].end == "present"
    assert profile.looking_for == "pfe"


@pytest.mark.parametrize("value", [
    {"classification": {"domain": "unknown-domain"}},
    {"classification": {"years_experience": -1}},
    {"education": [{"start": "2025-13"}]},
    {"certifications": [{"year": "25"}]},
    {"basics": {"email": "wrong", "links": {"github": "javascript:alert(1)"}}},
])
def test_rejects_invalid_profiles(value):
    with pytest.raises(ValidationError):
        CandidateProfile.model_validate(value)


def test_ai_cannot_choose_looking_for():
    assert "looking_for" not in ExtractedProfile.model_json_schema()["properties"]
    with pytest.raises(ValidationError):
        ExtractedProfile.model_validate({"looking_for": "job"})


def test_export_matches_checked_in_schema():
    target = Path(__file__).resolve().parents[2] / "shared" / "profile.schema.json"
    assert json.loads(target.read_text(encoding="utf-8")) == json.loads(export_schema())
