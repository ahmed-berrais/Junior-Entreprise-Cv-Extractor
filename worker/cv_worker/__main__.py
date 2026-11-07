"""Entry point: `python -m cv_worker`. Runs forever; `--once` runs every job that is ready, then exits.

The loop itself is in jobs.py (S1-24): claim the next job, run it, mark it done or failed.
"""

import json
import logging
import os
import sys
import time

from cv_worker import usage
from cv_worker.extract_one import load_env_file
from cv_worker.jobs import SupabaseStore, process_ready, run_pending

POLL_SECONDS = 3
REQUIRED = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")

log = logging.getLogger("cv_worker")


def main() -> int:
    load_env_file()
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    # The HTTP library logs every URL, and storage URLs carry the candidate's id: keep it quiet.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    missing = [name for name in REQUIRED if not os.environ.get(name)]
    if missing:
        print(f"Missing {', '.join(missing)}: see the worker block of .env.example", file=sys.stderr)
        return 2

    store = SupabaseStore.from_env()
    usage.install(store.count_usage)  # S3-10: every Gemini call is counted for the admin overview
    print("worker started", flush=True)
    if "--once" in sys.argv:
        run_pending(store)
        return 0

    store.requeue_stuck()  # jobs a crash left in "processing" go back in line
    while True:
        try:
            ran = process_ready(store)
        except Exception as e:  # noqa: BLE001 (the database was unreachable: wait and try again)
            log.error(json.dumps({"event": "queue_unreachable", "error": type(e).__name__}))
            ran = 0
        if not ran:
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    sys.exit(main())
