"""REST API for the demo UI (the Google AI Studio front end calls these).

Run:  uvicorn golfpm.api:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
from __future__ import annotations

import time
from collections import Counter

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import documents, evaluation, knowledge, store, synthetic
from .config import ROOT, get_config, llm_enabled, reset_config, update_config
from .llm import mode_label
from .pipeline import PIPELINE_LOCK, process_email

app = FastAPI(title="GolfPM Email Agent - local demo", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Attachment(BaseModel):
    name: str
    type: str = "application/pdf"
    form: str | None = None
    extracted_fields: dict | None = None


class InboundEmail(BaseModel):
    from_: str = Field(..., alias="from")
    subject: str
    body: str
    cc: list[str] = []
    attachments: list[Attachment] = []
    thread_id: str | None = None
    model_config = {"populate_by_name": True}


class ReviewAction(BaseModel):
    decision: str = Field(..., pattern="^(approve|edit|reject)$")
    body: str | None = None
    note: str = ""


class TakeOver(BaseModel):
    csr: str = "GolfPM CSR"


def _email_detail(email: dict) -> dict:
    return {**email, "trace": store.events_for_email(email["id"]), "outbox": store.outbox_for_email(email["id"])}


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": mode_label(), "llm": llm_enabled()}


# ---------- inbound mail ----------
@app.post("/api/emails")
def send_email(msg: InboundEmail):
    raw = msg.model_dump(by_alias=True)
    raw["attachments"] = [a for a in raw["attachments"]]
    return _email_detail(process_email(raw))


@app.get("/api/emails")
def list_emails():
    return store.list_emails()


@app.get("/api/emails/{email_id}")
def get_email(email_id: str):
    email = store.get_email(email_id)
    if not email:
        raise HTTPException(404, "email not found")
    return _email_detail(email)


@app.get("/api/test-cases")
def test_cases(file: str = "test_cases.json"):
    return evaluation.load_cases(file)


@app.post("/api/test-cases/{case_id}/send")
def send_test_case(case_id: str, file: str = "test_cases.json"):
    """Drop a test-case email into the live demo mailbox. Follow-ups join the thread of their parent."""
    cases = {c["id"]: c for c in evaluation.load_cases(file)}
    tc = cases.get(case_id)
    if not tc:
        raise HTTPException(404, "test case not found")
    raw = {"from": tc["from"], "subject": tc["subject"], "body": tc["body"], "cc": tc.get("cc", []),
           "attachments": tc.get("attachments", []), "test_id": tc["id"]}
    parent = tc.get("thread_of")
    if parent:
        prior = [e for e in store.list_emails() if e.get("test_id") == parent]
        if not prior:
            raise HTTPException(409, f"Send {parent} first; {case_id} is a reply in that thread")
        raw["thread_id"] = prior[0]["thread_id"]
        if tc.get("seed_rounds"):
            case = store.case_by_thread(raw["thread_id"])
            case["rounds"] = max(case["rounds"], tc["seed_rounds"])
            store.save_case(case)
    return _email_detail(process_email(raw))


# ---------- cases ----------
@app.get("/api/cases")
def list_cases():
    return store.list_cases()


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    case = store.get_case(case_id)
    if not case:
        raise HTTPException(404, "case not found")
    emails = [e for e in store.list_emails() if e["case_id"] == case_id]
    return {**case, "emails": sorted(emails, key=lambda e: e["received_at"]), "trace": store.events_for_case(case_id),
            "outbox": [m for m in store.list_outbox() if m["case_id"] == case_id]}


@app.post("/api/cases/{case_id}/takeover")
def take_over(case_id: str, body: TakeOver):
    """A CSR takes the thread over; the agent stays out of it from now on (G-Q13)."""
    case = store.get_case(case_id)
    if not case:
        raise HTTPException(404, "case not found")
    case["human_owned"] = 1
    case["status"] = "with_people"
    case["data"]["owner_csr"] = body.csr
    store.save_case(case)
    store.log(case_id, None, "human", f"{body.csr} took over the thread; agent will not reply on it")
    return case


# ---------- CSR review queue ----------
@app.get("/api/review-queue")
def review_queue():
    cfg = get_config()
    items = store.list_outbox("pending_review") + store.list_outbox("pending_approval")
    now = time.time()
    for m in items:
        cat = (m["meta"] or {}).get("category") or (store.get_case(m["case_id"]) or {}).get("category")
        sla = cfg["categories"][str(cat)]["sla_minutes"] if cat else 60
        m["category"] = cat
        m["age_minutes"] = round((now - m["ts"]) / 60, 1)
        m["sla_minutes"] = sla
        m["overdue"] = m["age_minutes"] > sla
    return sorted(items, key=lambda m: m["ts"])


@app.post("/api/review/{item_id}")
def review(item_id: str, action: ReviewAction):
    item = store.get_outbox(item_id)
    if not item or item["status"] not in ("pending_review", "pending_approval"):
        raise HTTPException(404, "no pending item with that id")
    rating = {"approve": "good", "edit": "edited", "reject": "wrong"}[action.decision]
    store.add_feedback(item_id, rating, action.note)  # FR-19: feeds the evaluation set
    if item["kind"] == "approval":
        if action.decision == "reject":
            store.update_outbox(item_id, status="rejected")
            store.log(item["case_id"], item["email_id"], "human", "CSR rejected the warranty determination", {"note": action.note})
        else:
            body = action.body or item["meta"]["proposed_reply"]
            store.update_outbox(item_id, status="approved")
            store.add_outbox(item["case_id"], item["email_id"], "reply", item["meta"]["customer"], item["meta"]["subject"],
                             body, "sent", {"reply_kind": "determination", "approved_by_csr": True})
            store.log(item["case_id"], item["email_id"], "human", "CSR approved the determination; reply sent")
        _set_case_status(item["case_id"], "closed" if action.decision != "reject" else "with_people")
        return store.get_outbox(item_id)
    if action.decision == "reject":
        store.update_outbox(item_id, status="rejected")
        store.log(item["case_id"], item["email_id"], "human", "CSR rejected the draft", {"note": action.note})
    else:
        store.update_outbox(item_id, status="sent", body=action.body or item["body"],
                            meta={**item["meta"], "sent_by_csr": True, "edited": action.decision == "edit"})
        store.log(item["case_id"], item["email_id"], "human", f"CSR {'edited and ' if action.decision == 'edit' else ''}sent the draft")
    return store.get_outbox(item_id)


def _set_case_status(case_id: str, status: str):
    case = store.get_case(case_id)
    if case:
        case["status"] = status
        store.save_case(case)


@app.get("/api/outbox")
def outbox():
    return store.list_outbox()


# ---------- admin ----------
@app.get("/api/metrics")
def metrics():
    cfg = get_config()
    emails = [e for e in store.list_emails() if e.get("result")]
    results = [e["result"] for e in emails]
    actions = Counter(r["action"] for r in results)
    by_cat = Counter(str(r["category"]) for r in results if r["category"])
    handled = sum(1 for r in results if r["category"] in (1, 2, 3) and r["action"] in ("reply", "ask", "approval"))
    queue = review_queue()
    feedback = Counter(f["rating"] for f in store.list_feedback())
    durations = [r["duration_ms"] for r in results]
    return {
        "mode": mode_label(),
        "kill_switch": cfg["kill_switch"],
        "emails": len(results),
        "cases": len(store.list_cases()),
        "by_category": {k: {"name": cfg["categories"][k]["short"], "count": by_cat.get(k, 0)} for k in cfg["categories"]},
        "actions": dict(actions),
        "agent_handled": handled,
        "routed": actions.get("route", 0),
        "escalated": actions.get("escalate", 0),
        "ignored_or_filed": actions.get("ignore", 0) + actions.get("file", 0),
        "review_queue": len(queue),
        "overdue": sum(1 for q in queue if q["overdue"]),
        "guardrail_blocks": sum(1 for r in results if not r["guardrails_passed"]),
        "avg_processing_ms": round(sum(durations) / len(durations)) if durations else 0,
        "csr_feedback": dict(feedback),
    }


@app.get("/api/config")
def read_config():
    return get_config()


@app.put("/api/config")
def write_config(patch: dict):
    return update_config(patch)


@app.post("/api/reset")
def reset_demo(config: bool = False):
    with PIPELINE_LOCK:
        store.reset()
        if config:
            reset_config()
    return {"status": "reset"}


@app.post("/api/evaluation/run")
def run_evaluation(file: str = "test_cases.json"):
    return evaluation.run(file)


@app.post("/api/synthetic/generate")
def generate_synthetic(per_category: int = 10, total: int | None = None, use_llm: bool | None = None):
    """Story-driven synthetic emails, weighted like the real mailbox (order status most common).
    Written by the model when a key is configured, unless use_llm=false."""
    use = llm_enabled() if use_llm is None else use_llm
    n = total or per_category * 9
    return {"written": synthetic.write(n, use), "file": "synthetic_cases.json", "llm": use and llm_enabled()}


@app.get("/api/kb/search")
def kb_search(q: str):
    return knowledge.search(q, k=5)


@app.get("/api/documents")
def list_documents():
    """Synthetic document library (the files the client referenced), with how the agent may use each."""
    docs = documents.load_manifest() or documents.build()
    return {"documents": docs,
            "stats": {"total": len(docs), "indexed": sum(d["indexed"] for d in docs),
                      "public": sum(d["audience"] == "public" for d in docs),
                      "internal": sum(d["audience"] == "internal" for d in docs)}}


@app.get("/api/documents/file/{path:path}")
def document_file(path: str):
    base = documents.OUT.resolve()
    target = (base / path).resolve()
    if base not in target.parents or not target.is_file():
        raise HTTPException(404, "document not found")
    return FileResponse(target, filename=target.name)


web = ROOT / "web"            # classic console (no build step)
ui_dist = ROOT / "ui" / "dist"  # AI Studio UI, built with `npm run build` in ui/

if web.exists():
    app.mount("/static", StaticFiles(directory=web), name="static")

    @app.get("/classic")
    def classic():
        return FileResponse(web / "index.html")

if (ui_dist / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=ui_dist / "assets"), name="ui-assets")

    @app.get("/")
    def index():
        return FileResponse(ui_dist / "index.html")
elif web.exists():
    @app.get("/")
    def index():
        return FileResponse(web / "index.html")
