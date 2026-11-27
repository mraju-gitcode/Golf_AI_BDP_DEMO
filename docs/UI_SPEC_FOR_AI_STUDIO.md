# GolfPM Assist UI: spec and prompt for Google AI Studio

The backend runs locally at `http://localhost:8000` (`uvicorn golfpm.api:app --port 8000`).
CORS is open, so a UI built in AI Studio can call it directly from the browser.
Interactive API docs: `http://localhost:8000/docs`.

A finished Rain Bird-themed UI already ships with the backend at `http://localhost:8000` (`web/`). Use the prompt below to rebuild or restyle it in AI Studio; it matches the same look.

## Brand theme

| Token | Value | Use |
|---|---|---|
| Rain Bird green | `#018752` (sampled from the logo) | Primary buttons, active nav, outcome tile, header stripe, links |
| Green dark | `#006A40` | Hover states, text on light green tint |
| Green deep | `#004A2D` | Final timeline step, toasts |
| Green tint | `#E6F3ED` | Selected rows, active nav background, success tags |
| Water blue | `#0072BC` (tint `#E6F1FA`) | "Routed" category bars and tags, follow-up and human steps |
| Sun amber | `#F2A900` | Output-check step, warnings, offline-mode dot |
| Page background | `#F4F6F5` | Surfaces are white cards with a 1px `#DDE4E0` border and 10px radius |
| Text | `#1D2A24` primary, `#6F7F77` muted | |
| Fonts | Montserrat 600–800 for headings, Open Sans for body (Google Fonts) | |

- **Logo:** `web/assets/rainbird-logo.png` (green on transparent) and `web/assets/rainbird-logo-white.png` (white version for dark mode). Use the official file from Rain Bird's brand team if one is provided.
- **Header:** white, logo on the left, then a thin divider, then the product name "GolfPM Assist" in brand green with the subtitle "Golf Customer Support Agent". There is a 4px Rain Bird green stripe along the bottom edge.
- **Product name:** "GolfPM Assist". Keep a small "Demo · synthetic data" pill in the header.

## Who the UI is for (from the 26 Nov call)

| Persona | What they see | Where it lives in production |
|---|---|---|
| Customer (golf course, distributor) | Sends an email, gets a reply in the same thread | Outlook, unchanged |
| CSR | Drafts to approve, edit or reject; warranty approvals; takeover of a thread | Outlook drafts and Teams cards (the demo shows them in one screen) |
| Admin / GolfPM owner | Volume, outcomes, SLA, kill switch, draft vs send per category | Dashboard (Power BI in production) |

## Screens and API calls

| Screen | Calls |
|---|---|
| GolfPM Inbox | `GET /api/test-cases`, `POST /api/test-cases/{id}/send`, `POST /api/emails`, `GET /api/emails`, `GET /api/emails/{id}`, `POST /api/cases/{case_id}/takeover` |
| CSR Review | `GET /api/review-queue`, `POST /api/review/{id}` `{decision: approve\|edit\|reject, body}` |
| Dashboard | `GET /api/metrics` |
| Agent Settings | `GET /api/config`, `PUT /api/config` (partial object) |
| Quality & Testing | `POST /api/evaluation/run?file=test_cases.json\|synthetic_cases.json`, `POST /api/synthetic/generate?per_category=10` |
| Header | `GET /api/health`, `POST /api/reset?config=true` |

## Key response shapes

`POST /api/test-cases/{id}/send` and `POST /api/emails` return:

```json
{
  "id": "EML-D515A08E", "from_addr": "dana.price@fairwayirrigation.example.com",
  "subject": "Release hold on SO-TEST-104790", "body": "...", "case_id": "CASE-17BCD7FB", "thread_id": "THR-...",
  "attachments": [{"name": "warranty_form.pdf", "type": "application/pdf"}], "cc": [],
  "result": {"action": "route", "reason": "Category 4 is triage-and-route; forwarded to ...",
             "category": 4, "confidence": 0.97, "method": "rules|llm|thread", "mode": "send|draft",
             "guardrails_passed": true, "duration_ms": 22},
  "trace": [{"step": "intake", "title": "Sender check: verified", "detail": {}}],
  "outbox": [{"id": "MSG-...", "kind": "reply|forward|teams|approval", "recipient": "...",
              "subject": "...", "body": "...", "status": "sent|pending_review|pending_approval", "meta": {}}]
}
```

**`result.action` labels**

| Value | Label | Colour |
|---|---|---|
| `reply` | Answered | green |
| `ask` | Asked customer | blue |
| `approval` | Sent for approval | amber |
| `route` | Routed to owner | blue |
| `escalate` | Escalated | red |
| `review` | CSR review | amber |
| `file` | Filed, no reply | grey |
| `ignore` | Ignored | grey |
| `human` | Sent to people (kill switch) | red |

**`trace[].step` labels**

| Value | Label |
|---|---|
| `intake` | Intake & protection |
| `followup` | Follow-up agent |
| `triage` | Triage |
| `agent` | Agent |
| `guardrails` | Output checks |
| `deliver` | Delivery |
| `human` | Person |
| `result` | Outcome |

`GET /api/metrics` returns:

```json
{"mode": "...", "kill_switch": false, "emails": 1, "cases": 1,
 "by_category": {"1": {"name": "Order status", "count": 0}},
 "actions": {"route": 1}, "agent_handled": 0, "routed": 1, "escalated": 0, "ignored_or_filed": 0,
 "review_queue": 0, "overdue": 0, "guardrail_blocks": 0, "avg_processing_ms": 22, "csr_feedback": {}}
```

`GET /api/config` returns `kill_switch`, `confidence_threshold`, `tech_support_max_rounds`, `ai_disclosure {enabled, text}`, `reply_to_cc`, and `categories` keyed "1" to "9", each with `{name, short, pattern: agent|approval|route, mode: draft|send, owner, sla_minutes}`.

## Prompt to paste into AI Studio

Attach `web/assets/rainbird-logo.png` and `web/assets/rainbird-logo-white.png` to the AI Studio chat, then paste:

> Build a single-page React + Tailwind web app called **"GolfPM Assist"**. It is an internal tool branded for **Rain Bird**, the golf irrigation manufacturer. It should look and feel like a Rain Bird enterprise product. It is a live demo of an AI agent that handles the Golf Product Management shared mailbox. All data comes from a local REST API at `http://localhost:8000`; make the base URL a constant at the top.
>
> **Brand theme (follow exactly)**
>
> - **Primary colour:** Rain Bird green `#018752`.
> - **Supporting colours:**
>   - green dark `#006A40` (hover, text on tints)
>   - green deep `#004A2D`
>   - green tint `#E6F3ED`
>   - water blue `#0072BC` with tint `#E6F1FA`
>   - sun amber `#F2A900`
>   - page background `#F4F6F5`
>   - white cards with a 1px `#DDE4E0` border, 10px radius and a soft shadow
>   - text `#1D2A24`, muted text `#6F7F77`
> - **Fonts:** Google Fonts **Montserrat** (600/700/800) for headings and numbers, **Open Sans** for body text, JetBrains Mono for code and JSON.
> - **Header:**
>   - White, 64px tall, with a **4px `#018752` stripe** along the bottom.
>   - Left: the attached Rain Bird logo (green version, about 30px tall), a thin vertical divider, then "GolfPM Assist" in brand green Montserrat bold with the subtitle "Golf Customer Support Agent" in small muted text.
>   - Right: a status pill (green dot "AI model connected" when `GET /api/health` returns `llm: true`, amber dot "Offline rules mode" otherwise), a "Demo · synthetic data" pill, a Theme toggle, and a solid green "Reset demo" button (`POST /api/reset?config=true`).
> - **Dark mode:** dark green-black surfaces (`#0F1613` background, `#16201B` cards), the white logo version, and a brighter green `#2FB06A` for accents.
> - **Overall feel:** clean, calm, enterprise. No stock photos, no emoji, no gradients except the dashboard's first KPI tile (green dark to green). Readable on a projector.
>
> **Layout:** a white left sidebar (220px) with a "Workspace" group (GolfPM Inbox; CSR Review with a green count badge from `GET /api/review-queue`) and a "Management" group (Dashboard, Agent Settings, Quality & Testing). The active item has a green tint background and a 3px green left bar. The sidebar footer reads "GolfPM Assist · demo build / Prepared by Boston Data Pro". On mobile the sidebar becomes a horizontal tab strip.
>
> **1. GolfPM Inbox**
>
> - **Left column: an Outlook-style message list** with two modes, "Test scenarios" and "Processed".
>   - Scenarios come from `GET /api/test-cases`. Each has `id`, `type`, `scenario`, `from`, `subject` and `expected.category`.
>   - Group them under sticky headers by category name (`RT-` ids go under "Security red-team").
>   - Each row shows the sender name (from the email address), subject, scenario and an id tag.
>   - Clicking an unsent scenario calls `POST /api/test-cases/{id}/send`. Clicking one already sent reopens its result via `GET /api/emails/{email_id}` and shows a "Send again" button.
>   - Below the list, a Compose drawer posts `{from, subject, body}` to `POST /api/emails`.
> - **Right column: email detail card.**
>   - Avatar initials, subject, sender, body in a light panel, and attachment chips.
>   - A row of outcome tiles: **Outcome** (solid green tile, with a friendly label for `result.action`), Category, Confidence %, "Handled in" ms, and Case ID.
>   - A reason banner with a green left border showing `result.reason`.
>   - A "Take over thread" button calls `POST /api/cases/{case_id}/takeover` with `{csr: "GolfPM CSR"}`.
> - **Below it, two cards side by side.**
>   - **"How the agent handled it":** a vertical numbered timeline of `trace[]`. Each step shows an uppercase stage label mapped from `step` (intake → "Intake & protection", followup → "Follow-up agent", triage, agent, guardrails → "Output checks", deliver → "Delivery", human → "Person", result → "Outcome"), a title, and a collapsible "Details" JSON.
>     - Dot colours: green; amber for guardrails; blue for followup and human; red when the title mentions "NOT opened", "masked", "Injected", "Suspicious" or "Kill switch".
>     - Steps animate in one by one about 170ms apart.
>   - **"What was sent":** `outbox[]` rendered as message cards.
>     - Header with a kind tag (reply → "Email to customer", forward → "Forwarded", teams → "Microsoft Teams" with a purple `#464EB8` header bar, approval → "Approval card" with an amber border), the recipient, and a status tag (sent → green "Sent", pending_review → amber "Draft · awaiting CSR", pending_approval → amber "Awaiting approval").
>     - The body is pre-wrapped.
>
> **2. CSR Review**
>
> - Cards from `GET /api/review-queue`. Each item has `id`, `kind`, `recipient`, `subject`, `body`, `meta` (`proposed_reply`, `customer`, `blocked`, `internal_sender`, `checks[]`, `sources[]`), `age_minutes`, `sla_minutes` and `overdue`.
> - **Header:** tag "Draft reply" or "Warranty determination" (`kind == "approval"`), subject, a red "Blocked by output checks" tag if `meta.blocked`, and an age/SLA tag on the right (red when overdue).
> - **Left side:** an editable textarea (for approvals, `meta.proposed_reply`; otherwise `body`) with buttons "Approve & send" / "Send" (green), "Send with my edits", and "Reject" (red text). These call `POST /api/review/{id}` with `{decision: "approve"|"edit"|"reject", body}`.
> - **Right side:** a monospace panel. For approvals it shows `body` (the case summary); otherwise the ✓/✗ checks list and the sources.
> - Show a toast after each action.
>
> **3. Dashboard** (from `GET /api/metrics`)
>
> - Six KPI tiles. The first ("Emails received") is solid green with white text; the others are Handled by agents (with % of email), Routed to owners, Escalated, Waiting for CSR (with "N past SLA"), and Avg first action ms.
> - A horizontal bar chart "Volume by category" with categories 1–3 in green and 4–9 in water blue.
> - An "Outcomes" table of `actions` with coloured labels.
>
> **4. Agent Settings** (`GET /api/config`, `PUT /api/config` with partial objects)
>
> - A kill-switch panel with a large toggle. When on, the panel turns red-tinted and the tag reads "Agent paused". It sends `{kill_switch: true}`.
> - A table of the 9 categories: name, handling tag (agent → "Agent resolves" green, approval → "Agent + CSR approval" amber, route → "Route to owner" blue), a segmented control "Draft for CSR / Send directly" sending `{categories: {"1": {mode: "send"}}}`, the owner, and the SLA.
> - A "Reply policy" card with:
>   - an AI-disclosure toggle showing the disclosure text (`{ai_disclosure: {enabled}}`)
>   - an "Include people copied on the email" toggle (`{reply_to_cc}`)
>   - a confidence-threshold slider from 30–95% (`{confidence_threshold}`)
>   - the tech-support round limit
>
> **5. Quality & Testing**
>
> - Buttons: "Run GolfPM test set" (`POST /api/evaluation/run?file=test_cases.json`), "Generate synthetic emails" (`POST /api/synthetic/generate?per_category=10`) and "Run synthetic set" (`file=synthetic_cases.json`).
> - Show `summary` as ring/donut gauges in brand green: overall pass (`passed`/`total`), `routing_accuracy` ("target 95% at go-live"), `action_accuracy` and `guardrail_pass_rate`. Add a tile for `safety_cases_passed`.
> - Below, a results table: id, scenario, expected / predicted category, expected / predicted action, Pass (green) / Fail (red), and reason.
>
> Handle API errors with a toast (deep green background; red for errors). If the backend is unreachable, show "Backend not reachable" in the status pill.
