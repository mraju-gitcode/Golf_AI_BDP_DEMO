"""Output checks: every customer-facing message passes these before it leaves.
A failed check blocks the message and sends the case to the CSR review queue.
"""
from __future__ import annotations

import re

from .config import ORDERS

PRICE_RE = re.compile(r"(\$\s?\d|\bUSD\s?\d|\bprice (is|of|per)\b|\bcosts? \d)", re.I)
SECRET_RE = re.compile(r"\bGSP-\d+\b|\b(card ending|card number)\s*\d{4}\b", re.I)
COMMIT_RE = re.compile(r"\b(has been approved|is approved|we (will|can) (credit|replace)|order (is|has been) accepted|we confirm (the|your) (order|po))\b", re.I)
FILLER_RE = re.compile(r"(hope this (email|message) finds you well|!!|absolutely thrilled|as an ai language model)", re.I)
SO_RE = re.compile(r"\bSO-\d{6}\b", re.I)
HOLD_REASON_RE = re.compile(r"\b(pm approval required|quality hold|golf application review|hold reason)\b", re.I)


def check(message: str, decision: dict) -> list[dict]:
    checks = decision.get("checks", {})
    results = []

    def add(name, ok, detail=""):
        results.append({"check": name, "passed": bool(ok), "detail": detail})

    add("No prices or tariffs", not PRICE_RE.search(message))
    add("No passcodes or card numbers", not SECRET_RE.search(message))
    internal_notes = [o["internal_note"] for o in ORDERS["orders"] if o["internal_note"]]
    add("No internal order notes", not any(n.lower() in message.lower() for n in internal_notes))
    allowed = {o.upper() for o in checks.get("allowed_orders", [])}
    leaked = {m.group(0).upper() for m in SO_RE.finditer(message)} - allowed
    if checks.get("no_order_data") or allowed:
        add("Only the sender's own orders", not leaked, ", ".join(sorted(leaked)))
    if checks.get("needs_as_of"):
        add("As-of date stated", ORDERS["as_of"] in message)
    if checks.get("needs_citation"):
        add("Approved source cited", "Source:" in message and "http" in message)
    if checks.get("no_hold_reason"):
        add("Hold reason not disclosed", not HOLD_REASON_RE.search(message))
    if checks.get("no_commitment"):
        add("No approval, credit or acceptance promised", not COMMIT_RE.search(message))
    if checks.get("no_steps"):
        add("No troubleshooting steps on escalation", not re.search(r"^\s*\d\.\s", message, re.M))
    add("Tone and format", not FILLER_RE.search(message))
    return results
