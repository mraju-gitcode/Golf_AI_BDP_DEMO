"""Categories 4-9: route to the named owner with the details extracted, plus a
Teams notification and a short acknowledgement. The agent never approves,
releases, prices, quotes or accepts anything here.
"""
from __future__ import annotations

import re

from ..config import get_config
from .. import store
from .common import PO_RE, SO_RE, ack_text, decision, parts_in, reply, summarize, wrap_reply

PRICE_Q_RE = re.compile(r"\b(price|pricing|cost|how much)\b", re.I)


def handle(email: dict, intake: dict, triage: dict, case: dict) -> dict:
    cat = triage["category"]
    cfg = get_config()
    owner = cfg["categories"][str(cat)]["owner"]
    text = intake["model_text"]
    sender = intake["sender"]
    who = sender["account_name"] or email["from"]
    details = []
    if parts_in(text):
        details.append("Parts: " + ", ".join(parts_in(text)))
    refs = [m.group(0) for m in SO_RE.finditer(text)] + [f"PO {m.group(1)}" for m in PO_RE.finditer(text)]
    if refs:
        details.append("References: " + ", ".join(dict.fromkeys(refs)))
    att = [a["name"] for a in intake["attachments"] if a["status"] != "quarantined"]
    if att:
        details.append("Attachments forwarded unchanged: " + ", ".join(att))
    summary = summarize(email, text) + ("\n" + "\n".join(details) if details else "")

    # Suspicious mail (phishing, injection, blocked attachment) is routed with a flag and never answered.
    if intake["suspicious"]:
        flags = ", ".join(intake["flags"])
        return decision("route", f"Suspicious email ({flags}): routed with a flag, no reply sent",
                        forward={"to": owner, "summary": f"FLAGGED SUSPICIOUS ({flags}). Do not click links or open attachments.\n" + summary},
                        teams={"to": owner + " + Security", "text": f"Suspicious email flagged: {flags}"},
                        case_status="routed")

    if cat == 9 and triage.get("spam"):
        return decision("file", "Spam or vendor solicitation: filed without reply (X-A2)", case_status="closed")

    if sender["status"] == "internal":
        return decision("file", "Internal notice: filed, no customer reply (H-Q7)",
                        teams={"to": owner, "text": f"Internal notice received: {email['subject']}"},
                        case_status="closed")

    extra_teams = None
    if cat == 4:
        ack = wrap_reply(email, ack_text("the responsible product manager"))
    elif cat == 5:
        ack = wrap_reply(email, ack_text("our product support team"))
        if PRICE_Q_RE.search(text):
            extra_teams = {"to": cfg["categories"]["8"]["owner"], "text": f"Pricing question inside a product question from {who}"}
            ack = wrap_reply(email, ack_text("our product support team", "Your pricing question has been passed to our sales team."))
    elif cat == 6:
        extra = ""
        if intake["pii_masked"]:
            extra = "For your security, please do not send passcodes or payment details by email; the GSP team will confirm them with you directly."
        ack = wrap_reply(email, ack_text("the GSP team", extra))
    elif cat == 7:
        ack = wrap_reply(email, "Thank you. We have received your email and passed it to Customer Service for review. "
                                "This message confirms receipt only; Customer Service will confirm the order details separately.")
        dup = _possible_duplicate_po(text, case["id"])
        if dup:
            summary = f"POSSIBLE DUPLICATE: {dup}\n" + summary
    elif cat == 8:
        ack = wrap_reply(email, ack_text("our sales team"))
    else:  # 9
        if cfg.get("answer_general_inquiries", True) and re.search(r"\bcatalog(ue)?\b", text, re.I):
            body = ("The current golf product catalog is available to download from our golf support page: "
                    "https://www.rainbird.com/golf/support\n\nSource: Public Golf Literature, \"Golf product catalog\"")
            return decision("reply", "General inquiry answered from an approved public source (X-Q2)",
                            customer_reply=reply("answer", wrap_reply(email, body)), case_status="answered",
                            checks={"needs_citation": True},
                            sources=[{"title": "Public Golf Literature", "section": "Golf product catalog",
                                      "url": "https://www.rainbird.com/golf/support"}])
        ack = wrap_reply(email, ack_text("a member of the GolfPM team"))

    teams = {"to": owner, "text": f"New {cfg['categories'][str(cat)]['short']} request from {who}: {email['subject']}"}
    return decision("route", f"Category {cat} is triage-and-route; forwarded to {owner}",
                    customer_reply=reply("ack", ack), forward={"to": owner, "summary": summary},
                    teams=teams, case_status="routed", checks={"no_hold_reason": cat == 4, "no_commitment": True},
                    extra_teams=extra_teams)


def _possible_duplicate_po(text: str, case_id: str) -> str | None:
    pos = {m.group(1) for m in PO_RE.finditer(text)}
    if not pos:
        return None
    for c in store.list_cases():
        if c["id"] != case_id and c["category"] == 7 and pos & set(c["data"].get("po_numbers", [])):
            return f"PO {', '.join(pos)} already received in case {c['id']}"
    return None
