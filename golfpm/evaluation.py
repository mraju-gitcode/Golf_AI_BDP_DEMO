"""Evaluation harness over the labelled test set (design canvas questions E1-E4).

Each test case runs in a clean evaluation database (not the demo mailbox),
after replaying the emails it depends on (earlier messages in its thread or
the original of a duplicate). Scores:
  E1 category correct, E2/E3 correct action (act on 1-3, route 4-9),
  E4 every customer-facing message passed the output checks.
"""
from __future__ import annotations

import json
import os
import time
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor

from . import store
from .config import DATA, RUNTIME, get_config, reset_config, save_config
from .pipeline import PIPELINE_LOCK, process_email


def load_cases(name: str = "test_cases.json") -> list[dict]:
    """Scenarios from the test-scenario metadata DB (validated set by default)."""
    from . import scenarios
    return scenarios.load_cases(scenarios.FILE_TO_SET.get(name, "validated"))


def _raw(tc: dict, thread_ids: dict) -> dict:
    raw = {"from": tc["from"], "subject": tc["subject"], "body": tc["body"], "cc": tc.get("cc", []),
           "attachments": tc.get("attachments", []), "test_id": tc["id"]}
    if tc.get("thread_of") and tc["thread_of"] in thread_ids:
        raw["thread_id"] = thread_ids[tc["thread_of"]]
    return raw


def _chain(tc: dict, by_id: dict) -> list[dict]:
    chain, cur = [], tc
    while cur.get("thread_of") or cur.get("duplicate_of"):
        cur = by_id[cur.get("thread_of") or cur.get("duplicate_of")]
        chain.insert(0, cur)
    return chain


def run_case(tc: dict, by_id: dict) -> dict:
    store.reset()
    thread_ids: dict[str, str] = {}
    for parent in _chain(tc, by_id):
        e = process_email(_raw(parent, thread_ids))
        thread_ids[parent["id"]] = e["thread_id"]
    if tc.get("seed_rounds"):
        case = store.case_by_thread(thread_ids[tc["thread_of"]])
        case["rounds"] = max(case["rounds"], tc["seed_rounds"])
        store.save_case(case)
    email = process_email(_raw(tc, thread_ids))
    res = email["result"]
    exp = tc["expected"]
    out_msgs = store.outbox_for_email(email["id"])
    cat_ok = exp["category"] is None or res["category"] == exp["category"]
    act_ok = res["action"] == exp["action"]
    guard_ok = res["guardrails_passed"]
    return {
        "id": tc["id"], "type": tc["type"], "scenario": tc["scenario"],
        "expected_category": exp["category"], "predicted_category": res["category"],
        "expected_action": exp["action"], "predicted_action": res["action"],
        "confidence": res["confidence"], "method": res["method"], "reason": res["reason"],
        "category_ok": cat_ok, "action_ok": act_ok, "guardrails_ok": guard_ok,
        "passed": cat_ok and act_ok and guard_ok,
        "messages": [{"kind": m["kind"], "to": m["recipient"], "status": m["status"]} for m in out_msgs],
        "open_items": tc.get("open_items", ""),
    }


def _worker_init():
    # Each worker process gets its own evaluation database.
    store.set_db(f"golfpm_eval_{os.getpid()}.db")


def _worker_run(args):
    tc, by_id = args
    return run_case(tc, by_id)


def run(case_file: str = "test_cases.json", only: list[str] | None = None, workers: int | None = None) -> dict:
    """Run the test set. Cases run in parallel worker processes (each with its own DB),
    so an LLM-mode run takes about a minute instead of several."""
    cases = load_cases(case_file)
    by_id = {c["id"]: c for c in cases}
    selected = [tc for tc in cases if not only or tc["id"] in only]
    workers = workers or int(os.environ.get("GOLFPM_EVAL_WORKERS", "8"))
    started = time.time()
    with PIPELINE_LOCK:
        saved_cfg = get_config()
        try:
            reset_config()  # evaluate against the default config, kill switch off
            for old in RUNTIME.glob("golfpm_eval_*.db"):
                old.unlink(missing_ok=True)
            if workers > 1 and len(selected) > 1:
                with ProcessPoolExecutor(max_workers=min(workers, len(selected)), initializer=_worker_init) as pool:
                    results = list(pool.map(_worker_run, [(tc, by_id) for tc in selected]))
            else:
                prev_db = store.set_db("golfpm_eval.db")
                try:
                    results = [run_case(tc, by_id) for tc in selected]
                finally:
                    store.set_db(prev_db)
        finally:
            save_config(saved_cfg)
    by_cat = defaultdict(lambda: {"total": 0, "passed": 0})
    for r in results:
        key = str(r["expected_category"]) if r["expected_category"] else "none"
        by_cat[key]["total"] += 1
        by_cat[key]["passed"] += r["passed"]
    from . import scenarios
    scenarios.record_results(results, results[0]["method"] if results else None)
    n = len(results) or 1
    summary = {
        "total": len(results),
        "passed": sum(r["passed"] for r in results),
        "routing_accuracy": round(sum(r["category_ok"] for r in results) / n, 3),
        "action_accuracy": round(sum(r["action_ok"] for r in results) / n, 3),
        "guardrail_pass_rate": round(sum(r["guardrails_ok"] for r in results) / n, 3),
        "safety_cases_passed": f"{sum(r['passed'] for r in results if r['type'] in ('Safety', 'Red team'))}/"
                               f"{sum(1 for r in results if r['type'] in ('Safety', 'Red team'))}",
        "by_category": dict(by_cat),
        "seconds": round(time.time() - started, 1),
        "method": results[0]["method"] if results else None,
    }
    return {"summary": summary, "results": results}


if __name__ == "__main__":
    import sys
    out = run(sys.argv[1] if len(sys.argv) > 1 else "test_cases.json")
    for r in out["results"]:
        mark = "PASS" if r["passed"] else "FAIL"
        print(f"{mark} {r['id']:6} cat {r['predicted_category']}/{r['expected_category']} "
              f"act {r['predicted_action']}/{r['expected_action']} conf {r['confidence']} | {r['reason']}")
    print(json.dumps(out["summary"], indent=2))
