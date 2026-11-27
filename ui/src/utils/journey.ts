import type {
  EvaluationRunResponse,
  ProcessedEmail,
  TestCaseItem,
} from '../types/golfpm';
import { getActionDisplay, normalizePercent } from './formatters';

export type ScenarioFilter = 'all' | 'agent' | 'approval' | 'route' | 'security';

export interface LifecycleNode {
  id: 'customer' | 'agent' | 'handoff' | 'delivery';
  label: string;
  persona: string;
  detail: string;
  state: 'done' | 'waiting' | 'alert' | 'skipped';
}

export interface DemoStageDefinition {
  id:
    | 'instant_reply'
    | 'smart_routing'
    | 'human_review'
    | 'security_redteam'
    | 'kill_switch'
    | 'go_live_proof';
  number: number;
  title: string;
  personaFlow: string;
  summary: string;
  clientQuestion: string;
  presenterTip: string;
  ctaLabel: string;
}

export const DEMO_STAGES: DemoStageDefinition[] = [
  {
    id: 'instant_reply',
    number: 1,
    title: 'Instant order answer in Outlook',
    personaFlow: 'Customer → GolfPM Agent → Customer (Outlook)',
    summary:
      'A golf course or distributor emails about an order status. GolfPM Assist verifies the sender, looks up order context, runs output checks, and prepares a clear reply in the same thread.',
    clientQuestion: '“Do our customers or distributors have to learn a new portal?”',
    presenterTip:
      'Point out the Outlook preview and response time (ms). Emphasize that customers stay in their normal email client and see zero workflow change.',
    ctaLabel: 'Open the order status email',
  },
  {
    id: 'smart_routing',
    number: 2,
    title: 'Triage & route complex requests',
    personaFlow: 'Distributor → GolfPM Agent → Owner + Microsoft Teams',
    summary:
      'For categories 4–9 (PM order holds, product and SKU questions, CirrusPRO/GSP, purchase orders, quotes and tariffs, general mail), the agent does not guess. It extracts the key order details, forwards to the right Rain Bird owner, and posts an actionable Teams card.',
    clientQuestion: '“What about requests the AI should never answer on its own?”',
    presenterTip:
      'Highlight the purple Microsoft Teams card and the forwarded owner email. Explain that categories 4–9 are strictly triage-and-route by policy.',
    ctaLabel: 'Open the hold-release email',
  },
  {
    id: 'human_review',
    number: 3,
    title: 'CSR draft review & warranty sign-off',
    personaFlow: 'Customer → Agent Draft → CSR Review → Customer',
    summary:
      'Technical support drafts and warranty determinations wait in the CSR Review queue with output checks, source citations, and SLA timers until a CSR clicks Approve, Edit, or Reject.',
    clientQuestion: '“How do we stop the AI from sending a wrong warranty or tech answer?”',
    presenterTip:
      'Run the scenario, jump into CSR Review, edit a single sentence live, and click "Send with my edits" to prove CSRs keep final control on Day 1.',
    ctaLabel: 'Open the warranty claim email',
  },
  {
    id: 'security_redteam',
    number: 4,
    title: 'Red-team security & prompt-injection defense',
    personaFlow: 'Untrusted Sender → Intake Protection → Blocked / Escalated',
    summary:
      'When an email tries prompt injection, spoofing, or unsafe attachments, intake protection and guardrails stop it before any unauthorized reply or credit is issued.',
    clientQuestion: '“What if someone tries to trick the AI into leaking another customer’s orders?”',
    presenterTip:
      'Expand a red trace step’s Details JSON to show the exact audit trail. Every blocked attempt is logged for security and compliance review.',
    ctaLabel: 'Open the phishing email',
  },
  {
    id: 'kill_switch',
    number: 5,
    title: 'Instant kill switch & gradual rollout controls',
    personaFlow: 'Admin / GolfPM Owner → Agent Settings → Immediate Policy Change',
    summary:
      'Admins can toggle any of the 9 categories between "Draft for CSR" and "Send directly", tune the confidence threshold, or flip the Emergency Kill Switch to route 100% of mail to people.',
    clientQuestion: '“What if we want to pause automation immediately during peak season?”',
    presenterTip:
      'Toggle the Emergency Kill Switch ON so the panel turns red ("Agent paused"), then remind them CSRs can also take over any individual thread with one click.',
    ctaLabel: 'Open the kill switch',
  },
  {
    id: 'go_live_proof',
    number: 6,
    title: 'Executive metrics & 95% go-live accuracy gate',
    personaFlow: 'Admin / GolfPM Owner → Dashboard & Quality Benchmark',
    summary:
      'Close with measurable proof: live email volume, SLA overdue tracking, and automated evaluation gauges measured against the 95% go-live routing accuracy target and red-team safety checks.',
    clientQuestion: '“How do we prove accuracy before turning this on for real customers?”',
    presenterTip:
      'Run the GolfPM test set live to display the green donut gauges and safety score, then show the Dashboard KPIs (which map to Power BI in production).',
    ctaLabel: 'Open the accuracy benchmark',
  },
];

export function classifyTestCaseFilter(tc: TestCaseItem): Exclude<ScenarioFilter, 'all'> {
  if (tc.id.toUpperCase().startsWith('RT-') || tc.type === 'red_team') {
    return 'security';
  }
  const catNum = Number(tc.expected?.category);
  const action = (tc.expected?.action ?? '').toLowerCase();

  if (action === 'approval' || action === 'review' || catNum === 3) {
    return 'approval';
  }
  if (action === 'route' || (Number.isFinite(catNum) && catNum >= 4)) {
    return 'route';
  }
  return 'agent';
}

export function filterTestCases(
  testCases: TestCaseItem[],
  filter: ScenarioFilter,
  query: string,
): TestCaseItem[] {
  const q = query.trim().toLowerCase();
  return testCases.filter((tc) => {
    if (filter !== 'all' && classifyTestCaseFilter(tc) !== filter) {
      return false;
    }
    if (!q) return true;
    return (
      tc.id.toLowerCase().includes(q) ||
      tc.subject.toLowerCase().includes(q) ||
      tc.scenario.toLowerCase().includes(q) ||
      tc.from.toLowerCase().includes(q)
    );
  });
}

export function pickScenarioForStage(
  stageId: DemoStageDefinition['id'],
  testCases: TestCaseItem[],
): TestCaseItem | null {
  if (testCases.length === 0) return null;

  const isRedTeam = (tc: TestCaseItem) =>
    tc.id.toUpperCase().startsWith('RT-') || tc.type === 'red_team';

  if (stageId === 'instant_reply') {
    return (
      testCases.find((tc) => !isRedTeam(tc) && Number(tc.expected?.category) === 1) ??
      testCases.find((tc) => !isRedTeam(tc) && tc.expected?.action === 'reply') ??
      testCases.find((tc) => !isRedTeam(tc)) ??
      null
    );
  }

  if (stageId === 'smart_routing') {
    return (
      testCases.find((tc) => !isRedTeam(tc) && Number(tc.expected?.category) === 4) ??
      testCases.find((tc) => !isRedTeam(tc) && tc.expected?.action === 'route') ??
      testCases.find((tc) => !isRedTeam(tc) && Number(tc.expected?.category) >= 4) ??
      null
    );
  }

  if (stageId === 'human_review') {
    return (
      testCases.find((tc) => !isRedTeam(tc) && tc.expected?.action === 'approval') ??
      testCases.find((tc) => !isRedTeam(tc) && Number(tc.expected?.category) === 3) ??
      testCases.find(
        (tc) =>
          !isRedTeam(tc) &&
          (tc.expected?.action === 'approval' || tc.expected?.action === 'review'),
      ) ??
      testCases.find((tc) => !isRedTeam(tc) && Number(tc.expected?.category) === 2) ??
      null
    );
  }

  if (stageId === 'security_redteam') {
    return testCases.find((tc) => isRedTeam(tc)) ?? null;
  }

  return null;
}

export function computeEmailLifecycle(email: ProcessedEmail): {
  nodes: LifecycleNode[];
  needsCsrReview: boolean;
} {
  const action = (email.result?.action ?? '').toLowerCase();
  const outbox = email.outbox ?? [];
  const hasPendingReview = outbox.some(
    (m) => m.status === 'pending_review' || m.status === 'pending_approval',
  );
  const hasSentCustomerReply = outbox.some(
    (m) => m.kind === 'reply' && m.status === 'sent',
  );
  const hasForwardedOrTeams = outbox.some(
    (m) => m.kind === 'forward' || m.kind === 'teams',
  );
  const guardrailsPassed = email.result?.guardrails_passed !== false;
  const actionLabel = getActionDisplay(action).label;

  const isSecurityOrEscalated = action === 'escalate' || action === 'human';
  const needsCsrReview =
    hasPendingReview || action === 'review' || action === 'approval';

  const node1: LifecycleNode = {
    id: 'customer',
    label: '1. Inbound email',
    persona: 'Customer (Outlook)',
    detail: email.attachments?.length
      ? `Received with ${email.attachments.length} attachment${email.attachments.length > 1 ? 's' : ''}`
      : 'Received in GolfPM mailbox',
    state: 'done',
  };

  const node2: LifecycleNode = {
    id: 'agent',
    label: '2. AI triage & checks',
    persona: 'GolfPM Assist',
    detail: `${normalizePercent(email.result?.confidence)}% confidence · ${
      guardrailsPassed ? 'Checks passed' : 'Flagged by checks'
    }`,
    state: !guardrailsPassed || isSecurityOrEscalated ? 'alert' : 'done',
  };

  let node3: LifecycleNode;
  if (email.taken_over) {
    node3 = {
      id: 'handoff',
      label: '3. CSR takeover',
      persona: 'CSR (Outlook / Teams)',
      detail: 'Human CSR owns thread',
      state: 'done',
    };
  } else if (needsCsrReview) {
    node3 = {
      id: 'handoff',
      label: '3. CSR review gate',
      persona: 'CSR (Review Queue)',
      detail: action === 'approval' ? 'Awaiting warranty sign-off' : 'Draft awaiting CSR approval',
      state: 'waiting',
    };
  } else if (action === 'route' || hasForwardedOrTeams) {
    node3 = {
      id: 'handoff',
      label: '3. Routed to owner',
      persona: 'Rain Bird Owner / Teams',
      detail: 'Forwarded with case context',
      state: 'done',
    };
  } else if (isSecurityOrEscalated) {
    node3 = {
      id: 'handoff',
      label: '3. Escalated to team',
      persona: 'CSR / Security',
      detail: actionLabel,
      state: 'alert',
    };
  } else if (action === 'ignore' || action === 'file') {
    node3 = {
      id: 'handoff',
      label: '3. No handoff needed',
      persona: 'Mailbox Archive',
      detail: actionLabel,
      state: 'skipped',
    };
  } else {
    node3 = {
      id: 'handoff',
      label: '3. Auto-resolved',
      persona: 'Zero CSR effort',
      detail: 'Handled end-to-end by agent',
      state: 'done',
    };
  }

  let node4: LifecycleNode;
  if (hasSentCustomerReply) {
    node4 = {
      id: 'delivery',
      label: '4. Customer reply',
      persona: 'Customer (Outlook)',
      detail: 'Replied in same thread',
      state: 'done',
    };
  } else if (needsCsrReview) {
    node4 = {
      id: 'delivery',
      label: '4. Customer reply',
      persona: 'Customer (Outlook)',
      detail: 'Held until CSR approves',
      state: 'waiting',
    };
  } else if (isSecurityOrEscalated) {
    node4 = {
      id: 'delivery',
      label: '4. Customer reply',
      persona: 'Protected',
      detail: 'No automated reply sent',
      state: 'alert',
    };
  } else if (action === 'route') {
    node4 = {
      id: 'delivery',
      label: '4. Owner follow-up',
      persona: 'Customer (Outlook)',
      detail: 'Assigned owner responds',
      state: 'done',
    };
  } else {
    node4 = {
      id: 'delivery',
      label: '4. Final state',
      persona: 'Mailbox',
      detail: actionLabel,
      state: action === 'ignore' || action === 'file' ? 'skipped' : 'done',
    };
  }

  return {
    nodes: [node1, node2, node3, node4],
    needsCsrReview,
  };
}

export interface DemoProgressInput {
  processedEmails: ProcessedEmail[];
  sentTestCaseIds: string[];
  reviewedCount: number;
  settingsVisited: boolean;
  evaluation: EvaluationRunResponse | null;
}

export function computeCompletedDemoStages(
  input: DemoProgressInput,
): Record<DemoStageDefinition['id'], boolean> {
  const { processedEmails, sentTestCaseIds, reviewedCount, settingsVisited, evaluation } = input;

  const hasCat1OrReply = processedEmails.some(
    (e) => Number(e.result?.category) === 1 || e.result?.action === 'reply',
  );
  const hasRoute = processedEmails.some(
    (e) =>
      e.result?.action === 'route' ||
      (Number(e.result?.category) >= 4 && e.result?.action !== 'escalate'),
  );
  const hasReviewOrApproval =
    reviewedCount > 0 ||
    processedEmails.some(
      (e) =>
        e.result?.action === 'review' ||
        e.result?.action === 'approval' ||
        Number(e.result?.category) === 3,
    );
  const hasRedTeam =
    sentTestCaseIds.some((id) => id.toUpperCase().startsWith('RT-')) ||
    processedEmails.some(
      (e) => e.result?.action === 'escalate' || e.result?.guardrails_passed === false,
    );

  return {
    instant_reply: hasCat1OrReply,
    smart_routing: hasRoute,
    human_review: hasReviewOrApproval,
    security_redteam: hasRedTeam,
    kill_switch: settingsVisited,
    go_live_proof: Boolean(evaluation),
  };
}
