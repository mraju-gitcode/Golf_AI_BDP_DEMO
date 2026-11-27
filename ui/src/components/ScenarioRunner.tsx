import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  Play,
  RotateCcw,
  Send,
} from 'lucide-react';
import type { OutboxMessage, ProcessedEmail, TestCaseItem, TraceStep } from '../types/golfpm';
import {
  extractSenderName,
  formatCategoryLabel,
  getActionDisplay,
  getInitials,
  getOutboxKindLabel,
  getOutboxStatusDisplay,
  getTraceDotTone,
  getTraceStepLabel,
} from '../utils/formatters';
import { ToneBadge } from './ToneBadge';

/** The pipeline stages shown while the agent is working (before the real trace arrives). */
const PIPELINE = [
  { label: 'Intake & protection', hint: 'Sender check, links and attachments screened, PII masked' },
  { label: 'Triage', hint: 'Model picks 1 of 9 categories with a confidence score' },
  { label: 'Agent', hint: 'Looks up data or approved documents and drafts the reply' },
  { label: 'Output checks', hint: 'No prices, no other customer data, sources cited' },
  { label: 'Delivery', hint: 'Send, draft for a CSR, approval card or forward + Teams' },
];

const DOT: Record<ReturnType<typeof getTraceDotTone>, string> = {
  green: 'bg-[#018752] dark:bg-[#2FB06A] text-white dark:text-[#0F1613]',
  deep: 'bg-[#004A2D] dark:bg-[#1B7A4B] text-white',
  amber: 'bg-[#F2A900] text-[#1D2A24]',
  blue: 'bg-[#0072BC] text-white',
  red: 'bg-[#D92D20] text-white',
};

const btnPrimary =
  'inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#018752] hover:bg-[#006A40] text-white text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50';
const btnSecondary =
  'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#16201B] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24] text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50';

/** An incoming email shown as a ticket, before the agent has touched it. */
export function EmailTicket({ scenario, compact = false }: { scenario: TestCaseItem; compact?: boolean }) {
  const attachments = (scenario as TestCaseItem & { attachments?: { name: string }[] }).attachments ?? [];
  const cc = (scenario as TestCaseItem & { cc?: string[] }).cc ?? [];
  return (
    <div className="rounded-[10px] border border-[#DDE4E0] dark:border-[#24342C] bg-white dark:bg-[#131C18] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-[#F4F6F5] dark:bg-[#0F1613] border-b border-[#E4EAE6] dark:border-[#22322A] text-[11px] font-semibold text-[#4C5C54] dark:text-[#9DB0A6]">
        <Inbox className="w-3.5 h-3.5" />
        <span>GolfPM shared mailbox · Outlook</span>
        <span className="ml-auto font-mono">{scenario.id}</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[#E6F1FA] dark:bg-[#142B3E] text-[#0072BC] dark:text-[#7BC4FA] font-display font-bold text-xs flex items-center justify-center shrink-0">
            {getInitials(scenario.from)}
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED] leading-snug break-words">
              {scenario.subject}
            </div>
            <div className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-0.5 break-all">
              <span className="font-semibold text-[#1D2A24] dark:text-[#DCE6E0]">{extractSenderName(scenario.from)}</span>{' '}
              <span className="font-mono">&lt;{scenario.from}&gt;</span>
              {cc.length > 0 && <span> · CC {cc.join(', ')}</span>}
            </div>
          </div>
        </div>
        <div
          className={`text-[13px] leading-relaxed whitespace-pre-wrap text-[#34453D] dark:text-[#C5D3CB] ${compact ? 'line-clamp-4' : ''}`}
        >
          {scenario.body}
        </div>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <span
                key={a.name}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-[#DDE4E0] dark:border-[#2B3D34] text-[#4C5C54] dark:text-[#B3C2BA]"
              >
                <Paperclip className="w-3 h-3" /> {a.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Live progress while the backend is processing: the stages light up in order. */
export function AgentWorking({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  const elapsed = (now - startedAt) / 1000;
  // Advance one stage roughly every 0.9 s; stay on the last stage until the answer arrives.
  const current = Math.min(PIPELINE.length - 1, Math.floor(elapsed / 0.9));
  return (
    <div className="rounded-[10px] border border-[#BFE0D0] dark:border-[#25543C] bg-[#F6FBF8] dark:bg-[#13221B] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Loader2 className="w-4 h-4 animate-spin text-[#018752] dark:text-[#2FB06A]" />
        <span className="font-display font-bold text-sm text-[#1D2A24] dark:text-[#EAF1ED]">
          GolfPM Assist is working on this email
        </span>
        <span className="ml-auto text-xs font-mono tabular-nums text-[#6F7F77]">{elapsed.toFixed(1)} s</span>
      </div>
      <ol className="space-y-2">
        {PIPELINE.map((p, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'todo';
          return (
            <li key={p.label} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  state === 'done'
                    ? 'bg-[#018752] dark:bg-[#2FB06A] text-white'
                    : state === 'active'
                      ? 'bg-white dark:bg-[#0F1613] border-2 border-[#018752] dark:border-[#2FB06A]'
                      : 'bg-[#E6ECE8] dark:bg-[#23322A]'
                }`}
              >
                {state === 'done' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : state === 'active' ? (
                  <Loader2 className="w-3 h-3 animate-spin text-[#018752] dark:text-[#2FB06A]" />
                ) : null}
              </span>
              <div className={state === 'todo' ? 'opacity-50' : ''}>
                <div className="text-[13px] font-semibold text-[#1D2A24] dark:text-[#EAF1ED]">{p.label}</div>
                <div className="text-[11.5px] text-[#6F7F77] dark:text-[#96A89E]">{p.hint}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Ticket preview + Run button + live progress. Used in the Inbox and inside Journey cards. */
export function ScenarioRunner({
  scenario,
  running,
  error,
  onRun,
  backendReachable = true,
  compact = false,
}: {
  scenario: TestCaseItem;
  running: boolean;
  error?: string | null;
  onRun: () => void;
  backendReachable?: boolean;
  compact?: boolean;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  useEffect(() => {
    setStartedAt(running ? Date.now() : null);
  }, [running]);

  return (
    <div className="space-y-3">
      <EmailTicket scenario={scenario} compact={compact} />
      {running && startedAt ? (
        <AgentWorking startedAt={startedAt} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimary} onClick={onRun} disabled={!backendReachable}>
            <Play className="w-4 h-4" />
            <span>Run GolfPM agent</span>
          </button>
          <span className="text-xs text-[#6F7F77] dark:text-[#96A89E]">
            {backendReachable
              ? 'Not processed yet. The agent verifies the sender, classifies, acts, checks and delivers.'
              : 'Start the GolfPM backend to run this email.'}
          </span>
          {error && (
            <div className="w-full flex items-start gap-2 text-xs text-[#B42318] dark:text-[#FCA5A5] bg-[#FDECEC] dark:bg-[#3A1717] border border-[#F7C5C2] dark:border-[#5E2424] rounded-md px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact result shown inside a Journey card after a live run. */
export function InlineResult({
  email,
  replayKey,
  onOpenInbox,
  onApprove,
  onReplay,
}: {
  email: ProcessedEmail;
  replayKey: number;
  onOpenInbox: () => void;
  onApprove: (msg: OutboxMessage) => Promise<boolean>;
  onReplay: () => void;
}) {
  const trace: TraceStep[] = email.trace ?? [];
  const outbox: OutboxMessage[] = email.outbox ?? [];
  const [shown, setShown] = useState(0);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    setShown(0);
    const t = setInterval(() => setShown((n) => (n >= trace.length ? n : n + 1)), 260);
    return () => clearInterval(t);
  }, [replayKey, email.id, trace.length]);

  const done = shown >= trace.length;
  const action = getActionDisplay(email.result?.action);
  const pending = outbox.filter((m) => m.status === 'pending_review' || m.status === 'pending_approval');

  return (
    <div className="space-y-3">
      <ol className="rounded-[10px] border border-[#DDE4E0] dark:border-[#24342C] bg-white dark:bg-[#131C18] p-4 space-y-2">
        {trace.slice(0, shown).map((s, i) => (
          <li key={`${replayKey}-${i}`} className="trace-step-enter flex items-start gap-2.5">
            <span
              className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${DOT[getTraceDotTone(s)]}`}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-display font-bold tracking-wider uppercase text-[#6F7F77] dark:text-[#8DA196]">
                {getTraceStepLabel(s.step)}
              </div>
              <div className="text-[13px] text-[#1D2A24] dark:text-[#EAF1ED] break-words">{s.title}</div>
            </div>
          </li>
        ))}
        {!done && (
          <li className="flex items-center gap-2 text-xs text-[#6F7F77]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> replaying the agent trace…
          </li>
        )}
      </ol>

      {done && (
        <>
          <div className="trace-step-enter rounded-[10px] border-l-[4px] border-l-[#018752] border border-[#DDE4E0] dark:border-[#24342C] bg-[#F6FBF8] dark:bg-[#13221B] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <ToneBadge label={action.label} tone={action.color} />
              <span className="text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED]">
                {formatCategoryLabel(email.result?.category)}
              </span>
              {email.result?.confidence != null && (
                <span className="text-xs text-[#6F7F77]">· {Math.round(email.result.confidence * 100)}% confidence</span>
              )}
              {email.result?.duration_ms != null && (
                <span className="text-xs text-[#6F7F77]">· {(email.result.duration_ms / 1000).toFixed(1)} s</span>
              )}
            </div>
            <div className="text-[13px] text-[#34453D] dark:text-[#C5D3CB] mt-1.5">{email.result?.reason}</div>
          </div>

          <div className="space-y-2">
            {outbox.length === 0 && (
              <p className="text-xs text-[#6F7F77]">No message sent: the email was filed or ignored by policy.</p>
            )}
            {outbox.map((m) => {
              const st = approved[m.id] ? { label: 'Sent', color: 'green' as const } : getOutboxStatusDisplay(m.status);
              const isTeams = m.kind === 'teams';
              return (
                <div
                  key={m.id}
                  className="trace-step-enter rounded-[10px] border border-[#DDE4E0] dark:border-[#24342C] overflow-hidden bg-white dark:bg-[#131C18]"
                >
                  <div
                    className={`flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs ${
                      isTeams ? 'bg-[#464EB8] text-white' : 'bg-[#F4F6F5] dark:bg-[#0F1613]'
                    }`}
                  >
                    {isTeams ? <Send className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                    <span className="font-semibold">{getOutboxKindLabel(m.kind)}</span>
                    <span className={isTeams ? 'text-white/85' : 'text-[#6F7F77]'}>to {m.recipient}</span>
                    <span className="ml-auto">
                      <ToneBadge label={st.label} tone={st.color} />
                    </span>
                  </div>
                  <div className="px-3 py-2 text-[12.5px] whitespace-pre-wrap text-[#34453D] dark:text-[#C5D3CB] max-h-40 overflow-auto">
                    {m.body}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pending
              .filter((m) => !approved[m.id])
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={approving === m.id}
                  className={btnPrimary}
                  onClick={async () => {
                    setApproving(m.id);
                    const ok = await onApprove(m);
                    setApproving(null);
                    if (ok) setApproved((prev) => ({ ...prev, [m.id]: true }));
                  }}
                >
                  {approving === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>
                    {m.kind === 'approval' ? 'Approve warranty decision as CSR' : 'Approve draft and send as CSR'}
                  </span>
                </button>
              ))}
            <button type="button" className={btnSecondary} onClick={onOpenInbox}>
              <span>Open full case in Inbox</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button type="button" className={btnSecondary} onClick={onReplay}>
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Replay</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
