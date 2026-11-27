# GolfPM demo UI: spec and prompt for Google AI Studio

The backend runs locally at `http://localhost:8000` (`uvicorn golfpm.api:app --port 8000`).
CORS is open, so a UI built in AI Studio can call it directly from the browser.
Interactive API docs: `http://localhost:8000/docs`.

`web/index.html` is a plain test console for checking the backend. The demo UI is
meant to be built in AI Studio from the prompt below.

## Who the UI is for (from the 26 Nov call)

| Persona | What they see | Where it lives in production |
|---|---|---|
| Customer (golf course, distributor) | Sends an email, gets a reply in the same thread | Outlook, unchanged |
| CSR | Drafts to approve, edit or reject; warranty approvals; takeover of a thread | Outlook drafts and Teams cards (the demo shows them in one screen) |
| Admin / GolfPM owner | Volume, outcomes, SLA, kill switch, draft vs send per category | Dashboard (Power BI in production) |

For the client story: customers and CSRs keep working in Outlook and Teams. The only new screen is the admin dashboard. The demo shows the CSR queue in a web screen so the audience can see it.

## Screens

1. **Mailbox simulator**
   - Left: list of test emails from `GET /api/test-cases` (id, type, scenario). Clicking one calls `POST /api/test-cases/{id}/send`.
   - A "Compose" form posts to `POST /api/emails`.
2. **Case view** (shown after sending)
   - Outcome chips: action, category, confidence, method, duration and case ID.
   - A vertical **pipeline timeline** from `trace[]`, colored by `step`: intake, followup, triage, agent, guardrails, deliver, human, result. Each step can expand to show `detail` JSON.
   - Highlight these trace titles: "NOT opened", "masked", "Injected instructions", "Kill switch".
   - Outputs from `outbox[]`, grouped by `kind`: `reply` to customer, `forward` to owner, `teams` notification and `approval` card, with a `status` badge (`sent`, `pending_review`, `pending_approval`).
   - A "CSR take over thread" button calls `POST /api/cases/{case_id}/takeover`.
3. **CSR review queue**
   - Lists `GET /api/review-queue` items, each with an age vs SLA badge (`overdue` in red).
   - Each item shows an editable body (for `approval` items, show `meta.proposed_reply` and put the case summary `body` in a side panel).
   - Approve, Send edited and Reject buttons call `POST /api/review/{id}` with `{decision, body}`.
4. **Admin dashboard**
   - KPI tiles from `GET /api/metrics`.
   - Bar chart of `by_category`.
   - Per-category draft/send toggle, owner and SLA from `GET /api/config`, saved with `PUT /api/config` `{categories:{"1":{"mode":"send"}}}`.
   - Kill-switch toggle (`{kill_switch:true}`), AI-disclosure toggle (`{ai_disclosure:{enabled:false}}`) and confidence threshold.
5. **Evaluation**
   - A "Run test set" button calls `POST /api/evaluation/run?file=test_cases.json`.
   - Show a summary row (passed/total, routing accuracy, action accuracy, guardrail pass rate, safety cases) and a results table colored pass/fail.
   - "Generate synthetic" calls `POST /api/synthetic/generate?per_category=10`, then the set runs with `file=synthetic_cases.json`.
6. **Reset** calls `POST /api/reset?config=true`.

## Key response shapes

`POST /api/test-cases/{id}/send` and `POST /api/emails` return:

```json
{
  "id": "EML-D515A08E", "from_addr": "dana.price@fairwayirrigation.example.com",
  "subject": "Release hold on SO-TEST-104790", "body": "...", "case_id": "CASE-17BCD7FB", "thread_id": "THR-...",
  "result": {"action": "route", "reason": "Category 4 is triage-and-route; forwarded to ...",
             "category": 4, "confidence": 0.97, "method": "rules|llm|thread", "mode": "send|draft",
             "guardrails_passed": true, "duration_ms": 22},
  "trace": [{"step": "intake", "title": "Sender check: verified", "detail": {}}],
  "outbox": [{"id": "MSG-...", "kind": "reply|forward|teams|approval", "recipient": "...",
              "subject": "...", "body": "...", "status": "sent|pending_review|pending_approval", "meta": {}}]
}
```

`result.action` is one of `reply`, `ask`, `approval`, `route`, `escalate`, `review`, `file`, `ignore` or `human` (kill switch).

`GET /api/metrics` returns:

```json
{"mode": "...", "kill_switch": false, "emails": 1, "cases": 1,
 "by_category": {"1": {"name": "Order status", "count": 0}},
 "actions": {"route": 1}, "agent_handled": 0, "routed": 1, "escalated": 0, "ignored_or_filed": 0,
 "review_queue": 0, "overdue": 0, "guardrail_blocks": 0, "avg_processing_ms": 22, "csr_feedback": {}}
```

## Prompt to paste into AI Studio

> Build a single-page React + Tailwind web app called "GolfPM Agent Console" for a live client demo of an AI email agent for a golf irrigation manufacturer's product-management mailbox. It talks to a local REST API at `http://localhost:8000` (make the base URL a constant at the top).
>
> Tabs: Mailbox, CSR Review, Admin, Evaluation.
>
> - **Mailbox**
>   - Left column: test emails from `GET /api/test-cases` (fields: `id`, `type`, `scenario`, `from`, `subject`), grouped by `type`. Clicking one calls `POST /api/test-cases/{id}/send`. A Compose drawer posts `{from, subject, body}` to `POST /api/emails`.
>   - Right column: the returned email with outcome chips (`result.action`, `result.category`, `result.confidence`, `result.method`, `result.duration_ms`).
>   - A vertical animated timeline of `trace[]`. Each item has `step`, `title` and `detail`; color by step; `detail` is collapsible. Steps appear one after another with a short delay so the audience can follow the flow.
>   - Below the timeline, the `outbox[]` messages rendered as email cards with `kind` (reply, forward, teams, approval) and `status` badges. Teams notifications should look like a Teams card.
>   - A "CSR take over thread" button calls `POST /api/cases/{case_id}/takeover` with `{csr: "Demo CSR"}`.
> - **CSR Review**
>   - Items from `GET /api/review-queue` (fields: `id`, `kind`, `recipient`, `subject`, `body`, `meta.proposed_reply`, `age_minutes`, `sla_minutes`, `overdue`, `meta.blocked`).
>   - Each item has an editable textarea and Approve / Send edited / Reject buttons calling `POST /api/review/{id}` with `{decision: "approve"|"edit"|"reject", body}`.
>   - For `kind == "approval"`, the textarea holds `meta.proposed_reply`, and `body` is shown as the case summary.
> - **Admin**
>   - KPI tiles and a bar chart from `GET /api/metrics`.
>   - A per-category table from `GET /api/config` `.categories` (`name`, `mode` draft/send toggle, `owner`, `sla_minutes`); changes go to `PUT /api/config` with a partial object such as `{categories: {"1": {mode: "send"}}}`.
>   - A prominent red Kill switch toggle (`{kill_switch: true}`), an AI disclosure toggle and a confidence threshold slider.
> - **Evaluation**
>   - "Run test set" calls `POST /api/evaluation/run?file=test_cases.json` and shows `summary` (passed/total, routing_accuracy, action_accuracy, guardrail_pass_rate, safety_cases_passed) plus a results table (id, scenario, expected vs predicted category and action, pass/fail, reason).
>   - Buttons for `POST /api/synthetic/generate?per_category=10` and running `file=synthetic_cases.json`.
> - **Header:** mode badge from `GET /api/health` `.mode` and a Reset button (`POST /api/reset?config=true`).
>
> Style: clean enterprise look, neutral greys with a deep green accent, light and dark mode, readable at projector distance, no stock illustrations. Handle API errors with a toast.
