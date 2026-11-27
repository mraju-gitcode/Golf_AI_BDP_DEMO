# GolfPM Email Agent: local demo

A local, end-to-end demo of the GolfPM shared-mailbox agent for Rain Bird, built by Boston Data Pro.
It shows the flow every email goes through:

capture → protect → triage → agent or route → check → deliver

All data is synthetic. Nothing is deployed and no real mailbox is used.

## Run it

```bash
python3 -m venv .venv
. .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # add OPENAI_API_KEY (OPENAI_KEY also works) for LLM mode
uvicorn golfpm.api:app --port 8000
```

- Test console: http://localhost:8000
- API docs: http://localhost:8000/docs
- Demo UI (to build in Google AI Studio): see [docs/UI_SPEC_FOR_AI_STUDIO.md](docs/UI_SPEC_FOR_AI_STUDIO.md)

**Modes**
- **LLM mode** (key present): OpenAI models handle triage and write the replies. The default model is `gpt-5-mini`; set `GOLFPM_TRIAGE_MODEL` / `GOLFPM_REPLY_MODEL` to change it.
- **Offline mode** (no key, or `GOLFPM_MODE=offline`): deterministic rules do the same job, so the demo still runs with no network.

In both modes, the workflow code makes every control decision: who may see an order, round limits, approvals, output checks and the kill switch. Any model error falls back to offline behaviour, and the trace records it.

**Tests and evaluation**

```bash
python -m pytest -q                                   # 8 tests, offline
python -m golfpm.evaluation                           # Chris's 39 cases + 5 red-team cases
python -m golfpm.synthetic --per-category 20 [--llm]  # generate more synthetic emails
python -m golfpm.evaluation synthetic_cases.json
```

## What the demo covers

| Point (source) | Where |
|---|---|
| 9 categories; agent handles 1–3, routes 4–9 with a Teams alert (spec, SRS) | `golfpm/agents/*` |
| Order status: verified sender only, read-only lookup, as-of date in every reply (FR-04, FR-08, FR-09) | `agents/order_status.py` |
| Returns: collect missing details over several rounds, policy check, **CSR approves every determination** (FR-10, FR-11) | `agents/returns.py` |
| Tech support: approved sources only, citation, **3-round cap**, safety issues escalated (FR-12, FR-13, T-A5) | `agents/tech_support.py` |
| **Follow-up agent**: replies join the open case and skip triage; detects dissatisfaction and intent change (26 Nov call) | `agents/followup.py` |
| **Links never opened, attachments never executed**, look-alike domains, prompt injection removed, passcodes and cards masked (G-A5, Mani's phishing point) | `golfpm/intake.py` |
| Output checks: no prices, no other customer's orders, no internal notes, no hold reason, no promises (FR-15) | `golfpm/guardrails.py` |
| Draft vs send per category, kill switch, confidence threshold, admin config without code change (FR-16, FR-17, FR-21; G-Q14) | `data/config.json`, `/api/config` |
| **CSR takes over a thread; the agent stays out** (G-Q13) | `/api/cases/{id}/takeover` |
| **Duplicate emails**: one case, one reply; possible duplicate POs flagged (TC-39, Mani's duplicate PO point) | `intake.py`, `agents/router.py` |
| **AI disclosure footer** on/off and signature (G-Q5, G-Q18) | config `ai_disclosure`, `signature` |
| SLA per category, overdue items in the review queue (G-Q2, escalation timing) | `/api/review-queue`, `/api/metrics` |
| Every step traced; CSR feedback good/edited/wrong stored (FR-18, FR-19) | `store.py` events, feedback |
| Evaluation gate: E1–E4 from the design canvas, safety and red-team pass rate | `golfpm/evaluation.py` |

## How the demo maps to the target architecture

| Demo (local) | Production (Azure, per the architecture deck) |
|---|---|
| LangGraph `StateGraph` in `pipeline.py` | Logic Apps workflow + Foundry agents (or LangGraph on Container Apps) |
| `POST /api/emails` | Exchange Online trigger / Graph change notifications |
| `intake.py` | Intake workflow, Prompt Shields, Defender malware scan, Document Intelligence |
| `llm.py` (OpenAI) | Azure OpenAI through one governed model gateway |
| `knowledge.py` over `data/kb` | Azure AI Search / Foundry IQ synced from Box and rainbird.com |
| `data/orders.json` | `RBMG_ORDERS_BY_DATE` feed, later read-only PeopleSoft via API Management |
| SQLite `store.py` | Cosmos DB / PostgreSQL case store |
| outbox `teams` / `approval` | Teams notifications and adaptive approval cards |

## Demo script (about 10 minutes)

1. **TC-01**: known contact, order status. Walk the trace: sender verified, triage, lookup, as-of date, checks passed, draft for CSR.
2. **TC-04 / RT-03**: unknown sender and look-alike domain. No order data is released.
3. **TC-13 → TC-16**: tech support with a cited source, then round 3. The follow-up agent skips triage and escalates with a thread summary.
4. **TC-17**: troubleshooting turns into a warranty claim. The case moves to Returns.
5. **TC-08**: warranty form. The case summary goes to the CSR review tab for approval.
6. **TC-26, RT-01, TC-35**: passcode masked, phishing link not opened, injection removed.
7. **TC-21, TC-27**: routing with Teams notifications and acknowledgements that commit to nothing.
8. **Admin**: switch order status to send mode, turn on the kill switch, resend TC-01, and show it goes to people.
9. **Evaluation**: run the test set and show the pass rates, including safety cases.

## Synthetic data and placeholders

- `data/test_cases.json`: Chris's 39 test cases (BDP_Rainbird_GolfPM_Sample_Test_Cases.xlsx) with structured expected outcomes, plus red-team cases RT-01 to RT-05.
- `data/kb/*.md`: **synthetic placeholder** troubleshooting and warranty text. It is not Rain Bird content and must be replaced with approved sources.
- `data/orders.json`, `data/contacts.json`: invented accounts and orders (example.com domains, TEST- numbers).

Where a test case depends on an open question, the demo uses a stated default:

| Open item | Default used |
|---|---|
| G-Q4 (language) | English only; other languages go to a person |
| G-Q6 (CC policy) | Reply to the sender only |
| G-Q7 (internal sender) | Draft for a CSR |
| R-Q6 (non-warranty returns) | Route to a CSR |
| X-Q2 (general inquiries) | Answer catalog requests with the public link |
| H-Q7 (internal hold notices) | File, with an FYI to the hold owner |

Each of these is a config value or a single rule to change once Rain Bird answers.
