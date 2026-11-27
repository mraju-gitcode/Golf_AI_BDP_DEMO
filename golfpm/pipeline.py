"""Orchestration graph (LangGraph StateGraph).

intake -> (ignore | human-owned | follow-up | triage) -> category agent -> output guardrails -> deliver

Design rule from the architecture deck: the workflow owns the process
(what may be sent, round limits, approvals, kill switch); models own the language.
"""
from __future__ import annotations

import re
import threading
import time
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from . import guardrails, store
from .agents import followup, order_status, returns, router, tech_support
from .agents.common import PO_RE, decision, summarize
from .config import get_config
from .intake import content_hash, normalize_subject, run_intake
from .triage import run_triage

PIPELINE_LOCK = threading.RLock()
AGENT_CATEGORIES = (1, 2, 3)


class State(TypedDict, total=False):
    email: dict
    intake: dict
    case: dict
    triage: dict
    followup: dict
    decision: dict
    guard: list
    next: str
    started: float
    is_new_case: bool


def _log(state: State, step: str, title: str, detail: dict | None = None):
    store.log(state["case"]["id"] if state.get("case") else None, state["email"]["id"], step, title, detail)


# ---------------- nodes ----------------
def node_intake(state: State) -> State:
    email = state["email"]
    intake = run_intake(email)
    state["intake"] = intake
    email["content_hash"] = content_hash(email["from"], email["subject"], email["body"])

    dup = store.find_duplicate(email["content_hash"])
    case = None
    if email.get("thread_id"):
        case = store.case_by_thread(email["thread_id"])
    if case is None and re.match(r"^\s*(re|automatic reply|auto reply)\s*:", email["subject"], re.I):
        for c in store.list_cases():
            if normalize_subject(c["subject"]) == normalize_subject(email["subject"]) and (
                    c["account_id"] == intake["sender"]["account_id"] or c["sender"] == email["from"]):
                case = c
                break
    if dup and case is None:
        case = store.get_case(dup["case_id"]) if dup.get("case_id") else None
    if case is None:
        email["thread_id"] = email.get("thread_id") or f"THR-{email['id']}"
        case = store.create_case(email["thread_id"], email["from"], email["subject"], intake["sender"]["account_id"])
        state["is_new_case"] = True
    else:
        email["thread_id"] = case["thread_id"]
    email["case_id"] = case["id"]
    state["case"] = case
    store.save_email(email)  # saved after the duplicate check so it does not match itself

    _log(state, "intake", "Email received", {"from": email["from"], "subject": email["subject"],
                                             "case": case["id"], "thread": case["thread_id"]})
    _log(state, "intake", f"Sender check: {intake['sender']['status']}", intake["sender"])
    if intake["links"]:
        _log(state, "intake", f"{len(intake['links'])} link(s) found and NOT opened (policy G-A5)", {"links": intake["links"]})
    if intake["attachments"]:
        _log(state, "intake", "Attachment screening", {"attachments": intake["attachments"]})
    if intake["pii_masked"]:
        _log(state, "intake", "Sensitive data masked before any model or log", {"masked": intake["pii_masked"]})
    if intake["injections"]:
        _log(state, "intake", "Injected instructions detected and removed (treated as data)", {"removed": intake["injections"]})

    case["data"].setdefault("history", []).append({"from_party": "customer", "excerpt": summarize(email, intake["model_text"], 160)})

    if dup:
        state["decision"] = decision("ignore", f"Duplicate of email {dup['id']} received earlier; one case, one reply")
        state["next"] = "deliver"
    elif intake["auto_reply"]:
        state["decision"] = decision("ignore", "Automatic reply: ignored, case kept open, not counted as a round")
        state["next"] = "deliver"
    elif not state.get("is_new_case") and case["human_owned"]:
        state["decision"] = decision("review", "A CSR owns this thread: agent stays out and passes the email to them (G-Q13)",
                                     forward={"to": case["data"].get("owner_csr", "Assigned CSR"), "summary": summarize(email, intake["model_text"])})
        state["next"] = "deliver"
    elif not state.get("is_new_case") and case["category"] in AGENT_CATEGORIES and case["status"] not in ("closed",):
        state["next"] = "followup"
    elif not state.get("is_new_case") and case["category"]:
        owner = get_config()["categories"][str(case["category"])]["owner"]
        state["triage"] = {"category": case["category"], "confidence": 1.0, "method": "thread", "reasoning": "Reply on a routed case"}
        state["decision"] = decision("route", f"Reply on a routed case: forwarded to {owner}",
                                     forward={"to": owner, "summary": summarize(email, intake["model_text"])})
        state["next"] = "deliver"
    else:
        state["next"] = "triage"
    return state


def node_followup(state: State) -> State:
    case, email, intake = state["case"], state["email"], state["intake"]
    res = followup.assess(email, intake, case)
    state["followup"] = res
    _log(state, "followup", "Follow-up agent: reply joins open case, triage skipped", {"reason": res["reason"], "rounds_so_far": case["rounds"]})
    if res["decision"]:
        state["triage"] = {"category": case["category"], "confidence": 1.0, "method": "thread", "reasoning": res["reason"]}
        state["decision"] = res["decision"]
        state["next"] = "guard"
        return state
    cat = res["route_to"]
    if cat != case["category"]:
        _log(state, "followup", f"Case moved from category {case['category']} to {cat}")
    state["triage"] = {"category": cat, "confidence": 1.0, "method": "thread", "reasoning": res["reason"],
                       "force_escalate": res.get("force_escalate", False)}
    state["next"] = "agent"
    return state


def node_triage(state: State) -> State:
    intake = state["intake"]
    res = run_triage(intake["model_text"], state["email"]["subject"])
    state["triage"] = res
    _log(state, "triage", f"Category {res['category']} ({get_config()['categories'][str(res['category'])]['short']}), confidence {res['confidence']}", res)
    cfg = get_config()
    cat = res["category"]
    if res["confidence"] < cfg["confidence_threshold"]:
        state["decision"] = decision("review", f"Confidence {res['confidence']} below threshold {cfg['confidence_threshold']}: CSR picks the category (FR-07)",
                                     forward={"to": "GolfPM CSR review queue", "summary": summarize(state["email"], intake["model_text"])})
        state["next"] = "deliver"
    elif cat in AGENT_CATEGORIES and intake["sender"]["status"] == "internal":
        state["decision"] = decision("review", "Internal sender on an agent category: drafted for a CSR, nothing sent to the end customer (G-Q7)",
                                     forward={"to": "GolfPM CSR review queue", "summary": summarize(state["email"], intake["model_text"])})
        state["next"] = "agent_draft"
    elif cat in AGENT_CATEGORIES and set(intake["flags"]) - {"lookalike_domain"}:
        state["decision"] = decision("review", f"Suspicious content ({', '.join(intake['flags'])}): no automated reply, CSR reviews",
                                     forward={"to": "GolfPM CSR review queue + Security", "summary": summarize(state["email"], intake["model_text"])})
        state["next"] = "deliver"
    else:
        state["next"] = "agent"
    return state


def _run_agent(state: State) -> dict:
    email, intake, case, tri = state["email"], state["intake"], state["case"], state["triage"]
    cat = tri["category"]
    if cat == 1:
        return order_status.handle(email, intake, tri, case)
    if cat == 2:
        return returns.handle(email, intake, tri, case)
    if cat == 3:
        if tri.get("force_escalate"):
            case["rounds"] = max(case["rounds"], get_config()["tech_support_max_rounds"])
        return tech_support.handle(email, intake, tri, case)
    return router.handle(email, intake, tri, case)


def node_agent(state: State) -> State:
    d = _run_agent(state)
    state["decision"] = d
    cat = state["triage"]["category"]
    names = {1: "Order status agent", 2: "Returns agent", 3: "Tech support agent"}
    _log(state, "agent", f"{names.get(cat, 'Route tool')}: {d['action']}", {"reason": d["reason"], "sources": d["sources"]})
    state["next"] = "guard"
    return state


def node_agent_draft(state: State) -> State:
    """Internal sender: the agent drafts an answer, but it goes to a CSR only."""
    review = state["decision"]
    draft = _run_agent(state)
    review["customer_reply"] = None
    review["draft_for_csr"] = draft.get("customer_reply")
    review["sources"] = draft.get("sources", [])
    _log(state, "agent", "Draft prepared for CSR (internal sender)", {"draft_action": draft["action"], "sources": draft["sources"]})
    state["next"] = "deliver"
    return state


def node_guard(state: State) -> State:
    d = state["decision"]
    msg = (d.get("customer_reply") or {}).get("body")
    results = guardrails.check(msg, d) if msg else []
    if d.get("approval"):
        results += [dict(r, check="Proposed reply: " + r["check"]) for r in guardrails.check(d["approval"]["proposed_reply"], {"checks": {}})]
    state["guard"] = results
    failed = [r for r in results if not r["passed"]]
    if results:
        _log(state, "guardrails", "Output checks " + ("passed" if not failed else f"FAILED: {', '.join(r['check'] for r in failed)}"), {"results": results})
    if failed:
        d["blocked_reply"] = d.get("customer_reply")
        d["customer_reply"] = None
        d["action_before_block"] = d["action"]
        d["action"] = "review"
        d["reason"] = "Blocked by output checks; sent to CSR review"
    state["next"] = "deliver"
    return state


def node_deliver(state: State) -> State:
    cfg = get_config()
    email, case, d = state["email"], state["case"], state["decision"]
    tri = state.get("triage") or {}
    cat = tri.get("category") or case.get("category")
    eid, cid = email["id"], case["id"]
    sent_subject = email["subject"] if email["subject"].lower().startswith("re:") else f"RE: {email['subject']}"
    mode = cfg["categories"][str(cat)]["mode"] if cat else "draft"
    recipient = email["from"] + (", " + ", ".join(email.get("cc", [])) if cfg.get("reply_to_cc") and email.get("cc") else "")

    if cfg["kill_switch"] and d["action"] not in ("ignore", "file"):
        owner = cfg["categories"][str(cat)]["owner"] if cat else "GolfPM CSR review queue"
        store.add_outbox(cid, eid, "forward", owner, f"FW: {email['subject']}",
                         "KILL SWITCH ON: agent did not act. Original email forwarded unchanged.\n\n" + email["body"], "sent")
        d = dict(d, action="human", reason="Kill switch on: all email goes to people (FR-17)")
        state["decision"] = d
        _log(state, "deliver", "Kill switch: forwarded to a person, no agent reply")
    else:
        if d.get("customer_reply"):
            status = "sent" if mode == "send" else "pending_review"
            kind = d["customer_reply"]["kind"]
            store.add_outbox(cid, eid, "reply", recipient, sent_subject, d["customer_reply"]["body"], status,
                             {"reply_kind": kind, "category": cat, "checks": state.get("guard", []), "sources": d.get("sources", [])})
            if kind in ("answer", "ask", "verification"):
                case["rounds"] += 1
            case["data"]["history"].append({"from_party": "agent", "excerpt": " ".join(d["customer_reply"]["body"].split())[:160]})
            _log(state, "deliver", "Reply " + ("sent to customer" if status == "sent" else "saved as draft for CSR review") + f" ({mode} mode)",
                 {"to": recipient})
        if d.get("blocked_reply"):
            store.add_outbox(cid, eid, "reply", recipient, sent_subject, d["blocked_reply"]["body"], "pending_review",
                             {"blocked": True, "checks": state.get("guard", []), "category": cat})
            _log(state, "deliver", "Blocked reply placed in CSR review queue")
        if d.get("draft_for_csr"):
            store.add_outbox(cid, eid, "reply", recipient, sent_subject, d["draft_for_csr"]["body"], "pending_review",
                             {"internal_sender": True, "category": cat, "sources": d.get("sources", [])})
        if d.get("approval"):
            store.add_outbox(cid, eid, "approval", d["approval"]["to"], f"Approve warranty determination: {email['subject']}",
                             d["approval"]["summary"], "pending_approval",
                             {"proposed_reply": d["approval"]["proposed_reply"], "customer": email["from"], "subject": sent_subject})
            _log(state, "deliver", "Teams approval card sent to CSR (approve / edit / reject)")
        if d.get("forward"):
            body = d["forward"]["summary"] + "\n\n--- Original email (attachments forwarded unchanged) ---\n" + state["intake"]["masked_body"]
            store.add_outbox(cid, eid, "forward", d["forward"]["to"], f"FW: {email['subject']}", body, "sent",
                             {"attachments": [a["name"] for a in state["intake"]["attachments"] if a["status"] != "quarantined"]})
            _log(state, "deliver", f"Forwarded to {d['forward']['to']}")
        for teams in (d.get("teams"), d.get("extra_teams")):
            if teams:
                store.add_outbox(cid, eid, "teams", teams["to"], "Teams notification", teams["text"] + f"\nCase {cid}", "sent")
                _log(state, "deliver", f"Teams notification to {teams['to']}")
        if d.get("child_case"):
            cc = d["child_case"]
            child = store.create_case(f"{case['thread_id']}-C2", email["from"], f"[split] {email['subject']}", case["account_id"])
            child.update(category=cc["category"], status="routed")
            child["data"]["parent_case"] = cid
            store.save_case(child)
            owner = cfg["categories"][str(cc["category"])]["owner"]
            store.add_outbox(child["id"], eid, "forward", owner, f"FW: {email['subject']}", cc["summary"], "sent")
            _log(state, "deliver", f"Second request split into case {child['id']} and routed to {owner} (G-A1)")
        if d["action"] in ("ignore", "file"):
            _log(state, "deliver", "No reply sent (" + d["action"] + ")")

    if cat and d["action"] != "ignore":
        case["category"] = cat
    if d.get("case_status"):
        case["status"] = d["case_status"]
    elif d["action"] in ("review",):
        case["status"] = "in_review"
    elif d["action"] == "file":
        case["status"] = "closed"
    elif d["action"] == "human":
        case["status"] = "with_people"
    if cat == 7:
        case["data"]["po_numbers"] = sorted(set(case["data"].get("po_numbers", [])) | {m.group(1) for m in PO_RE.finditer(email["body"])})
    store.save_case(case)

    result = {"action": d["action"], "reason": d["reason"], "category": cat if d["action"] != "ignore" else None,
              "confidence": tri.get("confidence"), "method": tri.get("method"), "mode": mode,
              "guardrails_passed": all(r["passed"] for r in state.get("guard", [])),
              "duration_ms": int((time.time() - state["started"]) * 1000)}
    email["result"] = result
    store.save_email(email)
    store.log(cid, eid, "result", f"Outcome: {d['action']}", result)
    return state


def _route(state: State) -> str:
    return state["next"]


def build_graph():
    g = StateGraph(State)
    g.add_node("intake", node_intake)
    g.add_node("followup", node_followup)
    g.add_node("triage", node_triage)
    g.add_node("agent", node_agent)
    g.add_node("agent_draft", node_agent_draft)
    g.add_node("guard", node_guard)
    g.add_node("deliver", node_deliver)
    g.set_entry_point("intake")
    g.add_conditional_edges("intake", _route, {"deliver": "deliver", "followup": "followup", "triage": "triage"})
    g.add_conditional_edges("followup", _route, {"guard": "guard", "agent": "agent"})
    g.add_conditional_edges("triage", _route, {"deliver": "deliver", "agent": "agent", "agent_draft": "agent_draft"})
    g.add_edge("agent", "guard")
    g.add_edge("agent_draft", "deliver")
    g.add_edge("guard", "deliver")
    g.add_edge("deliver", END)
    return g.compile()


GRAPH = build_graph()


def process_email(raw: dict[str, Any]) -> dict:
    """Run one inbound email through the graph. Returns the stored email with its result."""
    email = {
        "id": raw.get("id") or store.new_id("EML"),
        "received_at": time.time(),
        "from": raw["from"].strip(),
        "from_name": raw.get("from_name", ""),
        "cc": raw.get("cc", []),
        "subject": raw.get("subject", ""),
        "body": raw.get("body", ""),
        "attachments": raw.get("attachments", []),
        "thread_id": raw.get("thread_id"),
        "test_id": raw.get("test_id"),
    }
    with PIPELINE_LOCK:
        GRAPH.invoke({"email": email, "started": time.time()})
    return store.get_email(email["id"])
