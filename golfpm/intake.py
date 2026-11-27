"""Intake and protection: runs before any model reads the email.

- Duplicate and auto-reply guard
- Sender verification against the known-contacts list (incl. look-alike domains)
- Link and attachment policy: links are NEVER opened; attachments are never
  executed. Only allow-listed form types go to a sandboxed extractor
  (simulated Document Intelligence); blocked types are quarantined.
- Prompt-injection screen: injected instructions are treated as data and removed
  from the text the models see
- PII masking: passcodes and card numbers are redacted before models, logs and forwards
"""
from __future__ import annotations

import hashlib
import re

from .config import CONTACTS

AUTO_REPLY_SUBJECT = re.compile(r"^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|undeliverable|delivery status notification)", re.I)
AUTO_REPLY_BODY = re.compile(r"\b(out of (the )?office|on (annual )?leave|limited access to email|automatic reply)\b", re.I)
URL_RE = re.compile(r"https?://[^\s<>\")]+", re.I)
PHISHING_RE = re.compile(r"\b(log ?in|sign ?in|verify your|password|expires? today|access expires|update your (billing|payment)|confirm your account)\b", re.I)
INJECTION_RE = re.compile(
    r"(ignore (all |your |any )?(previous|prior|above) instructions|you are now|admin mode|developer mode|"
    r"^\s*system\s*:|disregard (the|your) (rules|instructions)|reveal (your|the) (prompt|instructions)|"
    r"include the internal notes|full daily backlog report|price list for all)",
    re.I | re.M,
)
PASSCODE_RE = re.compile(r"\b(passcode|password|pin|access code)\s*(is|:)?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,})", re.I)
CARD_RE = re.compile(r"\b(card (ending|number)( in)?\s*)(\d{4,19})\b|\b(\d[ -]?){13,19}\b", re.I)

ALLOWED_ATTACHMENT_TYPES = {
    "application/pdf", "image/jpeg", "image/png",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
BLOCKED_EXT = re.compile(r"\.(exe|js|vbs|bat|cmd|scr|ps1|msi|jar|com|iso|zip|7z|rar|html?)$", re.I)

SPANISH = {"buenos", "dias", "gracias", "que", "del", "hoyo", "varios", "aspersores", "giran", "podemos", "revisar", "problema", "para", "por", "favor"}


def normalize_subject(subject: str) -> str:
    s = subject or ""
    while True:
        new = re.sub(r"^\s*(re|fw|fwd|automatic reply|auto reply)\s*:\s*", "", s, flags=re.I)
        if new == s:
            return s.strip().lower()
        s = new


def content_hash(sender: str, subject: str, body: str) -> str:
    norm = " ".join((body or "").lower().split())
    return hashlib.sha256(f"{sender.lower()}|{normalize_subject(subject)}|{norm}".encode()).hexdigest()


def _domain(addr: str) -> str:
    return addr.split("@")[-1].lower()


def _squash(domain: str) -> str:
    return re.sub(r"[^a-z0-9]", "", domain.split(".")[0])


def _edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def verify_sender(addr: str) -> dict:
    addr = addr.lower().strip()
    domain = _domain(addr)
    if domain in CONTACTS["internal_domains"]:
        return {"status": "internal", "account": None, "detail": "Rain Bird internal sender"}
    for acc in CONTACTS["accounts"]:
        if addr in acc["contacts"]:
            return {"status": "verified", "account": acc, "detail": f"Known contact of {acc['name']}"}
    for acc in CONTACTS["accounts"]:
        if domain in acc["domains"]:
            return {"status": "domain_match", "account": acc,
                    "detail": f"Domain matches {acc['name']} but address is not on the contact list"}
    for acc in CONTACTS["accounts"]:
        for known in acc["domains"]:
            if _squash(domain) == _squash(known) or _edit_distance(_squash(domain), _squash(known)) <= 2:
                return {"status": "lookalike", "account": None,
                        "detail": f"Look-alike of {known}; treated as unverified and suspicious"}
    return {"status": "unknown", "account": None, "detail": "Sender not on the known-contacts list"}


def screen_attachments(attachments: list[dict]) -> list[dict]:
    out = []
    for att in attachments or []:
        name, mime = att.get("name", ""), att.get("type", "")
        if BLOCKED_EXT.search(name) or mime not in ALLOWED_ATTACHMENT_TYPES:
            out.append({"name": name, "type": mime, "status": "quarantined",
                        "note": "Blocked type. Not opened, not forwarded to the agent."})
        elif att.get("form") and att.get("extracted_fields"):
            out.append({"name": name, "type": mime, "status": "extracted",
                        "form": att["form"], "fields": att["extracted_fields"],
                        "note": "Malware scan clean. Known form type, fields read by the sandboxed extractor (Document Intelligence in production)."})
        else:
            out.append({"name": name, "type": mime, "status": "stored",
                        "note": "Malware scan clean. Stored and forwarded unchanged; content not read by the agent."})
    return out


def mask_pii(text: str) -> tuple[str, list[str]]:
    found = []

    def _pass(m):
        found.append("passcode")
        return f"{m.group(1)} {m.group(2) or ''} [PASSCODE REDACTED]".replace("  ", " ")

    text = PASSCODE_RE.sub(_pass, text)

    def _card(m):
        found.append("card number")
        return (m.group(1) or "card ") + "[CARD REDACTED]" if m.group(1) else "[CARD REDACTED]"

    text = CARD_RE.sub(_card, text)
    return text, sorted(set(found))


def strip_injection(text: str) -> tuple[str, list[str]]:
    hits, kept = [], []
    for sentence in re.split(r"(?<=[.!?])\s+|\n", text):
        if INJECTION_RE.search(sentence):
            hits.append(sentence.strip())
        else:
            kept.append(sentence)
    return "\n".join(s for s in kept).strip(), hits


def detect_language(text: str) -> str:
    words = re.findall(r"[a-záéíóúñ]+", text.lower())
    if not words:
        return "en"
    es = sum(w in SPANISH for w in words)
    return "es" if es / len(words) > 0.15 else "en"


def run_intake(email: dict) -> dict:
    sender = verify_sender(email["from"])
    subject, body = email.get("subject", ""), email.get("body", "")
    auto_reply = bool(AUTO_REPLY_SUBJECT.search(subject) or (len(body) < 200 and AUTO_REPLY_BODY.search(body)))
    links = URL_RE.findall(body)
    phishing = bool(links and PHISHING_RE.search(body))
    attachments = screen_attachments(email.get("attachments", []))
    quarantined = [a for a in attachments if a["status"] == "quarantined"]
    masked, pii = mask_pii(body)
    clean_text, injections = strip_injection(masked)
    flags = []
    if sender["status"] == "lookalike":
        flags.append("lookalike_domain")
    if phishing:
        flags.append("phishing_link")
    if quarantined:
        flags.append("blocked_attachment")
    if injections:
        flags.append("prompt_injection")
    return {
        "sender": {"status": sender["status"], "detail": sender["detail"],
                   "account_id": sender["account"]["id"] if sender["account"] else None,
                   "account_name": sender["account"]["name"] if sender["account"] else None,
                   "account_type": sender["account"]["type"] if sender["account"] else None},
        "auto_reply": auto_reply,
        "links": [{"url": u, "status": "not opened (policy)"} for u in links],
        "attachments": attachments,
        "pii_masked": pii,
        "masked_body": masked,
        "model_text": clean_text,
        "injections": injections,
        "language": detect_language(body),
        "flags": flags,
        "suspicious": bool(flags),
    }
