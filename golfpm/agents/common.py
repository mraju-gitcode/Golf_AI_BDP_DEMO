"""Shared helpers for building agent decisions and reply text."""
from __future__ import annotations

import re

from ..config import get_config

PART_RE = re.compile(r"\bRB-\d{4}\b(?:\s*\((\d+)\s*pcs?\)|\s*x\s*(\d+))?", re.I)
SO_RE = re.compile(r"\bSO-\d{6}\b", re.I)
PO_RE = re.compile(r"\bPO\s*(?:#|number|no\.?)?\s*(\d{4,6})\b", re.I)
PHONE_RE = re.compile(r"\b\d{3}[-. ]\d{4}\b|\b\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b")


def first_name(email: dict) -> str:
    """Best-effort first name: display name, then the sign-off, then the address."""
    if email.get("from_name"):
        name = email["from_name"].replace(",", " ").split()
        if name and name[0].isalpha():
            return name[0].capitalize()
    lines = [l.strip() for l in email.get("body", "").strip().splitlines() if l.strip()]
    for line in reversed(lines[-4:]):
        m = re.match(r"^([A-Z][a-z]+)(\s+[A-Z][a-z]+)?$", line)
        if m:
            return m.group(1)
    local = email["from"].split("@")[0]
    m = re.match(r"^([a-z]+)\.[a-z]+$", local)
    return m.group(1).capitalize() if m else ""


def wrap_reply(email: dict, body: str) -> str:
    cfg = get_config()
    name = first_name(email)
    parts = [f"Hello {name}," if name else "Hello,", "", body.strip(), "", "Regards,", cfg["signature"]]
    if cfg["ai_disclosure"]["enabled"]:
        parts += ["", "--", cfg["ai_disclosure"]["text"]]
    return "\n".join(parts)


def decision(action: str, reason: str, **kw) -> dict:
    return {"action": action, "reason": reason, "customer_reply": kw.get("customer_reply"),
            "forward": kw.get("forward"), "teams": kw.get("teams"), "approval": kw.get("approval"),
            "checks": kw.get("checks", {}), "case_status": kw.get("case_status"),
            "child_case": kw.get("child_case"), "sources": kw.get("sources", []),
            "extra_teams": kw.get("extra_teams")}


def reply(kind: str, body: str) -> dict:
    return {"kind": kind, "body": body}


def ack_text(owner_phrase: str, extra: str = "") -> str:
    text = f"Thank you for your email. Your request has been passed to {owner_phrase}, who will follow up with you directly."
    return text + (f" {extra}" if extra else "")


def summarize(email: dict, text: str, limit: int = 280) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 3] + "..."


def parts_in(text: str) -> list[str]:
    """Part numbers with quantities; a bare mention is dropped when the same part also has a quantity."""
    found: dict[str, str | None] = {}
    for m in PART_RE.finditer(text):
        part = m.group(0).split()[0].upper()
        qty = m.group(1) or m.group(2)
        if qty or part not in found:
            found[part] = qty or found.get(part)
    return [p + (f" x {q}" if q else "") for p, q in found.items()]
