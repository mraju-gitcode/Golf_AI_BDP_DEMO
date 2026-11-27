"""SQLite case store: emails, cases, trace events, outbox and CSR feedback.

Stands in for Cosmos DB / PostgreSQL in the target architecture. One case per
email thread holds the category, status, round count and collected fields.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager

from .config import RUNTIME

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None
_db_name = "golfpm_demo.db"
SENT_HOOKS: list = []  # callables(item) run when an outbox item becomes "sent" (live mailbox)


def set_db(name: str) -> str:
    """Switch the active database file (the evaluation runs in its own DB). Returns the previous name."""
    global _conn, _db_name
    with _lock:
        prev = _db_name
        if _conn is not None:
            _conn.close()
        _conn, _db_name = None, name
    return prev

SCHEMA = """
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY, received_at REAL, from_addr TEXT, cc TEXT, subject TEXT,
  body TEXT, attachments TEXT, thread_id TEXT, case_id TEXT, test_id TEXT,
  content_hash TEXT, result TEXT
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, thread_id TEXT, created_at REAL, updated_at REAL,
  category INTEGER, status TEXT, sender TEXT, account_id TEXT, subject TEXT,
  rounds INTEGER DEFAULT 0, human_owned INTEGER DEFAULT 0, data TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, case_id TEXT, email_id TEXT,
  step TEXT, title TEXT, detail TEXT
);
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY, ts REAL, case_id TEXT, email_id TEXT, kind TEXT,
  recipient TEXT, subject TEXT, body TEXT, status TEXT, meta TEXT
);
CREATE TABLE IF NOT EXISTS mail_map (
  message_id TEXT PRIMARY KEY, email_id TEXT, thread_id TEXT, direction TEXT, refs TEXT
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, outbox_id TEXT, rating TEXT, note TEXT
);
"""


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        RUNTIME.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(RUNTIME / _db_name, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript(SCHEMA)
    return _conn


@contextmanager
def tx():
    with _lock:
        conn = _db()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def reset() -> None:
    with tx() as c:
        for table in ("emails", "cases", "events", "outbox", "feedback", "mail_map"):
            c.execute(f"DELETE FROM {table}")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"


def _row(r: sqlite3.Row | None) -> dict | None:
    if r is None:
        return None
    d = dict(r)
    for key in ("cc", "attachments", "data", "detail", "meta", "result"):
        if key in d and isinstance(d[key], str) and d[key]:
            try:
                d[key] = json.loads(d[key])
            except json.JSONDecodeError:
                pass
    return d


# ---------- emails ----------
def save_email(email: dict) -> None:
    with tx() as c:
        c.execute(
            "INSERT OR REPLACE INTO emails VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (email["id"], email["received_at"], email["from"], json.dumps(email.get("cc", [])),
             email["subject"], email["body"], json.dumps(email.get("attachments", [])),
             email.get("thread_id"), email.get("case_id"), email.get("test_id"),
             email.get("content_hash"), json.dumps(email.get("result")) if email.get("result") else None),
        )


def find_duplicate(content_hash: str, within_seconds: float = 86400) -> dict | None:
    with tx() as c:
        r = c.execute(
            "SELECT * FROM emails WHERE content_hash=? AND received_at>? ORDER BY received_at LIMIT 1",
            (content_hash, time.time() - within_seconds),
        ).fetchone()
    return _row(r)


def list_emails() -> list[dict]:
    with tx() as c:
        rows = c.execute("SELECT * FROM emails ORDER BY received_at DESC").fetchall()
    return [_row(r) for r in rows]


def get_email(email_id: str) -> dict | None:
    with tx() as c:
        return _row(c.execute("SELECT * FROM emails WHERE id=?", (email_id,)).fetchone())


# ---------- cases ----------
def create_case(thread_id: str, sender: str, subject: str, account_id: str | None) -> dict:
    now = time.time()
    case = {"id": new_id("CASE"), "thread_id": thread_id, "created_at": now, "updated_at": now,
            "category": None, "status": "new", "sender": sender, "account_id": account_id,
            "subject": subject, "rounds": 0, "human_owned": 0, "data": {"history": []}}
    save_case(case)
    return case


def save_case(case: dict) -> None:
    case["updated_at"] = time.time()
    with tx() as c:
        c.execute(
            "INSERT OR REPLACE INTO cases VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (case["id"], case["thread_id"], case["created_at"], case["updated_at"], case["category"],
             case["status"], case["sender"], case["account_id"], case["subject"], case["rounds"],
             int(case["human_owned"]), json.dumps(case["data"])),
        )


def get_case(case_id: str) -> dict | None:
    with tx() as c:
        return _row(c.execute("SELECT * FROM cases WHERE id=?", (case_id,)).fetchone())


def case_by_thread(thread_id: str) -> dict | None:
    with tx() as c:
        return _row(c.execute(
            "SELECT * FROM cases WHERE thread_id=? ORDER BY created_at DESC LIMIT 1", (thread_id,)
        ).fetchone())


def list_cases() -> list[dict]:
    with tx() as c:
        rows = c.execute("SELECT * FROM cases ORDER BY updated_at DESC").fetchall()
    return [_row(r) for r in rows]


# ---------- trace ----------
def log(case_id: str | None, email_id: str | None, step: str, title: str, detail: dict | None = None) -> None:
    with tx() as c:
        c.execute("INSERT INTO events (ts, case_id, email_id, step, title, detail) VALUES (?,?,?,?,?,?)",
                  (time.time(), case_id, email_id, step, title, json.dumps(detail or {})))


def events_for_email(email_id: str) -> list[dict]:
    with tx() as c:
        rows = c.execute("SELECT * FROM events WHERE email_id=? ORDER BY id", (email_id,)).fetchall()
    return [_row(r) for r in rows]


def events_for_case(case_id: str) -> list[dict]:
    with tx() as c:
        rows = c.execute("SELECT * FROM events WHERE case_id=? ORDER BY id", (case_id,)).fetchall()
    return [_row(r) for r in rows]


# ---------- outbox ----------
def add_outbox(case_id, email_id, kind, recipient, subject, body, status, meta=None) -> dict:
    item = {"id": new_id("MSG"), "ts": time.time(), "case_id": case_id, "email_id": email_id,
            "kind": kind, "recipient": recipient, "subject": subject, "body": body,
            "status": status, "meta": meta or {}}
    with tx() as c:
        c.execute("INSERT INTO outbox VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (item["id"], item["ts"], case_id, email_id, kind, recipient, subject, body,
                   status, json.dumps(item["meta"])))
    if status == "sent":
        _fire_sent(item)
    return item


def _fire_sent(item: dict) -> None:
    for hook in list(SENT_HOOKS):
        try:
            hook(item)
        except Exception:
            pass


def update_outbox(item_id: str, **fields) -> dict | None:
    item = get_outbox(item_id)
    if not item:
        return None
    was_sent = item["status"] == "sent"
    item.update(fields)
    with tx() as c:
        c.execute("UPDATE outbox SET body=?, status=?, meta=?, recipient=?, subject=? WHERE id=?",
                  (item["body"], item["status"], json.dumps(item["meta"]), item["recipient"],
                   item["subject"], item_id))
    if item["status"] == "sent" and not was_sent:
        _fire_sent(item)
    return item


def get_outbox(item_id: str) -> dict | None:
    with tx() as c:
        return _row(c.execute("SELECT * FROM outbox WHERE id=?", (item_id,)).fetchone())


def list_outbox(status: str | None = None) -> list[dict]:
    with tx() as c:
        if status:
            rows = c.execute("SELECT * FROM outbox WHERE status=? ORDER BY ts DESC", (status,)).fetchall()
        else:
            rows = c.execute("SELECT * FROM outbox ORDER BY ts DESC").fetchall()
    return [_row(r) for r in rows]


def outbox_for_email(email_id: str) -> list[dict]:
    with tx() as c:
        rows = c.execute("SELECT * FROM outbox WHERE email_id=? ORDER BY ts", (email_id,)).fetchall()
    return [_row(r) for r in rows]


def add_feedback(outbox_id: str, rating: str, note: str = "") -> None:
    with tx() as c:
        c.execute("INSERT INTO feedback (ts, outbox_id, rating, note) VALUES (?,?,?,?)",
                  (time.time(), outbox_id, rating, note))


def list_feedback() -> list[dict]:
    with tx() as c:
        return [_row(r) for r in c.execute("SELECT * FROM feedback ORDER BY ts DESC").fetchall()]


# ---------- live mailbox: Message-ID map ----------
def mail_register(message_id: str, email_id: str, thread_id: str | None, direction: str, refs: list[str]) -> None:
    with tx() as c:
        c.execute("INSERT OR REPLACE INTO mail_map VALUES (?,?,?,?,?)",
                  (message_id, email_id, thread_id, direction, json.dumps(refs)))


def mail_set_thread(email_id: str, thread_id: str | None) -> None:
    with tx() as c:
        c.execute("UPDATE mail_map SET thread_id=? WHERE email_id=? AND direction='in'", (thread_id, email_id))


def mail_lookup(message_ids: list[str]) -> dict | None:
    """The newest known message among these Message-IDs (used to thread replies)."""
    if not message_ids:
        return None
    with tx() as c:
        q = ",".join("?" * len(message_ids))
        r = c.execute(f"SELECT * FROM mail_map WHERE message_id IN ({q}) AND thread_id IS NOT NULL", message_ids).fetchall()
        if not r:
            r = c.execute(f"SELECT * FROM mail_map WHERE message_id IN ({q})", message_ids).fetchall()
    return dict(r[-1]) if r else None


def mail_for_email(email_id: str | None) -> dict | None:
    """The inbound live message behind an email, or None for test/simulated mail."""
    if not email_id:
        return None
    with tx() as c:
        r = c.execute("SELECT * FROM mail_map WHERE email_id=? AND direction='in'", (email_id,)).fetchone()
    if not r:
        return None
    d = dict(r)
    d["references"] = json.loads(d.pop("refs") or "[]")
    return d


def recent_activity(limit: int = 60) -> list[dict]:
    with tx() as c:
        rows = c.execute(
            "SELECT e.id, e.ts, e.step, e.title, e.email_id, e.case_id, m.from_addr, m.subject "
            "FROM events e LEFT JOIN emails m ON m.id = e.email_id ORDER BY e.id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]
