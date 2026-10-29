"""Run from worker/: python -m cv_worker.export_schema."""

import json
from pathlib import Path

from cv_worker.schema import CandidateProfile


def export_schema() -> str:
    schema = CandidateProfile.model_json_schema()
    # JSON Schema does not otherwise expose default_factory values to the web generator.
    for name, value in CandidateProfile().model_dump().items():
        schema["properties"][name]["default"] = value
    schema["$defs"]["Basics"]["properties"]["links"]["default"] = {
        "linkedin": "", "github": "", "portfolio": "",
    }
    schema["$defs"]["Project"]["properties"]["technologies"]["default"] = []
    return json.dumps(schema, indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    target = Path(__file__).resolve().parents[2] / "shared" / "profile.schema.json"
    target.write_text(export_schema(), encoding="utf-8")
