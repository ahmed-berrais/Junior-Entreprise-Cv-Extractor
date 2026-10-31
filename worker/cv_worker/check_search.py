"""
S2-12 · Checks hybrid search with REAL Gemini embeddings, on the LOCAL database.

supabase/tests/07_search_profiles.test.sql checks the SQL with hand-made vectors. This script
checks what those can't: that real embeddings make "computer vision" find a profile about object
detection that never uses those words.

    python -m cv_worker.check_search          # load the profiles, check, delete them
    python -m cv_worker.check_search --keep   # leave them in, to build the search page (S2-14) on

It loads the same 18 fictional profiles as the SQL test (16 visible, one draft, one hidden),
embeds 15 of them (the 16th waits for its embedding, like a just-approved profile) and runs the
Done-when searches of S2-12. About 20 embedding calls, out of the 1,000 a day (docs/AI_LIMITS.md).

Needs `supabase start` and GEMINI_API_KEY in the repo's .env. It refuses any database that is not
on this computer.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from urllib.parse import urlparse

from cv_worker.ai.embed import build_profile_text, embed
from cv_worker.extract_one import load_env_file
from cv_worker.schema import CandidateProfile

EMAIL_DOMAIN = "search-seed.example.com"

# name, headline, city, school, field, domain, looking_for, skills, languages, project, what it does,
# its technologies, status. The same people as supabase/tests/07_search_profiles.test.sql.
AR_FR_EN = ["Arabic", "French", "English"]
PROFILES = [
    ("Yasmine Trabelsi", "AI engineering student", "Tunis", "ENIT", "Artificial intelligence", "data_ai", "pfe",
     ["Python", "PyTorch", "OpenCV"], AR_FR_EN, "Road traffic detector",
     "Detects cars and pedestrians in dashcam videos with YOLOv8.", ["YOLOv8", "PyTorch"], "approved"),
    ("Mehdi Gharbi", "Full-stack developer", "Tunis", "INSAT", "Software engineering", "software_engineering",
     "internship", ["React", "Node.js", "PostgreSQL"], AR_FR_EN, "Club events site",
     "Event sign-up website for the student club.", ["Next.js"], "approved"),
    ("Ines Bouazizi", "Data science student", "Sfax", "École Nationale d'Ingénieurs de Sfax (ENIS)", "Data science",
     "data_ai", "pfe", ["Python", "PyTorch", "Transformers"], AR_FR_EN, "Tunisian dialect sentiment",
     "Sentiment analysis of Tunisian dialect comments.", ["Hugging Face"], "approved"),
    ("Karim Jlassi", "Network engineer", "Sousse", "ENISo", "Telecommunications", "networks_telecom", "job",
     ["Cisco", "OSPF", "Linux"], AR_FR_EN, "Campus network", "Designed the VLANs of a campus network.",
     ["Packet Tracer"], "approved"),
    ("Amira Ben Salem", "Security student", "Tunis", "ESPRIT", "Cybersecurity", "cybersecurity", "internship",
     ["Kali Linux", "Burp Suite", "Wireshark"], AR_FR_EN, "CTF write-ups",
     "Write-ups of web exploitation challenges.", ["Python"], "approved"),
    ("Omar Haddad", "Embedded systems student", "Monastir", "ENIM", "Electronics", "embedded_iot", "pfe",
     ["C", "STM32", "FreeRTOS"], ["Arabic", "French"], "Smart irrigation",
     "Soil moisture sensors that control a water pump.", ["ESP32", "MQTT"], "approved"),
    ("Salma Mansour", "Junior accountant", "Tunis", "IHEC Carthage", "Accounting", "finance_accounting", "job",
     ["Excel", "Sage"], ["Arabic", "French"], "Budget dashboard",
     "Monthly budget dashboard for a small business.", ["Power BI"], "approved"),
    ("Nour Kefi", "Marketing student", "Tunis", "ISCAE", "Marketing", "marketing_communication", "internship",
     ["SEO", "Canva", "Meta Ads"], AR_FR_EN, "Brand campaign", "Instagram campaign for a local café.",
     ["Canva"], "approved"),
    ("Hamza Chaabane", "Civil engineering student", "Sfax", "ENIS", "Civil engineering", "civil_engineering", "pfe",
     ["AutoCAD", "Revit", "Robot Structural Analysis"], AR_FR_EN, "Bridge design",
     "Steel footbridge design and load calculation.", ["Robot Structural Analysis"], "approved"),
    ("Rania Ayari", "Mechanical engineer", "Sousse", "ENISo", "Mechanical engineering", "mechanical_engineering",
     "job", ["SolidWorks", "ANSYS"], AR_FR_EN, "Gearbox redesign",
     "Lighter gearbox housing for a packaging machine.", ["SolidWorks"], "approved"),
    ("Youssef Mejri", "UI designer", "Tunis", "ESAC", "Graphic design", "design_multimedia", "internship",
     ["Figma", "Illustrator"], AR_FR_EN, "Banking app redesign", "Redesign of a mobile banking app.",
     ["Figma"], "approved"),
    ("Lina Saidi", "Data analyst", "Tunis", "ENIT", "Applied mathematics", "data_ai", "pfe",
     ["Python", "SQL", "scikit-learn"], AR_FR_EN, "Churn prediction",
     "Predicts which telecom customers will leave.", ["pandas"], "approved"),
    ("Aziz Ferchichi", "Java developer", "Ariana", "ESPRIT", "Software engineering", "software_engineering", "job",
     ["Java", "Spring Boot", "Docker"], AR_FR_EN, "Library API", "REST API for a university library.",
     ["Spring Boot"], "approved"),
    ("Sarra Draft", "AI student", "Tunis", "ENIT", "Artificial intelligence", "data_ai", "pfe",
     ["Python", "PyTorch"], AR_FR_EN, "Face detection", "Face detection on webcam images.", ["PyTorch"], "draft"),
    ("Fares Hidden", "AI student", "Tunis", "ENIT", "Artificial intelligence", "data_ai", "pfe",
     ["Python", "PyTorch"], AR_FR_EN, "Plate reader", "Reads licence plates from parking cameras.", ["PyTorch"],
     "hidden"),
    ("Meriem Zouari", "Python developer", "Tunis", "INSAT", "Software engineering", "software_engineering",
     "internship", ["Python", "Django"], ["Arabic", "French"], "Recipe recommender",
     "Recommends recipes from what is in the fridge.", ["PyTorch", "Django"], "approved"),
    ("Wassim Ltaief", "Industrial engineer", "Sfax", "ISGI Sfax", "Industrial engineering",
     "industrial_engineering", "job", ["Lean", "SAP"], AR_FR_EN, "Line balancing",
     "Cut waiting time on an assembly line.", ["Excel"], "approved"),
    ("Eya Hammami", "Machine learning student", "Tunis", "SUP'COM", "Data science", "data_ai", "pfe",
     ["Python", "TensorFlow"], AR_FR_EN, "Speech commands", "Recognises spoken commands in Tunisian Arabic.",
     ["TensorFlow"], "not embedded yet"),
]
PYTORCH = {"Yasmine Trabelsi", "Ines Bouazizi", "Meriem Zouari"}
NEVER = {"Sarra Draft", "Fares Hidden"}


def profile_data(p: tuple) -> dict:
    name, headline, city, school, field, domain, looking_for, skills, langs, project, what, tech, _ = p
    data = {
        "basics": {"name": name, "email": None, "phone": None, "city": city, "country": "Tunisia",
                   "headline": headline, "summary": None, "links": []},
        "availability": None,
        "education": [{"institution": school, "degree": None, "field": field, "start_date": None,
                       "end_date": None, "current": True, "grade": None}],
        "experience": [],
        "projects": [{"name": project, "description": what, "technologies": tech, "url": None, "date": None}],
        "skills": [{"name": s, "category": "technical"} for s in skills],
        "languages": [{"name": lang, "level": None} for lang in langs],
        "certifications": [],
        "classification": {"domain": domain, "seniority": "student", "years_experience": 0},
        "looking_for": looking_for,
    }
    return CandidateProfile.model_validate(data).model_dump(mode="json")


def local_supabase() -> tuple[str, str]:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        status = json.loads(subprocess.run(["supabase", "status", "-o", "json"], capture_output=True, text=True,
                                           timeout=30, check=True, shell=sys.platform == "win32").stdout)
        url, key = status["API_URL"], status["SERVICE_ROLE_KEY"]
    if urlparse(url).hostname not in ("127.0.0.1", "localhost"):
        sys.exit(f"Refusing to load test profiles into {urlparse(url).hostname}: local database only.")
    return url, key


def vector_text(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in values) + "]"


def delete_seed_users(db) -> None:
    page = 1
    while users := db.auth.admin.list_users(page=page, per_page=200):
        for user in users:
            if (user.email or "").endswith("@" + EMAIL_DOMAIN):
                db.auth.admin.delete_user(user.id)  # the tables cascade
        page += 1


def load_profiles(db) -> None:
    for i, p in enumerate(PROFILES, start=1):
        data = profile_data(p)
        status = p[-1]
        user = db.auth.admin.create_user({
            "email": f"seed-{i}@{EMAIL_DOMAIN}", "password": os.urandom(16).hex(), "email_confirm": True,
            "app_metadata": {"role": "candidate"},
        }).user
        row = {
            "user_id": user.id,
            "status": "draft" if status == "draft" else "approved",
            "hidden": status == "hidden",
            "looking_for": data.pop("looking_for"),
            "data": data,
            "approved_at": None if status == "draft" else f"2026-10-{30 - i % 28:02d}T12:00:00Z",
        }
        if status != "not embedded yet":
            text = build_profile_text(CandidateProfile.model_validate({**data, "looking_for": row["looking_for"]}))
            row["embedding"] = vector_text(embed(text, task="document").vector)
        db.table("profiles").insert(row).execute()
        print(f"  loaded {i:2}/{len(PROFILES)} {p[0]} ({status})")


def search(db, query: str, filters: dict | None = None, *, use_embedding: bool = True) -> list[str]:
    embedding = vector_text(embed(query, task="query").vector) if use_embedding and query else None
    rows = db.rpc("search_profiles", {"query_text": query, "query_embedding": embedding,
                                      "filters": filters or {}, "page": 1}).execute().data
    return [r["data"]["basics"]["name"] for r in rows]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--keep", action="store_true", help="leave the profiles in the local database")
    args = parser.parse_args()
    load_env_file()
    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("Missing GEMINI_API_KEY: see the worker block of .env.example")

    from supabase import create_client

    db = create_client(*local_supabase())
    delete_seed_users(db)  # a run stopped half-way leaves its profiles behind
    print("Loading the 18 test profiles with real embeddings...")
    load_profiles(db)

    checks: list[tuple[str, bool, list[str]]] = []

    found = search(db, "PyTorch")
    checks.append(('"PyTorch" finds the profiles that mention PyTorch (words + meaning)',
                   set(found[:3]) == PYTORCH, found[:5]))

    found = search(db, "computer vision")
    checks.append(('"computer vision" finds the object detection profile first',
                   found[:1] == ["Yasmine Trabelsi"], found[:5]))

    found = search(db, "computer vision", use_embedding=False)
    checks.append(('"computer vision" without the embedding (AI down): only word matches, none here',
                   found == [], found[:5]))

    filters = {"domains": ["data_ai"], "looking_for": ["pfe"], "cities": ["Tunis"], "skills": ["python"]}
    found = search(db, "deep learning", filters)
    checks.append(("combined filters: only data_ai + PFE + Tunis + Python profiles, never the draft or hidden one",
                   bool(found) and set(found) <= {"Yasmine Trabelsi", "Lina Saidi", "Eya Hammami"}
                   and not NEVER & set(found), found))

    everyone = search(db, "", use_embedding=False)
    checks.append(("no query: the 16 visible profiles, no draft, no hidden one",
                   len(everyone) == 16 and not NEVER & set(everyone), [str(len(everyone))]))

    print()
    for label, ok, top in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {label}\n      got: {', '.join(top) or '(nothing)'}")

    if args.keep:
        print(f"\nThe profiles stay in the local database (emails *@{EMAIL_DOMAIN}). Run again without --keep to remove them.")
    else:
        delete_seed_users(db)
    return 0 if all(ok for _, ok, _ in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
