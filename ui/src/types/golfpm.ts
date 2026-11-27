export type NavSection = 'journey' | 'inbox' | 'review' | 'knowledge' | 'dashboard' | 'settings' | 'testing';

export interface KnowledgeDocument {
  id: string;
  title: string;
  file: string;
  format: string;
  doc_type: string;
  owner: string;
  location: string;
  updated: string;
  audience: 'public' | 'internal' | 'customer';
  indexed: boolean;
  sections: string[];
  usage: string;
}

export interface KnowledgeResponse {
  documents: KnowledgeDocument[];
  stats: { total: number; indexed: number; public: number; internal: number };
}

export type BackendStatus = 'checking' | 'connected_llm' | 'connected_rules' | 'unreachable';

export interface HealthResponse {
  status?: string;
  llm?: boolean;
  mode?: string;
  model?: string;
}

export interface TestCaseItem {
  id: string;
  type?: string;
  scenario: string;
  from: string;
  subject: string;
  body?: string;
  category_name?: string;
  expected?: {
    category?: number | string | null;
    action?: string;
  };
}

export interface EmailAttachment {
  name: string;
  type?: string;
  size?: number;
}

export interface EmailResultSummary {
  action: string;
  reason: string;
  category: number | string | null;
  category_name?: string;
  confidence: number;
  method?: string;
  mode?: string;
  guardrails_passed?: boolean;
  duration_ms?: number;
}

export interface TraceStep {
  step: string;
  title: string;
  detail?: Record<string, unknown> | unknown;
  duration_ms?: number;
}

export interface OutboxMessage {
  id: string;
  kind: 'reply' | 'forward' | 'teams' | 'approval' | string;
  recipient: string;
  subject: string;
  body: string;
  status: 'sent' | 'pending_review' | 'pending_approval' | string;
  meta?: Record<string, unknown>;
}

export interface ProcessedEmail {
  id: string;
  from_addr: string;
  from?: string;
  subject: string;
  body: string;
  case_id: string;
  thread_id?: string;
  received_at?: string;
  created_at?: string;
  attachments?: EmailAttachment[];
  cc?: string[];
  result: EmailResultSummary;
  trace?: TraceStep[];
  outbox?: OutboxMessage[];
  test_case_id?: string;
  test_id?: string | null;
  taken_over?: boolean;
}

export interface ReviewCheck {
  name?: string;
  label?: string;
  check?: string;
  passed?: boolean;
  ok?: boolean;
  detail?: string;
  message?: string;
}

export interface ReviewQueueItem {
  id: string;
  kind: 'reply' | 'approval' | 'forward' | string;
  recipient: string;
  subject: string;
  body: string;
  age_minutes?: number;
  sla_minutes?: number;
  overdue?: boolean;
  case_id?: string;
  email_id?: string;
  meta?: {
    proposed_reply?: string;
    customer?: string;
    blocked?: boolean;
    internal_sender?: boolean;
    checks?: Array<ReviewCheck | string>;
    sources?: Array<string | { title?: string; name?: string; source?: string; url?: string }>;
    [key: string]: unknown;
  };
}

export interface CategoryMetric {
  name: string;
  count: number;
}

export interface MetricsResponse {
  mode?: string;
  kill_switch?: boolean;
  emails: number;
  cases: number;
  by_category: Record<string, CategoryMetric>;
  actions: Record<string, number>;
  agent_handled: number;
  routed: number;
  escalated: number;
  ignored_or_filed: number;
  review_queue: number;
  overdue: number;
  guardrail_blocks?: number;
  avg_processing_ms: number;
  csr_feedback?: Record<string, number>;
}

export interface CategoryConfig {
  name: string;
  short?: string;
  pattern: 'agent' | 'approval' | 'route' | string;
  mode: 'draft' | 'send' | string;
  owner: string;
  sla_minutes: number;
}

export interface AgentConfig {
  kill_switch: boolean;
  confidence_threshold: number;
  tech_support_max_rounds: number;
  ai_disclosure: {
    enabled: boolean;
    text: string;
  };
  reply_to_cc: boolean;
  categories: Record<string, CategoryConfig>;
}

export interface EvaluationSummary {
  passed: number;
  total: number;
  pass_rate?: number;
  routing_accuracy: number;
  action_accuracy: number;
  guardrail_pass_rate: number;
  safety_cases_passed: number;
  safety_cases_total?: number;
}

export interface EvaluationCaseResult {
  id: string;
  scenario?: string;
  expected_category?: number | string | null;
  predicted_category?: number | string | null;
  actual_category?: number | string | null;
  expected_action?: string;
  predicted_action?: string;
  actual_action?: string;
  expected?: {
    category?: number | string | null;
    action?: string;
  };
  predicted?: {
    category?: number | string | null;
    action?: string;
  };
  passed?: boolean;
  pass?: boolean;
  reason?: string;
}

export interface EvaluationRunResponse {
  file?: string;
  summary: EvaluationSummary;
  results: EvaluationCaseResult[];
}

export interface SyntheticGenerateResponse {
  count?: number;
  generated?: number;
  file?: string;
  message?: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  variant: 'success' | 'error';
}
