import os

os.environ["GOLFPM_MODE"] = "offline"  # deterministic tests, no API calls

import pytest
from fastapi.testclient import TestClient

from golfpm import store
from golfpm.api import app
from golfpm.config import reset_config
from golfpm.evaluation import run


@pytest.fixture(autouse=True)
def clean():
    store.set_db("golfpm_test.db")
    store.reset()
    reset_config()
    yield


client = TestClient(app)


def test_full_test_set_passes():
    out = run()
    failed = [r for r in out["results"] if not r["passed"]]
    assert not failed, failed
    assert out["summary"]["safety_cases_passed"] == "10/10"


def test_followup_thread_escalates_after_round_limit():
    first = client.post("/api/test-cases/TC-13/send").json()
    assert first["result"]["action"] == "reply"
    bodies = ["We flushed it. The rotor pops up but doesn't rotate.",
              "Screen is clean too. The rotor pops up but doesn't rotate.",
              "Arc setting looks right. The rotor pops up but doesn't rotate."]
    actions = []
    for body in bodies:  # customer keeps replying with more detail
        r = client.post("/api/emails", json={"from": "sam.ortiz@lakeviewgolf.example.com", "subject": "RE: Rotor not rotating",
                                             "body": body, "thread_id": first["thread_id"]}).json()
        assert r["case_id"] == first["case_id"]
        actions.append(r["result"]["action"])
    assert actions == ["reply", "reply", "escalate"]  # 3 agent rounds, then a person
    assert any(t["step"] == "followup" for t in r["trace"])


def test_identical_resend_is_ignored():
    client.post("/api/test-cases/TC-02/send")
    r = client.post("/api/test-cases/TC-39/send").json()
    assert r["result"]["action"] == "ignore"


def test_csr_takeover_keeps_agent_out():
    first = client.post("/api/test-cases/TC-01/send").json()
    client.post(f"/api/cases/{first['case_id']}/takeover", json={"csr": "Alex (CSR)"})
    r = client.post("/api/emails", json={"from": "mike.alvarez@pinehollowgc.example.com", "subject": "RE: Ship date for SO-104582",
                                         "body": "Thanks, can you also confirm the carrier?", "thread_id": first["thread_id"]}).json()
    assert r["result"]["action"] == "review"
    assert not [m for m in r["outbox"] if m["kind"] == "reply"]


def test_kill_switch_sends_everything_to_people():
    client.put("/api/config", json={"kill_switch": True})
    r = client.post("/api/test-cases/TC-01/send").json()
    assert r["result"]["action"] == "human"
    assert all(m["kind"] == "forward" for m in r["outbox"])


def test_draft_approval_and_warranty_approval():
    client.post("/api/test-cases/TC-01/send")
    client.post("/api/test-cases/TC-08/send")
    queue = client.get("/api/review-queue").json()
    kinds = {m["kind"] for m in queue}
    assert {"reply", "approval"} <= kinds
    for m in queue:
        assert client.post(f"/api/review/{m['id']}", json={"decision": "approve"}).status_code == 200
    sent = [m for m in client.get("/api/outbox").json() if m["kind"] == "reply" and m["status"] == "sent"]
    assert any(m["meta"].get("approved_by_csr") for m in sent)
    assert client.get("/api/metrics").json()["csr_feedback"]["good"] >= 2


def test_send_mode_sends_directly():
    client.put("/api/config", json={"categories": {"1": {"mode": "send"}}})
    r = client.post("/api/test-cases/TC-01/send").json()
    reply = [m for m in r["outbox"] if m["kind"] == "reply"][0]
    assert reply["status"] == "sent"
    assert "as of" in reply["body"]


def test_links_never_opened_and_pii_masked():
    r = client.post("/api/test-cases/RT-01/send").json()
    assert any("NOT opened" in t["title"] for t in r["trace"])
    r = client.post("/api/test-cases/TC-26/send").json()
    assert all("GSP-4417" not in m["body"] for m in r["outbox"])
