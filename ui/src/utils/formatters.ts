import type {
  EvaluationCaseResult,
  ReviewCheck,
  TestCaseItem,
  TraceStep,
} from '../types/golfpm';

export type ToneColor = 'green' | 'blue' | 'amber' | 'red' | 'grey';

export interface ActionDisplay {
  label: string;
  color: ToneColor;
}

export const DEFAULT_CATEGORY_NAMES: Record<string, string> = {
  '1': 'Order status',
  '2': 'Returns & warranty',
  '3': 'Tech support',
  '4': 'PM order holds',
  '5': 'Product & SKU',
  '6': 'CirrusPRO / GSP',
  '7': 'Purchase orders',
  '8': 'Quotes & pricing',
  '9': 'Other',
};

const ACTION_MAP: Record<string, ActionDisplay> = {
  reply: { label: 'Answered', color: 'green' },
  ask: { label: 'Asked customer', color: 'blue' },
  approval: { label: 'Sent for approval', color: 'amber' },
  route: { label: 'Routed to owner', color: 'blue' },
  escalate: { label: 'Escalated', color: 'red' },
  review: { label: 'CSR review', color: 'amber' },
  file: { label: 'Filed, no reply', color: 'grey' },
  ignore: { label: 'Ignored', color: 'grey' },
  human: { label: 'Sent to people (kill switch)', color: 'red' },
};

export function getActionDisplay(action?: string | null): ActionDisplay {
  if (!action) {
    return { label: 'Processed', color: 'grey' };
  }
  const key = action.toLowerCase().trim();
  return ACTION_MAP[key] ?? { label: action.replace(/_/g, ' '), color: 'grey' };
}

const TRACE_STEP_LABELS: Record<string, string> = {
  intake: 'Intake & protection',
  followup: 'Follow-up agent',
  triage: 'Triage',
  agent: 'Agent',
  guardrails: 'Output checks',
  deliver: 'Delivery',
  human: 'Person',
  result: 'Outcome',
};

export function getTraceStepLabel(step: string): string {
  const key = step.toLowerCase().trim();
  return TRACE_STEP_LABELS[key] ?? step;
}

const TRACE_DANGER_PATTERNS = [
  'not opened',
  'masked',
  'injected',
  'suspicious',
  'kill switch',
];

export type TraceDotTone = 'green' | 'amber' | 'blue' | 'red' | 'deep';

export function getTraceDotTone(step: TraceStep): TraceDotTone {
  const titleLower = (step.title ?? '').toLowerCase();
  if (TRACE_DANGER_PATTERNS.some((pattern) => titleLower.includes(pattern))) {
    return 'red';
  }
  const key = (step.step ?? '').toLowerCase().trim();
  if (key === 'guardrails') return 'amber';
  if (key === 'followup' || key === 'human') return 'blue';
  if (key === 'result') return 'deep';
  return 'green';
}

export function getOutboxKindLabel(kind: string): string {
  switch (kind.toLowerCase()) {
    case 'reply':
      return 'Email to customer';
    case 'forward':
      return 'Forwarded';
    case 'teams':
      return 'Microsoft Teams';
    case 'approval':
      return 'Approval card';
    default:
      return kind;
  }
}

export function getOutboxStatusDisplay(status: string): ActionDisplay {
  switch (status.toLowerCase()) {
    case 'sent':
      return { label: 'Sent', color: 'green' };
    case 'pending_review':
      return { label: 'Draft · awaiting CSR', color: 'amber' };
    case 'pending_approval':
      return { label: 'Awaiting approval', color: 'amber' };
    case 'rejected':
      return { label: 'Rejected', color: 'red' };
    default:
      return { label: status.replace(/_/g, ' '), color: 'grey' };
  }
}

export function getPatternDisplay(pattern: string): ActionDisplay {
  switch (pattern.toLowerCase()) {
    case 'agent':
      return { label: 'Agent resolves', color: 'green' };
    case 'approval':
      return { label: 'Agent + CSR approval', color: 'amber' };
    case 'route':
      return { label: 'Route to owner', color: 'blue' };
    default:
      return { label: pattern, color: 'grey' };
  }
}

export function extractSenderName(emailAddress?: string | null): string {
  if (!emailAddress) return 'Unknown sender';
  const trimmed = emailAddress.trim();
  // Support "Display Name <addr@example.com>"
  const angleIdx = trimmed.indexOf('<');
  if (angleIdx > 0) {
    const displayName = trimmed.slice(0, angleIdx).replace(/["']/g, '').trim();
    if (displayName) return displayName;
  }
  const localPart = trimmed.split('@')[0]?.replace(/^<|>$/g, '') ?? trimmed;
  const parts = localPart
    .split(/[._+-]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return trimmed;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function getInitials(emailOrName?: string | null): string {
  const name = emailOrName?.includes('@')
    ? extractSenderName(emailOrName)
    : (emailOrName ?? '').trim();
  if (!name) return 'GP';
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export interface TestCaseGroup {
  key: string;
  label: string;
  order: number;
  items: TestCaseItem[];
}

export function groupTestCases(
  testCases: TestCaseItem[],
  categoryNameMap: Record<string, string> = DEFAULT_CATEGORY_NAMES,
): TestCaseGroup[] {
  const map = new Map<string, TestCaseGroup>();

  for (const tc of testCases) {
    const isRedTeam = tc.id.toUpperCase().startsWith('RT-') || tc.type === 'red_team';
    let key: string;
    let label: string;
    let order: number;

    if (isRedTeam) {
      key = 'security-red-team';
      label = 'Security red-team';
      order = 999;
    } else {
      const catVal = tc.expected?.category;
      const catStr = catVal !== undefined && catVal !== null ? String(catVal) : '';
      if (catStr) {
        const num = Number(catStr);
        const resolvedName =
          tc.category_name || categoryNameMap[catStr] || `Category ${catStr}`;
        key = `cat-${catStr}`;
        label = Number.isFinite(num) ? `Cat ${catStr} · ${resolvedName}` : resolvedName;
        order = Number.isFinite(num) ? num : 500;
      } else {
        key = 'other';
        label = tc.category_name || 'General & edge cases';
        order = 900;
      }
    }

    const existing = map.get(key);
    if (existing) {
      existing.items.push(tc);
    } else {
      map.set(key, { key, label, order, items: [tc] });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

/**
 * Normalizes a rate/confidence value that might be 0..1 or 0..100 into 0..100 integer/float.
 */
export function normalizePercent(value?: number | null): number {
  if (value === undefined || value === null || Number.isNaN(value)) return 0;
  if (value <= 1 && value >= 0) {
    return Math.round(value * 100);
  }
  return Math.round(Math.max(0, Math.min(100, value)));
}

export function formatCategoryLabel(
  category: number | string | null | undefined,
  categoryName?: string,
  categoryMap: Record<string, string> = DEFAULT_CATEGORY_NAMES,
): string {
  if (category === null || category === undefined || category === '') {
    return 'Uncategorised';
  }
  const catStr = String(category);
  const name = categoryName || categoryMap[catStr];
  return name ? `${catStr} · ${name}` : `Category ${catStr}`;
}

export function formatSlaDuration(minutes?: number | null): string {
  if (minutes === undefined || minutes === null || Number.isNaN(minutes)) return '—';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export interface NormalizedCheck {
  label: string;
  passed: boolean;
  detail?: string;
}

export function normalizeReviewCheck(check: ReviewCheck | string): NormalizedCheck {
  if (typeof check === 'string') {
    const failed =
      check.startsWith('✗') ||
      check.startsWith('x ') ||
      check.toLowerCase().includes('fail') ||
      check.toLowerCase().includes('block');
    const cleanLabel = check.replace(/^[✓✗✔✘]\s*/, '').trim();
    return { label: cleanLabel, passed: !failed };
  }
  const label = check.label || check.name || check.check || 'Output check';
  const passed =
    typeof check.passed === 'boolean'
      ? check.passed
      : typeof check.ok === 'boolean'
        ? check.ok
        : true;
  const detail = check.detail || check.message;
  return { label, passed, detail };
}

export function normalizeReviewSource(
  source: string | { title?: string; name?: string; source?: string; url?: string },
): string {
  if (typeof source === 'string') return source;
  const title = source.title || source.name || source.source || 'Knowledge source';
  return source.url ? `${title} (${source.url})` : title;
}

export interface ComposeValidationResult {
  valid: boolean;
  errors: {
    from?: string;
    subject?: string;
    body?: string;
  };
}

export function validateComposeEmail(input: {
  from: string;
  subject: string;
  body: string;
}): ComposeValidationResult {
  const errors: ComposeValidationResult['errors'] = {};
  const fromTrim = input.from.trim();
  const subjectTrim = input.subject.trim();
  const bodyTrim = input.body.trim();

  if (!fromTrim) {
    errors.from = 'Sender email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromTrim)) {
    errors.from = 'Enter a valid email address.';
  }

  if (!subjectTrim) {
    errors.subject = 'Subject is required.';
  }

  if (!bodyTrim) {
    errors.body = 'Message body is required.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface NormalizedEvalRow {
  id: string;
  scenario: string;
  expectedCategory: string;
  predictedCategory: string;
  expectedAction: string;
  predictedAction: string;
  passed: boolean;
  reason: string;
}

export function normalizeEvalRow(row: EvaluationCaseResult): NormalizedEvalRow {
  const expCat = row.expected_category ?? row.expected?.category;
  const predCat =
    row.predicted_category ?? row.actual_category ?? row.predicted?.category;
  const expAct = row.expected_action ?? row.expected?.action ?? '—';
  const predAct =
    row.predicted_action ?? row.actual_action ?? row.predicted?.action ?? '—';
  const passed =
    typeof row.passed === 'boolean'
      ? row.passed
      : typeof row.pass === 'boolean'
        ? row.pass
        : false;

  return {
    id: row.id,
    scenario: row.scenario ?? '—',
    expectedCategory:
      expCat !== undefined && expCat !== null && expCat !== '' ? String(expCat) : '—',
    predictedCategory:
      predCat !== undefined && predCat !== null && predCat !== '' ? String(predCat) : '—',
    expectedAction: expAct,
    predictedAction: predAct,
    passed,
    reason: row.reason ?? '—',
  };
}
