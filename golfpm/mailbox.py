"""Live mailbox connector (IMAP in, SMTP out) for the GolfPM shared mailbox.

Turned on by setting GOLFPM_MAILBOX_ADDRESS and GOLFPM_MAILBOX_PASSWORD (a Google
App Password) in .env. Stands in for Microsoft Graph in production.

- Polls INBOX every GOLFPM_POLL_SECONDS (default 10). Only mail that arrives after
  the app starts is processed; older mail is left alone.
- Never opens links or attachment contents; attachments are passed by name and type.
- Replies go back in the same Gmail thread (In-Reply-To / References headers).
- Forwards go to the owner addresses in demo_config.json; owners without an address
  are shown in the app only. Teams cards and approval cards stay in the app.
- Only emails that arrived through the mailbox ever trigger outgoing mail, so the
  synthetic test cases never send real email.
"""
from __future__ import annotations

import email
import email.policy
import html
import imaplib
import os
import re
import smtplib
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage
from email.utils import formataddr, getaddresses, make_msgid, parseaddr

from . import store
from .config import DEMO, get_config, update_config

QUOTE_START = re.compile(r"^(On .{5,200}wrote:|-{2,}\s*Original Message\s*-{2,}|From: .+|_{5,})\s*$", re.I)


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


class MailboxSettings:
    def __init__(self):
        self.address = _env("GOLFPM_MAILBOX_ADDRESS").lower()
        self.password = _env("GOLFPM_MAILBOX_PASSWORD").replace(" ", "")
        self.imap_host = _env("GOLFPM_IMAP_HOST", "imap.gmail.com")
        self.imap_port = int(_env("GOLFPM_IMAP_PORT", "993"))
        self.smtp_host = _env("GOLFPM_SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(_env("GOLFPM_SMTP_PORT", "465"))
        self.poll_seconds = max(3, int(_env("GOLFPM_POLL_SECONDS", "10")))
        self.display_name = _env("GOLFPM_MAILBOX_NAME", "GolfPM Team")
        self.send_enabled = _env("GOLFPM_SEND_EMAIL", "true").lower() != "false"

    @property
    def configured(self) -> bool:
        return bool(self.address and self.password)


def clean_body(text: str) -> str:
    """Keep the new part of a reply: drop quoted history and '>' lines."""
    out = []
    for line in text.replace("\r\n", "\n").split("\n"):
        if QUOTE_START.match(line.strip()):
            break
        if line.startswith(">"):
            continue
        out.append(line)
    return "\n".join(out).strip()


def html_to_text(raw: str) -> str:
    raw = re.sub(r"(?is)<(script|style).*?</\1>", "", raw)
    raw = re.sub(r"(?i)<br\s*/?>|</p>|</div>", "\n", raw)
    return html.unescape(re.sub(r"<[^>]+>", "", raw))


def parse_message(raw_bytes: bytes) -> dict:
    msg = email.message_from_bytes(raw_bytes, policy=email.policy.default)
    from_name, from_addr = parseaddr(str(msg.get("From", "")))
    body_part = msg.get_body(preferencelist=("plain", "html"))
    body = ""
    if body_part is not None:
        content = body_part.get_content()
        body = html_to_text(content) if body_part.get_content_type() == "text/html" else content
    attachments = [{"name": a.get_filename() or "attachment", "type": a.get_content_type()}
                   for a in msg.iter_attachments()]
    refs = re.findall(r"<[^>]+>", f"{msg.get('In-Reply-To', '')} {msg.get('References', '')}")
    return {
        "from": from_addr.lower(),
        "from_name": from_name,
        "subject": str(msg.get("Subject", "")).strip(),
        "body": clean_body(body),
        "cc": [a.lower() for _, a in getaddresses([str(msg.get("Cc", ""))]) if a],
        "attachments": attachments,
        "message_id": str(msg.get("Message-ID", "")).strip(),
        "references": refs,
        "auto_submitted": str(msg.get("Auto-Submitted", "no")).lower(),
    }


class Mailbox:
    def __init__(self, settings: MailboxSettings | None = None, imap_factory=None, smtp_factory=None):
        self.s = settings or MailboxSettings()
        self.imap_factory = imap_factory or (lambda: imaplib.IMAP4_SSL(self.s.imap_host, self.s.imap_port))
        self.smtp_factory = smtp_factory or (lambda: smtplib.SMTP_SSL(self.s.smtp_host, self.s.smtp_port, timeout=30))
        self.imap = None
        self.last_uid: int | None = None
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.sender = ThreadPoolExecutor(max_workers=2)
        self.status = {"enabled": self.s.configured, "address": self.s.address, "poll_seconds": self.s.poll_seconds,
                       "connected": False, "last_poll_at": None, "last_error": None, "received": 0, "sent": 0,
                       "processing": []}

    # ---------------- inbound ----------------
    def _connect(self):
        self.imap = self.imap_factory()
        self.imap.login(self.s.address, self.s.password)
        self.imap.select("INBOX")
        if self.last_uid is None:
            typ, data = self.imap.uid("search", None, "ALL")
            uids = [int(u) for u in (data[0] or b"").split()]
            self.last_uid = max(uids) if uids else 0
            store.log(None, None, "mailbox", f"Connected to {self.s.address}; watching for new email")
        self.status.update(connected=True, last_error=None)

    def poll_once(self) -> int:
        if self.imap is None:
            self._connect()
        self.imap.noop()
        typ, data = self.imap.uid("search", None, f"UID {self.last_uid + 1}:*")
        uids = sorted(int(u) for u in (data[0] or b"").split() if int(u) > self.last_uid)
        for uid in uids:
            typ, msg_data = self.imap.uid("fetch", str(uid), "(BODY.PEEK[])")
            raw = next((part[1] for part in msg_data if isinstance(part, tuple)), b"")
            self.last_uid = uid
            if raw:
                self.handle(parse_message(raw))
            self.imap.uid("store", str(uid), "+FLAGS", "(\\Seen)")
        self.status["last_poll_at"] = time.time()
        return len(uids)

    def handle(self, m: dict) -> dict | None:
        from .pipeline import process_email  # local import: pipeline imports store

        if not m["from"] or m["from"] == self.s.address:
            return None  # never react to our own mail
        if m["message_id"] and store.mail_lookup([m["message_id"]]):
            return None  # already processed
        marker = {"from": m["from"], "from_name": m["from_name"], "subject": m["subject"], "since": time.time()}
        self.status["processing"].append(marker)
        self.status["received"] += 1
        store.log(None, None, "mailbox", f"New email from {m['from_name'] or m['from']}: {m['subject']}")
        try:
            known = store.mail_lookup(m["references"])
            raw = {"from": m["from"], "from_name": m["from_name"], "subject": m["subject"], "body": m["body"],
                   "cc": m["cc"], "attachments": m["attachments"], "thread_id": known["thread_id"] if known else None,
                   "live": True}
            if m["auto_submitted"] not in ("", "no"):
                raw["subject"] = raw["subject"] if raw["subject"].lower().startswith("automatic reply") else f"Automatic reply: {raw['subject']}"
            # register the incoming Message-ID before processing so the send hook knows it is live mail
            email_id = store.new_id("EML")
            raw["id"] = email_id
            store.mail_register(m["message_id"] or f"<{email_id}@golfpm.local>", email_id, None, "in", m["references"])
            result = process_email(raw)
            store.mail_set_thread(email_id, result.get("thread_id"))
            return result
        finally:
            self.status["processing"].remove(marker)

    def run(self):
        while not self.stop_event.is_set():
            try:
                self.poll_once()
            except Exception as exc:  # reconnect on any IMAP error
                self.status.update(connected=False, last_error=f"{type(exc).__name__}: {exc}")
                store.log(None, None, "mailbox", f"Mailbox error, reconnecting: {type(exc).__name__}")
                try:
                    if self.imap is not None:
                        self.imap.logout()
                except Exception:
                    pass
                self.imap = None
            self.stop_event.wait(self.s.poll_seconds)

    def start(self):
        if not self.s.configured or self.thread:
            return
        self.thread = threading.Thread(target=self.run, name="golfpm-mailbox", daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()

    # ---------------- outbound ----------------
    def on_sent(self, item: dict):
        """store hook: called whenever an outbox item becomes 'sent'."""
        inbound = store.mail_for_email(item.get("email_id"))
        if not inbound or not self.s.send_enabled:
            return  # only live mail sends real email
        if item["kind"] in ("teams", "approval"):
            return  # shown in the app
        to: list[str] = []
        if item["kind"] == "reply":
            to = [a.strip() for a in item["recipient"].split(",") if "@" in a]
        elif item["kind"] == "forward":
            owners = DEMO.get("owners", {})
            addr = owners.get(item["recipient"]) or owners.get("*")
            if not addr:
                store.log(item["case_id"], item["email_id"], "mailbox",
                          f"Forward to {item['recipient']} shown in the app (no address set for this owner)")
                return
            to = [addr]
        if to:
            self.sender.submit(self._send, item, to, inbound)

    def _send(self, item: dict, to: list[str], inbound: dict):
        try:
            msg = EmailMessage()
            msg["From"] = formataddr((self.s.display_name, self.s.address))
            msg["To"] = ", ".join(to)
            msg["Subject"] = item["subject"]
            domain = self.s.address.split("@")[-1] or "golfpm.local"
            msg_id = make_msgid(domain=domain)
            msg["Message-ID"] = msg_id
            if item["kind"] == "reply":
                refs = (inbound.get("references") or []) + [inbound["message_id"]]
                msg["In-Reply-To"] = inbound["message_id"]
                msg["References"] = " ".join(refs[-10:])
            msg.set_content(item["body"])
            with self.smtp_factory() as smtp:
                smtp.login(self.s.address, self.s.password)
                smtp.send_message(msg)
            store.mail_register(msg_id, item["email_id"], inbound.get("thread_id"), "out", [])
            self.status["sent"] += 1
            what = "Reply emailed to" if item["kind"] == "reply" else "Forward emailed to"
            store.log(item["case_id"], item["email_id"], "mailbox", f"{what} {', '.join(to)}")
        except Exception as exc:
            self.status["last_error"] = f"Send failed: {type(exc).__name__}: {exc}"
            store.log(item["case_id"], item["email_id"], "mailbox", f"Email to {', '.join(to)} failed: {type(exc).__name__}")


MAILBOX: Mailbox | None = None


def apply_live_defaults():
    """Live demo defaults: order status replies and returns acknowledgements go straight to the
    customer. Warranty decisions still wait for CSR approval; tech support stays draft."""
    update_config({"categories": {"1": {"mode": "send"}, "2": {"mode": "send"}}})


def start() -> Mailbox | None:
    global MAILBOX
    settings = MailboxSettings()
    if not settings.configured:
        return None
    MAILBOX = Mailbox(settings)
    store.SENT_HOOKS.append(MAILBOX.on_sent)
    apply_live_defaults()
    MAILBOX.start()
    return MAILBOX


def live_status() -> dict:
    if MAILBOX is None:
        return {"enabled": False}
    s = dict(MAILBOX.status)
    s["processing"] = list(s["processing"])
    return s
