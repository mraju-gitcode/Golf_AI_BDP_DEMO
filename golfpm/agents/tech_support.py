"""Category 3: Tech support agent (the only open-ended loop, capped by the workflow).

Answers only from approved, public sources and cites them. Safety issues are
never troubleshot. The round limit is enforced in code, not by the model.
"""
from __future__ import annotations

import re

from ..config import get_config
from .. import knowledge, llm
from .common import decision, reply, summarize, wrap_reply

HARD_SAFETY_RE = re.compile(r"\b(burning smell|smoke|smoking|sparks?|on fire|electric(al)? shock|exposed wir|lightning (hit|struck|strike))\b", re.I)
SOFT_SAFETY_RE = re.compile(r"\b(storm|lightning|surge|power outage)\b", re.I)
PRODUCT_RE = re.compile(r"\b(rotors?|decoders?|controllers?|valves?|nozzles?|stations?|cirruspro|heads?|turret|arc|program)\b", re.I)
SYMPTOM_RE = re.compile(r"\b(rotat|pop|stuck|won'?t|doesn'?t|don'?t|isn'?t|aren'?t|not (run|turn|come|respond|activat|work)|"
                        r"none of|come on|turn on|respond|activat|fail|dead|offline|error|fault|adjust|create|set ?up|leak|noise|pressure|arc|program)\w*", re.I)
MIN_SCORE = 0.25


def answer_from_sources(text: str) -> tuple[str | None, list[dict]]:
    hits = [h for h in knowledge.search(text, k=2, audience="public") if h["score"] >= MIN_SCORE]
    if not hits:
        return None, []
    top = hits[0]
    steps = top["text"]
    base = (f"Based on our {top['title']} ({top['heading']}), please try the following:\n\n{steps}\n\n"
            f"Source: {top['title']}, section \"{top['heading']}\": {top['source_url']}\n\n"
            "If this does not resolve the issue, reply to this email with the model, what you observed at each step, "
            "and a photo if possible.")
    try:
        drafted = llm.write("Write a concise troubleshooting reply using ONLY the steps in the source text. "
                            "End with the exact 'Source:' line given. Ask the customer to reply if it does not help.",
                            f"Customer question: {text}\n\nApproved source:\n{base}")
    except Exception:
        drafted = None
    body = drafted if drafted and top["source_url"] in drafted else base
    return body, [{"title": top["title"], "section": top["heading"], "url": top["source_url"], "score": top["score"]}]


def handle(email: dict, intake: dict, triage: dict, case: dict, followup: bool = False) -> dict:
    text = intake["model_text"]
    cfg = get_config()
    owner = cfg["categories"]["3"]["owner"]
    sender = intake["sender"]

    if HARD_SAFETY_RE.search(text):
        return decision("escalate", "Safety hazard indicated (T-A5, T-Q6): no troubleshooting",
                        customer_reply=reply("ack", wrap_reply(email,
                            "For your safety, please do not reset, open or work on the equipment, and keep people away "
                            "from it. A technical specialist has been notified and will contact you as a priority.")),
                        forward={"to": owner, "summary": "URGENT SAFETY: " + summarize(email, text)},
                        teams={"to": owner, "text": f"URGENT safety escalation from {sender['account_name']}"},
                        case_status="escalated", checks={"no_steps": True})

    if intake["language"] != cfg["reply_language"]:
        return decision("route", f"Email language '{intake['language']}' not supported at launch (G-Q4)",
                        forward={"to": "GolfPM CSR (language support)", "summary": summarize(email, text)},
                        teams={"to": "GolfPM CSR", "text": f"Non-English tech question ({intake['language']})"},
                        case_status="routed")

    max_rounds = cfg["tech_support_max_rounds"]
    if case["rounds"] >= max_rounds:
        return decision("escalate", f"Round limit reached ({case['rounds']}/{max_rounds}) (FR-13)",
                        customer_reply=reply("ack", wrap_reply(email, "Thank you for working through these steps with us. "
                                                         "A technical specialist will review the full history and contact you directly.")),
                        forward={"to": owner, "summary": _thread_summary(case, text)},
                        teams={"to": owner, "text": "Tech support escalation after round limit"},
                        case_status="escalated", checks={"no_steps": True})

    if not (PRODUCT_RE.search(text) and SYMPTOM_RE.search(text)):
        body = ("Thank you for your email. So we can help, please reply with:\n\n"
                "1. The product and model (for example rotor, decoder, controller or CirrusPRO), and the model number if you have it.\n"
                "2. What is happening (the symptom) and when it started.\n"
                "3. Where on the course it occurs and how many heads or stations are affected.")
        return decision("ask", "Not enough detail to search the approved sources", customer_reply=reply("ask", wrap_reply(email, body)),
                        case_status="awaiting_customer", round_counts=True)

    body, sources = answer_from_sources(text)
    if not body:
        return decision("route", "No approved source covers this question; routed rather than guessing",
                        customer_reply=reply("ack", wrap_reply(email, "Thank you for your question. A technical specialist will reply to you directly.")),
                        forward={"to": owner, "summary": "No approved source match. " + summarize(email, text)},
                        teams={"to": owner, "text": "Tech question with no approved source"},
                        case_status="routed")
    teams = None
    if SOFT_SAFETY_RE.search(text):
        body += ("\n\nBecause you mentioned a storm, if you see any signs of lightning or surge damage (burn marks, "
                 "a burning smell or exposed wiring), stop and do not work on the equipment. A specialist has been "
                 "copied on this case.")
        teams = {"to": owner, "text": "FYI: storm mentioned in a tech support case; agent answered with safety note"}
    case["data"]["last_answer_source"] = sources[0]["section"]
    return decision("reply", f"Answered from {sources[0]['title']} / {sources[0]['section']}",
                    customer_reply=reply("answer", wrap_reply(email, body)), teams=teams,
                    case_status="awaiting_customer", checks={"needs_citation": True}, sources=sources)


def _thread_summary(case: dict, latest: str) -> str:
    hist = case["data"].get("history", [])
    lines = [f"Round {i + 1}: {h['from_party']}: {h['excerpt']}" for i, h in enumerate(hist[-6:])]
    return "Thread summary for escalation:\n" + "\n".join(lines) + f"\nLatest customer message: {' '.join(latest.split())[:240]}"
