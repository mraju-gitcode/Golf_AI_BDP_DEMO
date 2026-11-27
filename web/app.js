// GolfPM Assist demo UI. Talks to the local FastAPI backend.
const API = "";  // same origin; set to "http://localhost:8000" if hosted elsewhere
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, opts = {}) {
  const r = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) { let m = await r.text(); try { m = JSON.parse(m).detail || m; } catch {} throw new Error(m); }
  return r.json();
}
function toast(msg, err = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast show" + (err ? " err" : "");
  clearTimeout(t._h); t._h = setTimeout(() => t.className = "toast", 3200);
}

const ACTION = {
  reply: ["Answered", "green"], ask: ["Asked customer", "water"], approval: ["Sent for approval", "warn"],
  route: ["Routed to owner", "water"], escalate: ["Escalated", "bad"], review: ["CSR review", "warn"],
  file: ["Filed, no reply", ""], ignore: ["Ignored", ""], human: ["Sent to people", "bad"],
};
const STEP = { intake: "Intake & protection", followup: "Follow-up agent", triage: "Triage", agent: "Agent",
  guardrails: "Output checks", deliver: "Delivery", human: "Person", result: "Outcome" };
const STATUS = { sent: ["Sent", "green"], pending_review: ["Draft · awaiting CSR", "warn"], pending_approval: ["Awaiting approval", "warn"],
  approved: ["Approved", "green"], rejected: ["Rejected", "bad"] };
const KIND = { reply: "Email to customer", forward: "Forwarded", teams: "Microsoft Teams", approval: "Approval card" };

let CONFIG = null, CASES = [], SENT = new Map(), listMode = "scenarios", activeId = null;

function catName(c) { return c && CONFIG ? `${c}. ${CONFIG.categories[c].short}` : "—"; }
function senderName(addr) {
  const local = (addr || "").split("@")[0];
  const m = local.match(/^([a-z]+)\.([a-z]+)$/);
  const cap = w => w[0].toUpperCase() + w.slice(1);
  if (m) return `${cap(m[1])} ${cap(m[2])}`;
  return `${cap(local.replace(/[._]/g, " "))} · ${org(addr)}`;
}
function org(addr) { return (addr || "").split("@")[1]?.replace(".example.com", "").replace(".example.net", "") || ""; }
function initials(addr) { return senderName(addr).split(" · ")[0].split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase(); }

// ---------------- navigation ----------------
$$(".nav-item").forEach(b => b.onclick = () => show(b.dataset.page));
function show(page) {
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  $$("main > section").forEach(s => s.classList.toggle("hidden", s.id !== "page-" + page));
  ({ review: loadQueue, dashboard: loadDash, settings: loadSettings }[page] || (() => {}))();
}

// ---------------- inbox ----------------
$$("#list-mode button").forEach(b => b.onclick = () => {
  listMode = b.dataset.mode; $$("#list-mode button").forEach(x => x.classList.toggle("on", x === b)); renderList();
});

async function renderList() {
  const el = $("#mail-list");
  if (listMode === "scenarios") {
    const groups = {};
    for (const c of CASES) {
      const key = c.id.startsWith("RT") ? "Security red-team" : c.expected.category ? catName(c.expected.category) : "Edge cases";
      (groups[key] ||= []).push(c);
    }
    el.innerHTML = Object.entries(groups).map(([g, items]) => `<div class="group-h">${esc(g)}</div>` + items.map(c => `
      <div class="mail ${activeId === c.id ? "active" : ""}" data-id="${c.id}">
        <div class="row1"><span class="sender">${esc(senderName(c.from))}</span><span class="tag">${c.id}</span></div>
        <div class="subj">${esc(c.subject)}</div>
        <div class="scn">${esc(c.scenario)}</div>
        ${SENT.has(c.id) ? '<span class="done tag green">sent</span>' : ""}
      </div>`).join("")).join("");
    $$(".mail", el).forEach(m => m.onclick = () => openScenario(m.dataset.id));
  } else {
    const emails = await api("/api/emails");
    el.innerHTML = emails.length ? emails.map(e => {
      const [label, tone] = ACTION[e.result?.action] || ["—", ""];
      return `<div class="mail ${activeId === e.id ? "active" : ""}" data-eid="${e.id}">
        <div class="row1"><span class="sender">${esc(senderName(e.from_addr))}</span><span class="tag ${tone}">${label}</span></div>
        <div class="subj">${esc(e.subject)}</div>
        <div class="scn">${esc(catName(e.result?.category))} · ${new Date(e.received_at * 1000).toLocaleTimeString()}</div></div>`;
    }).join("") : '<div class="empty"><div>No emails processed yet.</div></div>';
    $$(".mail", el).forEach(m => m.onclick = async () => { activeId = m.dataset.eid; renderList(); renderEmail(await api(`/api/emails/${m.dataset.eid}`), false); });
  }
}

async function openScenario(id) {
  if (!SENT.has(id)) return sendScenario(id);
  activeId = id; renderList();
  renderEmail(await api(`/api/emails/${SENT.get(id)}`), false, id);
}

async function sendScenario(id) {
  activeId = id; renderList();
  $("#detail").innerHTML = `<div class="card empty"><div><h3>Processing ${esc(id)}...</h3><p>Intake checks, triage and agent running.</p></div></div>`;
  try {
    const e = await api(`/api/test-cases/${id}/send`, { method: "POST" });
    SENT.set(id, e.id); renderList(); renderEmail(e, true, id); refreshCount();
  } catch (err) {
    $("#detail").innerHTML = `<div class="card card-b"><span class="tag bad">Cannot send</span> ${esc(err.message)}</div>`;
  }
}

$("#c-send").onclick = async () => {
  const body = { from: $("#c-from").value, subject: $("#c-subj").value, body: $("#c-body").value };
  if (!body.subject || !body.body) return toast("Add a subject and a message", true);
  try { activeId = null; const e = await api("/api/emails", { method: "POST", body: JSON.stringify(body) }); renderEmail(e, true); refreshCount(); toast("Email delivered to the GolfPM mailbox"); }
  catch (err) { toast(err.message, true); }
};

async function renderEmail(e, animate, resendId = null) {
  const r = e.result || {};
  const [label] = ACTION[r.action] || ["—"];
  const atts = (e.attachments || []).map(a => `<span class="tag">📎 ${esc(a.name)}</span>`).join("");
  $("#detail").innerHTML = `
    <div class="card card-b email-view">
      <div class="head">
        <div class="avatar">${esc(initials(e.from_addr))}</div>
        <div style="flex:1;min-width:0">
          <div class="subject">${esc(e.subject)}</div>
          <div class="small muted">${esc(senderName(e.from_addr))} &lt;${esc(e.from_addr)}&gt; · ${esc(org(e.from_addr))}${(e.cc || []).length ? " · cc " + esc(e.cc.join(", ")) : ""}</div>
        </div>
        ${resendId ? `<button class="btn" id="resend" title="Send the same email again (shows the duplicate guard)">Send again</button>` : ""}
        <button class="btn" id="takeover" title="A CSR takes this thread; the agent stays out">Take over thread</button>
      </div>
      <div class="body">${esc(e.body)}</div>
      ${atts ? `<div class="attachments">${atts}</div>` : ""}
      <div class="outcome">
        <div class="o hero"><div class="k">Outcome</div><div class="v">${esc(label)}</div></div>
        <div class="o"><div class="k">Category</div><div class="v">${esc(catName(r.category))}</div></div>
        <div class="o"><div class="k">Confidence</div><div class="v">${r.confidence != null ? Math.round(r.confidence * 100) + "%" : "—"}</div></div>
        <div class="o"><div class="k">Handled in</div><div class="v">${r.duration_ms ?? "—"} ms</div></div>
        <div class="o"><div class="k">Case</div><div class="v small">${esc(e.case_id)}</div></div>
      </div>
      <div class="reason">${esc(r.reason)}</div>
    </div>
    <div class="two">
      <div class="card"><div class="card-h"><h3>How the agent handled it</h3><span class="tag" style="margin-left:auto">${esc(r.method === "llm" ? "AI model" : r.method === "thread" ? "Thread memory" : "Rules engine")}</span></div>
        <div class="card-b timeline" id="tl"></div></div>
      <div class="card"><div class="card-h"><h3>What was sent</h3></div><div class="card-b" id="outs"></div></div>
    </div>`;
  $("#takeover").onclick = async () => {
    await api(`/api/cases/${e.case_id}/takeover`, { method: "POST", body: JSON.stringify({ csr: "GolfPM CSR" }) });
    toast("Thread assigned to a CSR. The agent will not reply on it.");
  };
  if (resendId) $("#resend").onclick = () => sendScenario(resendId);
  const tl = $("#tl"), outs = $("#outs");
  for (const [i, t] of e.trace.entries()) {
    const alert = /NOT opened|masked|Injected|FAILED|Kill switch|Suspicious|quarantin/i.test(t.title) || (t.step === "intake" && /lookalike|unknown/.test(t.title));
    const hasDetail = t.detail && Object.keys(t.detail).length;
    tl.insertAdjacentHTML("beforeend", `<div class="tl ${t.step} ${alert ? "alert" : ""}" style="animation-delay:${animate ? 0 : 0}ms">
      <div class="ico">${i + 1}</div><div class="stage">${esc(STEP[t.step] || t.step)}</div><div class="t">${esc(t.title)}</div>
      ${hasDetail ? `<details><summary>Details</summary><pre>${esc(JSON.stringify(t.detail, null, 2))}</pre></details>` : ""}</div>`);
    if (animate) await sleep(170);
  }
  if (!e.outbox.length) outs.innerHTML = '<p class="muted">No outbound messages. The email was filed or ignored by policy.</p>';
  for (const m of e.outbox) {
    const [st, tone] = STATUS[m.status] || [m.status, ""];
    outs.insertAdjacentHTML("beforeend", `<div class="msg ${m.kind}">
      <div class="mh"><span class="tag ${m.kind === "teams" ? "" : "green"}">${esc(KIND[m.kind] || m.kind)}</span>
        <span class="to">to <b>${esc(m.recipient)}</b></span><span class="tag ${tone} status">${esc(st)}</span></div>
      <div class="mb">${esc(m.body)}</div></div>`);
    if (animate) await sleep(120);
  }
}

// ---------------- review ----------------
async function refreshCount() {
  const q = await api("/api/review-queue");
  const c = $("#q-count"); c.textContent = q.length; c.classList.toggle("zero", !q.length);
  return q;
}
$("#q-refresh").onclick = () => loadQueue();
async function loadQueue() {
  const q = await refreshCount();
  const el = $("#queue");
  if (!q.length) { el.innerHTML = `<div class="card empty"><div><h3>All caught up</h3><p>No drafts or approvals waiting.</p></div></div>`; return; }
  el.innerHTML = q.map(m => {
    const approval = m.kind === "approval";
    return `<div class="card q">
      <div class="card-h">
        <span class="tag ${approval ? "warn" : "green"}">${approval ? "Warranty determination" : "Draft reply"}</span>
        <h3>${esc(m.subject)}</h3>
        ${m.meta.blocked ? '<span class="tag bad">Blocked by output checks</span>' : ""}
        ${m.meta.internal_sender ? '<span class="tag water">Internal sender</span>' : ""}
        <span class="tag ${m.overdue ? "bad" : ""}" style="margin-left:auto">${m.age_minutes} min · SLA ${m.sla_minutes} min</span>
      </div>
      <div class="card-b grid2">
        <div><div class="small muted" style="margin-bottom:4px">${approval ? "Reply to customer after approval" : "Reply to"} <b>${esc(approval ? m.meta.customer : m.recipient)}</b></div>
          <textarea class="edit" id="b-${m.id}">${esc(approval ? m.meta.proposed_reply : m.body)}</textarea>
          <div class="actions">
            <button class="btn primary" data-a="approve" data-id="${m.id}">${approval ? "Approve & send" : "Send"}</button>
            <button class="btn" data-a="edit" data-id="${m.id}">Send with my edits</button>
            <button class="btn danger" data-a="reject" data-id="${m.id}">Reject</button>
          </div></div>
        <div><div class="small muted" style="margin-bottom:4px">${approval ? "Case summary prepared by the Returns agent" : "Checks and sources"}</div>
          ${approval ? `<div class="mono">${esc(m.body)}</div>` : `<div class="mono">${esc((m.meta.checks || []).map(c => (c.passed ? "✓ " : "✗ ") + c.check).join("\n") || "No checks recorded")}${(m.meta.sources || []).length ? "\n\nSources:\n" + m.meta.sources.map(s => "• " + (s.title || "") + (s.section ? " / " + s.section : "") + (s.as_of ? " (as of " + s.as_of + ")" : "")).join("\n") : ""}</div>`}
        </div>
      </div></div>`;
  }).join("");
  $$("#queue button[data-a]").forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    await api(`/api/review/${b.dataset.id}`, { method: "POST", body: JSON.stringify({ decision: a, body: a === "edit" ? $("#b-" + b.dataset.id).value : null }) });
    toast(a === "reject" ? "Rejected. Feedback recorded for evaluation." : "Sent to the customer. Feedback recorded.");
    loadQueue();
  });
}

// ---------------- dashboard ----------------
$("#d-refresh").onclick = () => loadDash();
async function loadDash() {
  const m = await api("/api/metrics");
  const max = Math.max(1, ...Object.values(m.by_category).map(v => v.count));
  const kpi = (k, v, s = "", cls = "") => `<div class="card kpi ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const handledPct = m.emails ? Math.round(100 * m.agent_handled / m.emails) : 0;
  $("#dash").innerHTML = `
    <div class="kpis">
      ${kpi("Emails received", m.emails, `${m.cases} cases`, "accent")}
      ${kpi("Handled by agents", m.agent_handled, `${handledPct}% of email`)}
      ${kpi("Routed to owners", m.routed, "categories 4-9")}
      ${kpi("Escalated", m.escalated, "safety, legal, round limit")}
      ${kpi("Waiting for CSR", m.review_queue, `${m.overdue} past SLA`)}
      ${kpi("Avg first action", m.avg_processing_ms + " ms", "agent processing time")}
    </div>
    <div class="two" style="margin-top:0">
      <div class="card"><div class="card-h"><h3>Volume by category</h3></div><div class="card-b bars">
        ${Object.entries(m.by_category).map(([c, v]) => `<div class="bar"><span>${c}. ${esc(v.name)}</span>
          <div class="track"><div class="fill ${+c > 3 ? "route" : ""}" style="width:${100 * v.count / max}%"></div></div><span class="n">${v.count}</span></div>`).join("")}
        <div class="small muted"><span class="tag green">Agent handled</span> <span class="tag water">Routed</span></div></div></div>
      <div class="card"><div class="card-h"><h3>Outcomes</h3></div><div class="card-b">
        <table class="t"><tr><th>Outcome</th><th>Emails</th></tr>
        ${Object.entries(m.actions).sort((a, b) => b[1] - a[1]).map(([a, n]) => `<tr><td><span class="tag ${(ACTION[a] || [])[1] || ""}">${esc((ACTION[a] || [a])[0])}</span></td><td><b>${n}</b></td></tr>`).join("") || '<tr><td colspan="2" class="muted">No emails yet</td></tr>'}
        </table>
        <p class="small muted" style="margin-top:12px">Output checks blocked ${m.guardrail_blocks} replies · CSR feedback: ${Object.entries(m.csr_feedback).map(([k, v]) => `${v} ${k}`).join(", ") || "none yet"} · Mode: ${esc(m.mode)}${m.kill_switch ? ' · <b class="fail">Kill switch ON</b>' : ""}</p>
      </div></div>
    </div>`;
}

// ---------------- settings ----------------
async function saveCfg(patch, msg) { CONFIG = await api("/api/config", { method: "PUT", body: JSON.stringify(patch) }); toast(msg); loadSettings(); }
async function loadSettings() {
  CONFIG = await api("/api/config");
  const c = CONFIG;
  $("#settings").innerHTML = `
    <div class="card card-b killbox ${c.kill_switch ? "on" : ""}">
      <label class="switch kill"><input type="checkbox" id="ks" ${c.kill_switch ? "checked" : ""}><span class="sl"></span></label>
      <div><h3>Kill switch</h3><div class="small muted">Stop all automated replies. Every new email is forwarded to people unchanged, effective immediately.</div></div>
      <span class="tag ${c.kill_switch ? "bad" : "green"}" style="margin-left:auto">${c.kill_switch ? "Agent paused" : "Agent active"}</span>
    </div>
    <div class="card"><div class="card-h"><h3>Categories, owners and reply mode</h3></div><div class="card-b" style="overflow-x:auto">
      <table class="t"><tr><th>Category</th><th>Handling</th><th>Reply mode</th><th>Owner</th><th>SLA</th></tr>
      ${Object.entries(c.categories).map(([k, v]) => `<tr><td><b>${k}.</b> ${esc(v.name)}</td>
        <td><span class="tag ${v.pattern === "route" ? "water" : v.pattern === "approval" ? "warn" : "green"}">${v.pattern === "route" ? "Route to owner" : v.pattern === "approval" ? "Agent + CSR approval" : "Agent resolves"}</span></td>
        <td><div class="seg" data-cat="${k}">${["draft", "send"].map(o => `<button class="${v.mode === o ? "on" : ""}" data-m="${o}">${o === "draft" ? "Draft for CSR" : "Send directly"}</button>`).join("")}</div></td>
        <td>${esc(v.owner)}</td><td>${v.sla_minutes} min</td></tr>`).join("")}
      </table></div></div>
    <div class="card"><div class="card-h"><h3>Reply policy</h3></div><div class="card-b" style="display:grid;gap:14px">
      <label class="switch"><input type="checkbox" id="ai" ${c.ai_disclosure.enabled ? "checked" : ""}><span class="sl"></span>
        <span><b>AI disclosure footer</b><br><span class="small muted">${esc(c.ai_disclosure.text)}</span></span></label>
      <label class="switch"><input type="checkbox" id="cc" ${c.reply_to_cc ? "checked" : ""}><span class="sl"></span>
        <span><b>Include people copied on the email</b><br><span class="small muted">Off: replies go to the sender only.</span></span></label>
      <div><b>Confidence threshold</b> <span class="tag green" id="th-v">${Math.round(c.confidence_threshold * 100)}%</span>
        <div class="small muted">Emails below this go to a CSR to choose the category.</div>
        <input type="range" id="th" min="0.3" max="0.95" step="0.05" value="${c.confidence_threshold}" style="width:100%;accent-color:var(--rb-green)"></div>
      <div><b>Tech support round limit</b> <span class="tag green">${c.tech_support_max_rounds} rounds</span>
        <div class="small muted">After this many email rounds the case escalates to the Advanced Technical team.</div></div>
    </div></div>`;
  $("#ks").onchange = e => saveCfg({ kill_switch: e.target.checked }, e.target.checked ? "Kill switch ON: all email goes to people" : "Agent resumed");
  $("#ai").onchange = e => saveCfg({ ai_disclosure: { enabled: e.target.checked } }, "Reply policy updated");
  $("#cc").onchange = e => saveCfg({ reply_to_cc: e.target.checked }, "Reply policy updated");
  $("#th").oninput = e => $("#th-v").textContent = Math.round(e.target.value * 100) + "%";
  $("#th").onchange = e => saveCfg({ confidence_threshold: parseFloat(e.target.value) }, "Threshold updated");
  $$(".seg[data-cat] button").forEach(b => b.onclick = () => {
    const cat = b.parentElement.dataset.cat;
    saveCfg({ categories: { [cat]: { mode: b.dataset.m } } }, `Category ${cat}: ${b.dataset.m === "send" ? "sends directly" : "drafts for CSR"}`);
  });
}

// ---------------- quality ----------------
async function runEval(file, label) {
  $$("#page-quality .btn").forEach(b => b.disabled = true);
  $("#eval").innerHTML = `<div class="card empty"><div><h3>Running ${esc(label)}...</h3><p>Each email is replayed in a clean test mailbox.</p></div></div>`;
  try {
    const { summary: s, results } = await api("/api/evaluation/run?file=" + file, { method: "POST" });
    const ring = (k, p, sub) => `<div class="card kpi" style="display:flex;gap:14px;align-items:center"><div class="ring" style="--p:${p}"><span>${p}%</span></div><div><div class="k">${k}</div><div class="s">${sub}</div></div></div>`;
    const pct = x => Math.round(x * 100);
    $("#eval").innerHTML = `
      <div class="score">
        ${ring("Overall pass", pct(s.passed / s.total), `${s.passed} of ${s.total} emails`)}
        ${ring("Correct category", pct(s.routing_accuracy), "target 95% at go-live")}
        ${ring("Correct action", pct(s.action_accuracy), "act, ask, route, escalate")}
        ${ring("Output checks", pct(s.guardrail_pass_rate), "no leaks, prices or promises")}
        <div class="card kpi"><div class="k">Safety &amp; red-team</div><div class="v">${esc(s.safety_cases_passed)}</div><div class="s">${esc(s.method === "llm" ? "AI model" : "Rules engine")} · ${s.seconds}s</div></div>
      </div>
      <div class="card"><div class="card-h"><h3>${esc(label)} results</h3></div><div class="card-b" style="overflow-x:auto">
        <table class="t"><tr><th>ID</th><th>Scenario</th><th>Category (expected / got)</th><th>Action (expected / got)</th><th>Result</th><th>Why</th></tr>
        ${results.map(x => `<tr><td><b>${x.id}</b></td><td>${esc(x.scenario)}</td>
          <td>${esc(x.expected_category ?? "—")} / ${esc(x.predicted_category ?? "—")}</td>
          <td>${esc(x.expected_action)} / ${esc(x.predicted_action)}</td>
          <td class="${x.passed ? "pass" : "fail"}">${x.passed ? "Pass" : "Fail"}</td><td class="small muted">${esc(x.reason)}</td></tr>`).join("")}
        </table></div></div>`;
  } catch (e) { toast(e.message, true); }
  $$("#page-quality .btn").forEach(b => b.disabled = false);
}
$("#run-eval").onclick = () => runEval("test_cases.json", "GolfPM test set");
$("#run-syn").onclick = () => runEval("synthetic_cases.json", "Synthetic set");
$("#gen-syn").onclick = async () => { const r = await api("/api/synthetic/generate?per_category=10", { method: "POST" }); toast(`Generated ${r.written} synthetic emails`); };

// ---------------- header ----------------
$("#reset").onclick = async () => {
  await api("/api/reset?config=true", { method: "POST" });
  SENT.clear(); activeId = null; renderList(); refreshCount();
  $("#detail").innerHTML = `<div class="card empty"><div><h3>Demo reset</h3><p>Mailbox, cases and settings are back to the starting state.</p></div></div>`;
  toast("Demo reset");
};
$("#theme-btn").onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = cur === "dark" ? "light" : "dark";
  try { localStorage.setItem("golfpm-theme", document.documentElement.dataset.theme); } catch {}
};
try { const t = localStorage.getItem("golfpm-theme"); if (t) document.documentElement.dataset.theme = t; } catch {}

(async function init() {
  try {
    const [h, cfg, cases] = await Promise.all([api("/api/health"), api("/api/config"), api("/api/test-cases")]);
    CONFIG = cfg; CASES = cases;
    for (const e of (await api("/api/emails")).reverse()) if (e.test_id) SENT.set(e.test_id, e.id);
    $("#mode").textContent = h.llm ? "AI model connected" : "Offline rules mode";
    $("#mode-pill").classList.toggle("off", !h.llm);
    $("#mode-pill").title = h.mode;
    renderList(); refreshCount();
  } catch (e) { $("#mode").textContent = "Backend not reachable"; toast("Start the backend: uvicorn golfpm.api:app --port 8000", true); }
})();
