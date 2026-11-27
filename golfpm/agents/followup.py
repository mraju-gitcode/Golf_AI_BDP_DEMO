"""Follow-up agent: customer replies on an open case (categories 1-3).

Skips triage and routing and reuses the case context (thread memory), as
discussed in the 26 Nov call. Decides whether the reply:
- is dissatisfied, so it hands off to a person
- changes intent (troubleshooting becomes a warranty claim), so it moves the case
- adds missing information, so it continues the category's flow
"""
from __future__ import annotations

import re

from ..config import get_config
from .common import ack_text, decision, reply, summarize, wrap_reply

DISSATISFIED_RE = re.compile(
    r"\b(doesn'?t work for us|not (good )?enough|not acceptable|unacceptable|call me|someone (to )?call|"
    r"speak to (a|someone)|this did(n'?t| not) help|still (stuck|not|broken|the same)|tried everything|"
    r"same symptom|escalate|frustrat)", re.I)
DEFECT_RE = re.compile(r"\b(cracked|broken case|defect|replaced under warranty|warranty|replace (these|them))\b", re.I)


def assess(email: dict, intake: dict, case: dict) -> dict:
    """Return {'route_to': category or None, 'decision': decision or None, 'reason': str}."""
    text = intake["model_text"]
    cat = case["category"]
    if cat == 3 and DEFECT_RE.search(text):
        return {"route_to": 2, "decision": None,
                "reason": "Troubleshooting turned into a defect/warranty claim: case moved to Returns"}
    if DISSATISFIED_RE.search(text):
        if cat == 3:
            return {"route_to": 3, "decision": None, "force_escalate": True,
                    "reason": "Customer says the answer did not help: escalate with thread summary"}
        owner = get_config()["categories"][str(cat)]["owner"]
        d = decision("route", "Customer is not satisfied with the agent's answer: handed to a person (no re-send)",
                     customer_reply=reply("ack", wrap_reply(email, "Thank you for letting us know. A member of our team will contact you today.")),
                     forward={"to": owner, "summary": "Customer dissatisfied with automated reply. Thread: " +
                              " | ".join(h["excerpt"] for h in case["data"].get("history", [])[-4:]) +
                              " | Latest: " + summarize(email, text, 200)},
                     teams={"to": owner, "text": f"Unhappy customer on case {case['id']}: please call"},
                     case_status="routed")
        return {"route_to": None, "decision": d, "reason": d["reason"]}
    return {"route_to": cat, "decision": None, "reason": "Customer added information; continuing the category flow"}
