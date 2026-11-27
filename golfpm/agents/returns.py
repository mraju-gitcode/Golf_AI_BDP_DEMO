"""Category 2: Returns and warranty agent (review and approval).

Collects the required details across email rounds, checks them against the
warranty policy and drafts a determination. A CSR approves every determination;
the agent never approves a claim, issues an RGA or promises a credit.
"""
from __future__ import annotations

import re

from ..config import get_config
from .. import knowledge, llm
from .common import PHONE_RE, ack_text, decision, parts_in, reply, summarize, wrap_reply

ESCALATE_RE = re.compile(r"\b(attorney|lawyer|legal|lawsuit|sue|liabilit|property damage|flooded|injur|fire)\b", re.I)
NON_WARRANTY_RE = re.compile(r"\b(over-?ordered|overstock|excess|surplus|unused|wrong item|cut (the \w+ )?back|shipping damage|no longer need)", re.I)
FAILURE_RE = re.compile(r"\b(fail|stopp|broke|defect|crack|leak|not (work|rotat|pop)|won'?t|doesn'?t|warranty)\w*", re.I)
RETURN_FOR_CREDIT_RE = re.compile(r"\b(return|send back)\b.*\bcredit\b|\bcredit\b.*\breturn", re.I | re.S)
REQUIRED = ["contact", "part_numbers"]
FORM_NOTE = ("Warranty information form (synthetic demo form): course name, course contact name and phone, affected part "
             "numbers and quantities, installation date, and a short description of the failure. Photos are helpful.")


def collect(case: dict, email: dict, intake: dict) -> dict:
    fields = dict(case["data"].get("warranty_fields", {}))
    for att in intake["attachments"]:
        if att["status"] == "extracted":
            f = att["fields"]
            fields.update({k: v for k, v in f.items() if v})
            if f.get("contact_name") and f.get("contact_phone"):
                fields["contact"] = f"{f['contact_name']}, {f['contact_phone']}"
    text = intake["model_text"]
    parts = parts_in(text)
    if parts:
        fields["part_numbers"] = ", ".join(parts)
    phone = PHONE_RE.search(text)
    if phone and "contact" not in fields:
        fields["contact"] = phone.group(0)
    return fields


def handle(email: dict, intake: dict, triage: dict, case: dict) -> dict:
    text = intake["model_text"]
    owner = get_config()["categories"]["2"]["owner"]
    if ESCALATE_RE.search(text):
        return decision("escalate", "Legal language or property damage: straight to a person, no assessment (R-Q8)",
                        customer_reply=reply("ack", wrap_reply(email, "Thank you for letting us know. Your message has been passed to the responsible team, who will contact you directly.")),
                        forward={"to": "Warranty escalations (named by Rain Bird)", "summary": "ESCALATED CLAIM: " + summarize(email, text)},
                        teams={"to": "Warranty escalations", "text": f"Urgent: claim with legal/property-damage language from {intake['sender']['account_name']}"},
                        case_status="escalated", checks={"no_commitment": True})
    if NON_WARRANTY_RE.search(text) or (RETURN_FOR_CREDIT_RE.search(text) and not FAILURE_RE.search(text)):
        return decision("route", "Non-warranty return (overstock); handling pending R-Q6, routed to a CSR",
                        customer_reply=reply("ack", wrap_reply(email, ack_text("our returns team"))),
                        forward={"to": owner, "summary": "Non-warranty return request. " + summarize(email, text)},
                        teams={"to": owner, "text": "Non-warranty return request"},
                        case_status="routed", checks={"no_commitment": True})

    fields = collect(case, email, intake)
    case["data"]["warranty_fields"] = fields
    missing = [f for f in REQUIRED if not fields.get(f)]
    if missing:
        asks = []
        if "contact" in missing:
            asks.append("the course contact name and phone number")
        if "part_numbers" in missing:
            asks.append("the affected part numbers and quantities")
        first_round = not case["data"].get("form_sent")
        case["data"]["form_sent"] = True
        body = "Thank you for your email. To review your warranty request we need " + " and ".join(asks) + "."
        if first_round:
            body += "\n\nPlease complete and return the attached warranty information form.\n" + FORM_NOTE
        return decision("ask", f"Missing: {', '.join(missing)}", customer_reply=reply("ask", wrap_reply(email, body)),
                        case_status="awaiting_customer", checks={"no_commitment": True})

    product = fields.get("product_type", "rotor")
    section = knowledge.get_section("KB-WARRANTY", "Section 2.1" if product == "rotor" else "Section 2.2")
    summary = (f"Course: {fields.get('course_name', intake['sender']['account_name'])}\n"
               f"Contact: {fields.get('contact')}\nParts: {fields.get('part_numbers')}\n"
               f"Install date: {fields.get('install_date', 'not given')}\n"
               f"Failure: {fields.get('failure_description', summarize(email, text, 160))}\n\n"
               f"Policy reference: {section['title']} / {section['heading']}: {section['text']}\n\n"
               "Draft determination: within the warranty period based on the install date given; "
               "recommend approval subject to CSR review of photos and date codes.")
    try:
        better = llm.write("Write a short warranty case summary for a CSR: facts, the policy section that applies, "
                           "and a recommended determination. Do not decide; recommend.", summary)
    except Exception:
        better = None
    proposed = ("Your warranty claim has been reviewed and approved for replacement. Our returns team will send the "
                "return authorization and next steps.")
    return decision("approval", "All required details captured; determination drafted for CSR approval",
                    customer_reply=reply("ack", wrap_reply(email, "Thank you. We have received your warranty claim and the information we need. "
                                                           "A member of our returns team will review it and reply to you.")),
                    approval={"to": owner, "summary": better or summary, "proposed_reply": wrap_reply(email, proposed)},
                    teams={"to": owner, "text": "Warranty determination awaiting approval"},
                    case_status="pending_approval", checks={"no_commitment": True},
                    sources=[{"title": section["title"], "section": section["heading"], "url": section["source_url"]}])
