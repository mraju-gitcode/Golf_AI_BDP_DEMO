"""Live mailbox connector, tested against a simulated Gmail (IMAP + SMTP)."""
import os

os.environ["GOLFPM_MODE"] = "offline"

from email.message import EmailMessage
from email.utils import make_msgid

import pytest
from fastapi.testclient import TestClient

from golfpm import config, mailbox, store
from golfpm.api import app
from golfpm.config import reset_config

BOX = "golfpm-demo@example.org"
CHRIS = "chris.demo@example.org"


class FakeIMAP:
    def __init__(self, server):
        self.server = server

    def login(self, user, password):
        assert password == "apppassword"

    def select(self, name):
        return "OK", [b"1"]

    def noop(self):
        return "OK", []

    def logout(self):
        pass

    def uid(self, cmd, *args):
        if cmd == "search":
            crit = args[1]
            uids = [u for u, _ in self.server.messages]
            if crit.startswith("UID "):
                lo = int(crit.split()[1].split(":")[0])
                uids = [u for u in uids if u >= lo] or uids[-1:]  # Gmail returns the last UID for N:* past the end
            return "OK", [" ".join(map(str, uids)).encode()]
        if cmd == "fetch":
            raw = dict(self.server.messages)[int(args[0])]
            return "OK", [(b"1 (BODY[] {n}", raw), b")"]
        if cmd == "store":
            self.server.seen.add(int(args[0]))
            return "OK", []


class FakeSMTP:
    def __init__(self, server):
        self.server = server

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def login(self, user, password):
        pass

    def send_message(self, msg):
        self.server.sent.append(msg)


class FakeGmail:
    def __init__(self):
        self.messages, self.sent, self.seen = [], [], set()

    def deliver(self, sender, subject, body, name="", in_reply_to=None):
        m = EmailMessage()
        m["From"] = f"{name} <{sender}>" if name else sender
        m["To"] = BOX
        m["Subject"] = subject
        m["Message-ID"] = make_msgid(domain="example.org")
        if in_reply_to:
            m["In-Reply-To"] = in_reply_to
            m["References"] = in_reply_to
        m.set_content(body)
        self.messages.append((len(self.messages) + 1, m.as_bytes()))
        return m["Message-ID"]


@pytest.fixture()
def live(monkeypatch):
    store.set_db("golfpm_mailbox_test.db")
    store.reset()
    reset_config()
    gmail = FakeGmail()
    monkeypatch.setenv("GOLFPM_MAILBOX_ADDRESS", BOX)
    monkeypatch.setenv("GOLFPM_MAILBOX_PASSWORD", "apppassword")
    monkeypatch.setitem(config.DEMO, "owners", {"*": "owner.demo@example.org"})
    pine = next(a for a in config.CONTACTS["accounts"] if a["id"] == "ACC-PINEHOLLOW")
    if CHRIS not in pine["contacts"]:
        pine["contacts"].append(CHRIS)
    mb = mailbox.Mailbox(mailbox.MailboxSettings(), lambda: FakeIMAP(gmail), lambda: FakeSMTP(gmail))
    mb.sender.submit = lambda fn, *a: fn(*a)  # send synchronously in tests
    store.SENT_HOOKS.append(mb.on_sent)
    mailbox.MAILBOX = mb
    mailbox.apply_live_defaults()
    yield gmail, mb
    store.SENT_HOOKS.remove(mb.on_sent)
    mailbox.MAILBOX = None


def test_old_mail_ignored_new_mail_answered_in_thread(live):
    gmail, mb = live
    gmail.deliver(CHRIS, "Old unread email", "This arrived before the demo started.")
    mb.poll_once()  # baseline: nothing processed
    assert store.list_emails() == []

    orig_id = gmail.deliver(CHRIS, "Ship date for SO-104582", "Hi team,\n\nWhen will SO-104582 ship?\n\nThanks,\nChris",
                            name="Chris Schultz")
    assert mb.poll_once() == 1
    reply = gmail.sent[-1]
    assert reply["To"] == CHRIS and reply["In-Reply-To"] == orig_id
    assert reply["Subject"] == "RE: Ship date for SO-104582"
    assert "SO-104582" in reply.get_content() and "Hello Chris" in reply.get_content()

    # Chris answers in the same Gmail thread: same case, follow-up agent, forwarded to the owner
    gmail.deliver(CHRIS, "Re: Ship date for SO-104582", "That doesn't work for us, please call me today.\n\nOn Fri, GolfPM wrote:\n> old text",
                  in_reply_to=reply["Message-ID"])
    mb.poll_once()
    emails = store.list_emails()
    assert len(emails) == 2 and emails[0]["case_id"] == emails[1]["case_id"]
    assert emails[0]["result"]["action"] == "route"
    assert any(m["To"] == "owner.demo@example.org" for m in gmail.sent)


def test_draft_only_emailed_after_csr_approval(live):
    gmail, mb = live
    client = TestClient(app)
    client.put("/api/config", json={"categories": {"1": {"mode": "draft"}}})
    mb.poll_once()
    gmail.deliver(CHRIS, "SO-104582", "Is SO-104582 still on schedule?")
    mb.poll_once()
    assert not [m for m in gmail.sent if m["To"] == CHRIS]
    item = next(q for q in client.get("/api/review-queue").json() if q["kind"] == "reply")
    client.post(f"/api/review/{item['id']}", json={"decision": "approve"})
    assert [m for m in gmail.sent if m["To"] == CHRIS]


def test_test_cases_and_own_mail_never_send_email(live):
    gmail, mb = live
    client = TestClient(app)
    client.post("/api/test-cases/TC-03/send")
    mb.poll_once()
    gmail.deliver(BOX, "Loop check", "Our own message should be ignored.")
    mb.poll_once()
    assert gmail.sent == []
    assert all(e["from_addr"] != BOX for e in store.list_emails())
