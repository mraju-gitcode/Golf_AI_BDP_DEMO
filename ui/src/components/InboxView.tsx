import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Mail,
  Paperclip,
  PenSquare,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import type {
  LiveStatus,
  OutboxMessage,
  ProcessedEmail,
  TestCaseItem,
  TraceStep,
} from '../types/golfpm';
import {
  extractSenderName,
  formatCategoryLabel,
  getActionDisplay,
  getInitials,
  getOutboxKindLabel,
  getOutboxStatusDisplay,
  getTraceDotTone,
  getTraceStepLabel,
  groupTestCases,
  normalizePercent,
  validateComposeEmail,
} from '../utils/formatters';
import {
  computeEmailLifecycle,
  filterTestCases,
  type LifecycleNode,
  type ScenarioFilter,
} from '../utils/journey';
import { LiveMailboxHeader } from './LivePanels';
import { ScenarioRunner } from './ScenarioRunner';
import { ToneBadge } from './ToneBadge';

interface InboxViewProps {
  testCases: TestCaseItem[];
  processedEmails: ProcessedEmail[];
  sentTestCaseMap: Record<string, string>;
  selectedEmail: ProcessedEmail | null;
  selectedTestCaseId: string | null;
  categoryNameMap: Record<string, string>;
  loadingList: boolean;
  sendingId: string | null;
  takingOver: boolean;
  composing: boolean;
  backendReachable: boolean;
  onSelectTestCase: (tc: TestCaseItem) => void;
  onRunTestCase: (tc: TestCaseItem) => void;
  live?: LiveStatus | null;
  runError?: string | null;
  onResendTestCase: (tcId: string) => void;
  onSelectProcessedEmail: (emailId: string) => void;
  onComposeSubmit: (payload: { from: string; subject: string; body: string }) => Promise<boolean>;
  onTakeoverCase: (caseId: string) => void;
  onOpenCsrReview: () => void;
  onRetryLoad: () => void;
}

const TRACE_DOT_CLASSES: Record<ReturnType<typeof getTraceDotTone>, string> = {
  green: 'bg-[#018752] dark:bg-[#2FB06A] text-white dark:text-[#0F1613]',
  deep: 'bg-[#004A2D] dark:bg-[#1B7A4B] text-white',
  amber: 'bg-[#F2A900] text-[#1D2A24]',
  blue: 'bg-[#0072BC] text-white',
  red: 'bg-[#D92D20] text-white',
};

function TraceStepItem({
  step,
  index,
  isLast,
}: {
  step: TraceStep;
  index: number;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tone = getTraceDotTone(step);
  const hasDetail =
    step.detail !== undefined &&
    step.detail !== null &&
    (typeof step.detail !== 'object' || Object.keys(step.detail as object).length > 0);

  return (
    <li
      className="trace-step-enter relative pl-9 pb-5 last:pb-0"
      style={{ animationDelay: `${index * 170}ms` }}
    >
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[11px] top-6 bottom-0 w-px bg-[#DDE4E0] dark:bg-[#2A3B32]"
        />
      )}

      <span
        aria-hidden="true"
        className={`absolute left-0 top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-display font-bold tabular-nums shadow-xs ${TRACE_DOT_CLASSES[tone]}`}
      >
        {index + 1}
      </span>

      <div className="min-w-0">
        <div className="text-[10.5px] font-display font-bold tracking-wider uppercase text-[#6F7F77] dark:text-[#8DA196]">
          {getTraceStepLabel(step.step)}
        </div>
        <div className="text-[13.5px] font-semibold text-[#1D2A24] dark:text-[#EAF1ED] leading-snug mt-0.5">
          {step.title}
        </div>

        {hasDetail && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#018752] dark:text-[#2FB06A] hover:text-[#006A40] dark:hover:text-[#6EE09F] cursor-pointer"
            >
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>Details</span>
            </button>
            {open && (
              <pre className="mt-2 p-2.5 rounded-lg bg-[#F4F6F5] dark:bg-[#0F1613] border border-[#DDE4E0] dark:border-[#24342C] text-[11.5px] font-mono text-[#1D2A24] dark:text-[#D5E1DA] overflow-x-auto leading-relaxed">
                {JSON.stringify(step.detail, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function OutboxCard({ message }: { message: OutboxMessage }) {
  const kindLower = message.kind.toLowerCase();
  const isTeams = kindLower === 'teams';
  const isApproval = kindLower === 'approval';
  const statusDisplay = getOutboxStatusDisplay(message.status);

  return (
    <article
      className={`rounded-[10px] border overflow-hidden ${
        isApproval
          ? 'border-[#F2A900] dark:border-[#C28600] bg-white dark:bg-[#131C18]'
          : 'border-[#DDE4E0] dark:border-[#26372E] bg-white dark:bg-[#131C18]'
      }`}
    >
      <div
        className={`px-3.5 py-2.5 space-y-1.5 border-b ${
          isTeams
            ? 'bg-[#464EB8] text-white border-[#3B42A1]'
            : isApproval
              ? 'bg-[#FEF6E0] dark:bg-[#2F240B] text-[#1D2A24] dark:text-[#F8E2A6] border-[#F6DB93] dark:border-[#574212]'
              : 'bg-[#F7FAF8] dark:bg-[#1B2721] text-[#1D2A24] dark:text-[#EAF1ED] border-[#DDE4E0] dark:border-[#26372E]'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[11px] font-display font-bold uppercase tracking-wide px-2 py-0.5 rounded whitespace-nowrap shrink-0 ${
              isTeams
                ? 'bg-white/20 text-white'
                : isApproval
                  ? 'bg-[#F2A900]/25 text-[#7A5100] dark:text-[#F8C84A]'
                  : kindLower === 'forward'
                    ? 'bg-[#E6F1FA] text-[#005B99] dark:bg-[#142B3E] dark:text-[#7BC4FA]'
                    : 'bg-[#E6F3ED] text-[#006A40] dark:bg-[#163626] dark:text-[#6EE09F]'
            }`}
          >
            {getOutboxKindLabel(message.kind)}
          </span>

          <ToneBadge
            label={statusDisplay.label}
            tone={statusDisplay.color}
            className={isTeams ? 'border-transparent shadow-xs' : ''}
          />
        </div>

        <div
          className={`text-xs truncate ${
            isTeams ? 'text-white/90' : 'text-[#4C5C54] dark:text-[#B3C2BA]'
          }`}
          title={message.recipient}
        >
          To: <span className="font-semibold">{message.recipient}</span>
        </div>
      </div>

      <div className="p-3.5">
        {message.subject && (
          <div className="text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED] mb-2">
            {message.subject}
          </div>
        )}
        <div className="text-[13px] text-[#34453D] dark:text-[#D5E1DA] whitespace-pre-wrap leading-relaxed break-words">
          {message.body}
        </div>
      </div>
    </article>
  );
}

export function InboxView({
  testCases,
  processedEmails,
  sentTestCaseMap,
  selectedEmail,
  selectedTestCaseId,
  categoryNameMap,
  loadingList,
  sendingId,
  takingOver,
  composing,
  backendReachable,
  onSelectTestCase,
  onRunTestCase,
  live,
  runError,
  onResendTestCase,
  onSelectProcessedEmail,
  onComposeSubmit,
  onTakeoverCase,
  onOpenCsrReview,
  onRetryLoad,
}: InboxViewProps) {
  const openScenario =
    selectedTestCaseId && !sentTestCaseMap[selectedTestCaseId]
      ? testCases.find((tc) => tc.id === selectedTestCaseId) ?? null
      : null;
  const [listMode, setListMode] = useState<'scenarios' | 'processed'>(live ? 'processed' : 'scenarios');
  useEffect(() => {
    if (live) setListMode('processed');
  }, [Boolean(live)]);
  const [scenarioFilter, setScenarioFilter] = useState<ScenarioFilter>('all');
  const [scenarioQuery, setScenarioQuery] = useState('');
  const [outboxView, setOutboxView] = useState<'cards' | 'outlook'>('cards');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeFrom, setComposeFrom] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeErrors, setComposeErrors] = useState<{
    from?: string;
    subject?: string;
    body?: string;
  }>({});

  const filteredScenarios = useMemo(
    () => filterTestCases(testCases, scenarioFilter, scenarioQuery),
    [testCases, scenarioFilter, scenarioQuery],
  );

  const groupedScenarios = useMemo(
    () => groupTestCases(filteredScenarios, categoryNameMap),
    [filteredScenarios, categoryNameMap],
  );

  const lifecycle = useMemo(
    () => (selectedEmail ? computeEmailLifecycle(selectedEmail) : null),
    [selectedEmail],
  );

  const customerReplyMessage = useMemo(() => {
    if (!selectedEmail?.outbox) return null;
    return (
      selectedEmail.outbox.find((m) => m.kind.toLowerCase() === 'reply') ??
      selectedEmail.outbox.find((m) => m.kind.toLowerCase() === 'approval') ??
      null
    );
  }, [selectedEmail]);

  const handleCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateComposeEmail({
      from: composeFrom,
      subject: composeSubject,
      body: composeBody,
    });
    setComposeErrors(validation.errors);
    if (!validation.valid) return;

    const ok = await onComposeSubmit({
      from: composeFrom.trim(),
      subject: composeSubject.trim(),
      body: composeBody.trim(),
    });
    if (ok) {
      setComposeFrom('');
      setComposeSubject('');
      setComposeBody('');
      setComposeErrors({});
      setComposeOpen(false);
    }
  };

  const selectedSender = selectedEmail?.from_addr || selectedEmail?.from || '';
  const selectedAction = getActionDisplay(selectedEmail?.result?.action);
  const canResend =
    selectedTestCaseId !== null && Boolean(sentTestCaseMap[selectedTestCaseId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Column: Outlook-style message list + Compose drawer */}
      <section
        aria-label="Mailbox list"
        className="lg:col-span-4 xl:col-span-4 rb-card overflow-hidden flex flex-col lg:max-h-[calc(100vh-112px)]"
      >
        {/* Mode Switch */}
        <div className="p-3 border-b border-[#DDE4E0] dark:border-[#24342C] bg-[#FAFBFB] dark:bg-[#131C18]">
          {live ? (
            <LiveMailboxHeader live={live} />
          ) : (
          <div
            role="tablist"
            aria-label="Mailbox view"
            className="grid grid-cols-2 p-1 rounded-lg bg-[#E9EFEC] dark:bg-[#0F1613] gap-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={listMode === 'scenarios'}
              onClick={() => setListMode('scenarios')}
              className={`py-1.5 px-2.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                listMode === 'scenarios'
                  ? 'bg-white dark:bg-[#1E2B24] text-[#006A40] dark:text-[#6EE09F] shadow-xs'
                  : 'text-[#4C5C54] dark:text-[#96A89E] hover:text-[#1D2A24] dark:hover:text-[#EAF1ED]'
              }`}
            >
              Test scenarios ({testCases.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={listMode === 'processed'}
              onClick={() => setListMode('processed')}
              className={`py-1.5 px-2.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                listMode === 'processed'
                  ? 'bg-white dark:bg-[#1E2B24] text-[#006A40] dark:text-[#6EE09F] shadow-xs'
                  : 'text-[#4C5C54] dark:text-[#96A89E] hover:text-[#1D2A24] dark:hover:text-[#EAF1ED]'
              }`}
            >
              Processed ({processedEmails.length})
            </button>
          </div>
          )}

          {listMode === 'scenarios' && testCases.length > 0 && (
            <div className="mt-2.5 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#6F7F77] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={scenarioQuery}
                  onChange={(e) => setScenarioQuery(e.target.value)}
                  aria-label="Filter test scenarios"
                  placeholder="Find scenario, order, or sender…"
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#0F1613] text-[#1D2A24] dark:text-[#EAF1ED] placeholder:text-[#6F7F77] focus:outline-none focus:border-[#018752]"
                />
              </div>

              <div className="flex flex-wrap gap-1" role="group" aria-label="Quick scenario filter">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'agent', label: 'Auto' },
                    { id: 'approval', label: 'CSR / Warranty' },
                    { id: 'route', label: 'Routed' },
                    { id: 'security', label: 'Red-team' },
                  ] as Array<{ id: ScenarioFilter; label: string }>
                ).map((item) => {
                  const active = scenarioFilter === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setScenarioFilter(item.id)}
                      aria-pressed={active}
                      className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-[#018752] text-white'
                          : 'bg-[#EEF2F0] dark:bg-[#1A251F] text-[#4C5C54] dark:text-[#A9BBB1] hover:bg-[#E2EAE6] dark:hover:bg-[#22322A]'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto min-h-[280px] max-h-[520px] lg:max-h-none divide-y divide-[#EEF2F0] dark:divide-[#202E27]">
          {loadingList ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3, 4].map((idx) => (
                <div
                  key={idx}
                  className="h-16 rounded-lg bg-[#EEF2F0] dark:bg-[#1D2A24] animate-pulse"
                />
              ))}
            </div>
          ) : !backendReachable && testCases.length === 0 && processedEmails.length === 0 ? (
            <div className="p-6 text-center">
              <Mail className="w-8 h-8 mx-auto text-[#6F7F77] mb-2" />
              <p className="text-sm font-semibold text-[#1D2A24] dark:text-[#EAF1ED]">
                Waiting for GolfPM backend
              </p>
              <p className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-1 leading-relaxed">
                Start <code className="font-mono">uvicorn golfpm.api:app --port 8000</code> locally
                to load test scenarios and live mailbox threads.
              </p>
              <button
                type="button"
                onClick={onRetryLoad}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#018752] hover:bg-[#006A40] text-white text-xs font-semibold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry connection</span>
              </button>
            </div>
          ) : listMode === 'scenarios' ? (
            groupedScenarios.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#6F7F77] dark:text-[#96A89E]">
                No test scenarios returned by the backend.
              </div>
            ) : (
              groupedScenarios.map((group) => {
                const isRedTeam = group.key === 'security-red-team';
                return (
                  <div key={group.key}>
                    <div
                      className={`sticky top-0 z-10 px-3.5 py-2 text-[11px] font-display font-bold uppercase tracking-wider border-b flex items-center justify-between ${
                        isRedTeam
                          ? 'bg-[#FDECEC] dark:bg-[#2F1616] text-[#B42318] dark:text-[#FCA5A5] border-[#F7C5C2] dark:border-[#4D2222]'
                          : 'bg-[#F4F6F5] dark:bg-[#111915] text-[#4C5C54] dark:text-[#96A89E] border-[#DDE4E0] dark:border-[#24342C]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        {isRedTeam && <ShieldAlert className="w-3.5 h-3.5 shrink-0" />}
                        <span className="truncate">{group.label}</span>
                      </span>
                      <span className="tabular-nums opacity-75">{group.items.length}</span>
                    </div>

                    <div className="divide-y divide-[#EEF2F0] dark:divide-[#202E27]">
                      {group.items.map((tc) => {
                        const sentEmailId = sentTestCaseMap[tc.id];
                        const isSent = Boolean(sentEmailId);
                        const isSending = sendingId === tc.id;
                        const isSelected =
                          selectedTestCaseId === tc.id ||
                          (sentEmailId && selectedEmail?.id === sentEmailId);

                        return (
                          <button
                            key={tc.id}
                            type="button"
                            disabled={Boolean(sendingId)}
                            onClick={() => onSelectTestCase(tc)}
                            className={`w-full text-left px-3.5 py-3 transition-colors cursor-pointer block focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#018752] ${
                              isSelected
                                ? 'bg-[#E6F3ED] dark:bg-[#173326]'
                                : 'hover:bg-[#F7FAF8] dark:hover:bg-[#1B2721]'
                            } ${sendingId && !isSending ? 'opacity-65' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[13px] font-semibold text-[#1D2A24] dark:text-[#EAF1ED] truncate">
                                {extractSenderName(tc.from)}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isSent && (
                                  <CheckCircle2
                                    aria-label="Sent"
                                    className="w-3.5 h-3.5 text-[#018752] dark:text-[#2FB06A]"
                                  />
                                )}
                                <span className="px-1.5 py-0.5 rounded bg-[#EEF2F0] dark:bg-[#23322A] text-[#34453D] dark:text-[#C5D3CB] font-mono text-[10.5px] font-semibold">
                                  {tc.id}
                                </span>
                              </div>
                            </div>

                            <div className="text-[12.5px] font-medium text-[#1D2A24] dark:text-[#DCE6E0] truncate mt-0.5">
                              {tc.subject}
                            </div>

                            <div className="flex items-center justify-between gap-2 mt-1">
                              <span className="text-[11.5px] text-[#6F7F77] dark:text-[#96A89E] truncate">
                                {isSending ? 'Sending to GolfPM agent…' : tc.scenario}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )
          ) : processedEmails.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#6F7F77] dark:text-[#96A89E]">
              No processed emails yet. Click a test scenario or compose a message to run the agent.
            </div>
          ) : (
            processedEmails.map((item) => {
              const isSelected = selectedEmail?.id === item.id;
              const actionDisp = getActionDisplay(item.result?.action);
              const senderAddr = item.from_addr || item.from || '';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectProcessedEmail(item.id)}
                  className={`w-full text-left px-3.5 py-3 transition-colors cursor-pointer block focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#018752] ${
                    isSelected
                      ? 'bg-[#E6F3ED] dark:bg-[#173326]'
                      : 'hover:bg-[#F7FAF8] dark:hover:bg-[#1B2721]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#1D2A24] dark:text-[#EAF1ED] truncate">
                      {extractSenderName(senderAddr)}
                    </span>
                    <ToneBadge label={actionDisp.label} tone={actionDisp.color} />
                  </div>
                  <div className="text-[12.5px] font-medium text-[#1D2A24] dark:text-[#DCE6E0] truncate mt-0.5">
                    {item.subject}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1 text-[11px] font-mono text-[#6F7F77] dark:text-[#96A89E]">
                    <span>{item.id}</span>
                    <span>{item.case_id}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Compose Drawer below the list */}
        <div className="border-t border-[#DDE4E0] dark:border-[#24342C] bg-[#FAFBFB] dark:bg-[#131C18]">
          <button
            type="button"
            onClick={() => setComposeOpen((prev) => !prev)}
            aria-expanded={composeOpen}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[#006A40] dark:text-[#6EE09F] hover:bg-[#E6F3ED]/60 dark:hover:bg-[#173326]/60 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <PenSquare className="w-3.5 h-3.5" />
              <span>Compose custom email</span>
            </span>
            {composeOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {composeOpen && (
            <form onSubmit={handleCompose} noValidate className="px-3.5 pb-3.5 pt-1 space-y-2.5">
              <div>
                <label
                  htmlFor="compose-from"
                  className="block text-[11px] font-semibold text-[#4C5C54] dark:text-[#B3C2BA] mb-1"
                >
                  From
                </label>
                <input
                  id="compose-from"
                  type="email"
                  value={composeFrom}
                  onChange={(e) => {
                    setComposeFrom(e.target.value);
                    if (composeErrors.from) setComposeErrors((p) => ({ ...p, from: undefined }));
                  }}
                  placeholder="superintendent@golfclub.example.com"
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#0F1613] text-[#1D2A24] dark:text-[#EAF1ED] focus:outline-none focus:border-[#018752]"
                />
                {composeErrors.from && (
                  <p className="text-[11px] text-[#B42318] dark:text-[#FCA5A5] mt-1">
                    {composeErrors.from}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="compose-subject"
                  className="block text-[11px] font-semibold text-[#4C5C54] dark:text-[#B3C2BA] mb-1"
                >
                  Subject
                </label>
                <input
                  id="compose-subject"
                  type="text"
                  value={composeSubject}
                  onChange={(e) => {
                    setComposeSubject(e.target.value);
                    if (composeErrors.subject)
                      setComposeErrors((p) => ({ ...p, subject: undefined }));
                  }}
                  placeholder="Order status or technical question"
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#0F1613] text-[#1D2A24] dark:text-[#EAF1ED] focus:outline-none focus:border-[#018752]"
                />
                {composeErrors.subject && (
                  <p className="text-[11px] text-[#B42318] dark:text-[#FCA5A5] mt-1">
                    {composeErrors.subject}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="compose-body"
                  className="block text-[11px] font-semibold text-[#4C5C54] dark:text-[#B3C2BA] mb-1"
                >
                  Message
                </label>
                <textarea
                  id="compose-body"
                  rows={3}
                  value={composeBody}
                  onChange={(e) => {
                    setComposeBody(e.target.value);
                    if (composeErrors.body) setComposeErrors((p) => ({ ...p, body: undefined }));
                  }}
                  placeholder="Write a customer email to send into GolfPM…"
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#0F1613] text-[#1D2A24] dark:text-[#EAF1ED] focus:outline-none focus:border-[#018752] resize-y"
                />
                {composeErrors.body && (
                  <p className="text-[11px] text-[#B42318] dark:text-[#FCA5A5] mt-1">
                    {composeErrors.body}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={composing}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#018752] hover:bg-[#006A40] text-white text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{composing ? 'Sending…' : 'Send to GolfPM Inbox'}</span>
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Right Column: Email Detail Card + Trace & Outbox */}
      <section aria-label="Email details and agent trace" className="lg:col-span-8 xl:col-span-8 space-y-5">
        {!selectedEmail && openScenario ? (
          <div className="rb-card p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED]">
                New email in the GolfPM mailbox
              </h2>
              <span className="text-xs text-[#6F7F77] dark:text-[#96A89E]">{openScenario.scenario}</span>
            </div>
            <ScenarioRunner
              scenario={openScenario}
              running={sendingId === openScenario.id}
              error={runError}
              backendReachable={backendReachable}
              onRun={() => onRunTestCase(openScenario)}
            />
          </div>
        ) : !selectedEmail ? (
          <div className="rb-card p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-[#E6F3ED] dark:bg-[#173326] text-[#018752] dark:text-[#2FB06A] flex items-center justify-center mx-auto mb-3.5">
              <Mail className="w-6 h-6" />
            </div>
            <h2 className="font-display font-bold text-lg text-[#1D2A24] dark:text-[#EAF1ED]">
              Select a scenario to see GolfPM Assist in action
            </h2>
            <p className="text-sm text-[#6F7F77] dark:text-[#96A89E] max-w-md mx-auto mt-1.5 leading-relaxed">
              Click any incoming email scenario on the left, or compose a custom message, to watch the
              triage, guardrails, and delivery trace step by step.
            </p>
          </div>
        ) : (
          <>
            {/* Email Detail Card */}
            <div className="rb-card p-5 space-y-4">
              {/* Top Header */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3.5">
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div
                    aria-hidden="true"
                    className="w-10 h-10 rounded-full bg-[#E6F3ED] dark:bg-[#173326] text-[#006A40] dark:text-[#6EE09F] font-display font-bold text-sm flex items-center justify-center shrink-0"
                  >
                    {getInitials(selectedSender)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="font-display font-bold text-lg text-[#1D2A24] dark:text-[#EAF1ED] leading-snug break-words">
                      {selectedEmail.subject}
                    </h1>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#6F7F77] dark:text-[#96A89E] mt-1">
                      <span className="font-semibold text-[#1D2A24] dark:text-[#DCE6E0]">
                        {extractSenderName(selectedSender)}
                      </span>
                      <span className="font-mono break-all">&lt;{selectedSender}&gt;</span>
                      {selectedEmail.cc && selectedEmail.cc.length > 0 && (
                        <span className="break-all">
                          · CC: <span className="font-mono">{selectedEmail.cc.join(', ')}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {canResend && selectedTestCaseId && (
                    <button
                      type="button"
                      disabled={Boolean(sendingId)}
                      onClick={() => onResendTestCase(selectedTestCaseId)}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#1D2A24] hover:bg-[#F4F6F5] dark:hover:bg-[#24342C] text-[#1D2A24] dark:text-[#EAF1ED] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${sendingId ? 'animate-spin' : ''}`} />
                      <span>Send again</span>
                    </button>
                  )}

                  {selectedEmail.case_id && (
                    <button
                      type="button"
                      disabled={takingOver}
                      onClick={() => onTakeoverCase(selectedEmail.case_id)}
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#018752] dark:border-[#2FB06A] text-[#006A40] dark:text-[#6EE09F] bg-[#E6F3ED]/60 dark:bg-[#173326] hover:bg-[#E6F3ED] dark:hover:bg-[#1E4231] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{takingOver ? 'Taking over…' : 'Take over thread'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Email Body Panel */}
              <div className="p-4 rounded-lg bg-[#F7FAF8] dark:bg-[#101814] border border-[#E6ECE8] dark:border-[#22322A] text-[13.5px] text-[#1D2A24] dark:text-[#DCE6E0] whitespace-pre-wrap leading-relaxed">
                {selectedEmail.body}
              </div>

              {/* Attachment Chips */}
              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {selectedEmail.attachments.map((att, idx) => (
                    <span
                      key={`${att.name}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F4F6F5] dark:bg-[#1D2A24] border border-[#DDE4E0] dark:border-[#2B3D34] text-xs font-medium text-[#34453D] dark:text-[#C5D3CB]"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-[#6F7F77]" />
                      <span className="font-mono text-[11.5px]">{att.name}</span>
                      {att.type && (
                        <span className="text-[10.5px] text-[#6F7F77] dark:text-[#8DA196]">
                          ({att.type})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Outcome Tiles Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5 pt-1">
                {/* Tile 1: Solid Green Outcome Tile */}
                <div className="rounded-lg bg-[#018752] dark:bg-[#018752] text-white p-3">
                  <div className="text-[10.5px] font-display font-bold uppercase tracking-wider text-white/80">
                    Outcome
                  </div>
                  <div className="font-display font-bold text-sm mt-1 leading-tight">
                    {selectedAction.label}
                  </div>
                </div>

                {/* Tile 2: Category */}
                <div className="rounded-lg bg-[#F4F6F5] dark:bg-[#101814] border border-[#E4EAE6] dark:border-[#24342C] p-3">
                  <div className="text-[10.5px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
                    Category
                  </div>
                  <div className="font-display font-bold text-[13px] text-[#1D2A24] dark:text-[#EAF1ED] mt-1 leading-tight">
                    {formatCategoryLabel(
                      selectedEmail.result?.category,
                      selectedEmail.result?.category_name,
                      categoryNameMap,
                    )}
                  </div>
                </div>

                {/* Tile 3: Confidence % */}
                <div className="rounded-lg bg-[#F4F6F5] dark:bg-[#101814] border border-[#E4EAE6] dark:border-[#24342C] p-3">
                  <div className="text-[10.5px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
                    Confidence
                  </div>
                  <div className="font-display font-bold text-base text-[#1D2A24] dark:text-[#EAF1ED] mt-1 tabular-nums">
                    {normalizePercent(selectedEmail.result?.confidence)}%
                  </div>
                </div>

                {/* Tile 4: Handled in ms */}
                <div className="rounded-lg bg-[#F4F6F5] dark:bg-[#101814] border border-[#E4EAE6] dark:border-[#24342C] p-3">
                  <div className="text-[10.5px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
                    Handled in
                  </div>
                  <div className="font-display font-bold text-base text-[#1D2A24] dark:text-[#EAF1ED] mt-1 tabular-nums">
                    {selectedEmail.result?.duration_ms ?? 0} ms
                  </div>
                </div>

                {/* Tile 5: Case ID */}
                <div className="rounded-lg bg-[#F4F6F5] dark:bg-[#101814] border border-[#E4EAE6] dark:border-[#24342C] p-3 col-span-2 sm:col-span-1">
                  <div className="text-[10.5px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
                    Case ID
                  </div>
                  <div className="font-mono font-semibold text-xs text-[#1D2A24] dark:text-[#EAF1ED] mt-1.5 truncate">
                    {selectedEmail.case_id || '-'}
                  </div>
                </div>
              </div>

              {/* Reason Banner with Green Left Border */}
              {selectedEmail.result?.reason && (
                <div className="rounded-r-lg border border-[#DDE4E0] dark:border-[#24342C] border-l-[4px] border-l-[#018752] dark:border-l-[#2FB06A] bg-[#F7FAF8] dark:bg-[#111B16] px-4 py-3">
                  <div className="text-[13px] font-medium text-[#1D2A24] dark:text-[#EAF1ED] leading-relaxed">
                    {selectedEmail.result.reason}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6F7F77] dark:text-[#8DA196] mt-1">
                    {selectedEmail.result.method && (
                      <span>Method: {selectedEmail.result.method}</span>
                    )}
                    {selectedEmail.result.mode && <span>· Mode: {selectedEmail.result.mode}</span>}
                    {typeof selectedEmail.result.guardrails_passed === 'boolean' && (
                      <span>
                        · Output checks:{' '}
                        {selectedEmail.result.guardrails_passed ? 'Passed' : 'Flagged'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 4-Step Customer Journey Lifecycle Strip */}
              {lifecycle && (
                <div className="pt-2 border-t border-[#EEF2F0] dark:border-[#24342C] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
                      Customer journey status
                    </span>
                    {lifecycle.needsCsrReview && (
                      <button
                        type="button"
                        onClick={onOpenCsrReview}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#018752] dark:text-[#2FB06A] hover:text-[#006A40] dark:hover:text-[#6EE09F] cursor-pointer"
                      >
                        <span>Continue in CSR Review</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                    {lifecycle.nodes.map((node: LifecycleNode) => {
                      const stateStyles = {
                        done: 'border-[#BFE0D0] dark:border-[#245039] bg-[#F4FBF7] dark:bg-[#12251C]',
                        waiting:
                          'border-[#F6DB93] dark:border-[#574212] bg-[#FFFBEB] dark:bg-[#2B210B]',
                        alert:
                          'border-[#F7C5C2] dark:border-[#5E2424] bg-[#FEF2F2] dark:bg-[#2E1414]',
                        skipped:
                          'border-[#DDE4E0] dark:border-[#24342C] bg-[#F4F6F5] dark:bg-[#121A16]',
                      }[node.state];

                      const labelColor = {
                        done: 'text-[#006A40] dark:text-[#6EE09F]',
                        waiting: 'text-[#946200] dark:text-[#F8C84A]',
                        alert: 'text-[#B42318] dark:text-[#FCA5A5]',
                        skipped: 'text-[#4C5C54] dark:text-[#96A89E]',
                      }[node.state];

                      return (
                        <div
                          key={node.id}
                          className={`rounded-lg border px-3 py-2 text-xs ${stateStyles}`}
                        >
                          <div className={`font-display font-bold ${labelColor}`}>{node.label}</div>
                          <div className="text-[11px] font-semibold text-[#1D2A24] dark:text-[#EAF1ED] mt-0.5">
                            {node.persona}
                          </div>
                          <div className="text-[11px] text-[#4C5C54] dark:text-[#A9BBB1] mt-0.5 leading-snug">
                            {node.detail}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Two Side-by-Side Cards: Trace Timeline + Outbox */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* How the agent handled it */}
              <div className="rb-card p-5">
                <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-[#EEF2F0] dark:border-[#24342C]">
                  <h2 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED]">
                    How the agent handled it
                  </h2>
                  <span className="text-xs font-mono text-[#6F7F77] dark:text-[#8DA196] tabular-nums">
                    {(selectedEmail.trace ?? []).length} steps
                  </span>
                </div>

                {!selectedEmail.trace || selectedEmail.trace.length === 0 ? (
                  <p className="text-sm text-[#6F7F77] dark:text-[#96A89E]">
                    No execution trace recorded for this email.
                  </p>
                ) : (
                  <ol key={selectedEmail.id} className="relative">
                    {selectedEmail.trace.map((step, index) => (
                      <TraceStepItem
                        key={`${selectedEmail.id}-${index}-${step.step}`}
                        step={step}
                        index={index}
                        isLast={index === (selectedEmail.trace?.length ?? 0) - 1}
                      />
                    ))}
                  </ol>
                )}
              </div>

              {/* What was sent */}
              <div className="rb-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-[#EEF2F0] dark:border-[#24342C]">
                  <div>
                    <h2 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED]">
                      What was sent
                    </h2>
                    <span className="text-xs font-mono text-[#6F7F77] dark:text-[#8DA196] tabular-nums">
                      {(selectedEmail.outbox ?? []).length}{' '}
                      {(selectedEmail.outbox ?? []).length === 1 ? 'message' : 'messages'}
                    </span>
                  </div>

                  {customerReplyMessage && (
                    <div
                      role="group"
                      aria-label="Outbox display view"
                      className="inline-flex p-0.5 rounded-lg bg-[#E9EFEC] dark:bg-[#0F1613] border border-[#DDE4E0] dark:border-[#24342C]"
                    >
                      <button
                        type="button"
                        onClick={() => setOutboxView('cards')}
                        aria-pressed={outboxView === 'cards'}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          outboxView === 'cards'
                            ? 'bg-white dark:bg-[#1E2B24] text-[#006A40] dark:text-[#6EE09F] shadow-xs'
                            : 'text-[#4C5C54] dark:text-[#96A89E]'
                        }`}
                      >
                        Agent outbox
                      </button>
                      <button
                        type="button"
                        onClick={() => setOutboxView('outlook')}
                        aria-pressed={outboxView === 'outlook'}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          outboxView === 'outlook'
                            ? 'bg-[#0072BC] text-white shadow-xs'
                            : 'text-[#4C5C54] dark:text-[#96A89E]'
                        }`}
                      >
                        Customer Outlook view
                      </button>
                    </div>
                  )}
                </div>

                {!selectedEmail.outbox || selectedEmail.outbox.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#DDE4E0] dark:border-[#2B3D34] p-6 text-center text-sm text-[#6F7F77] dark:text-[#96A89E]">
                    No outbound messages were generated for this email.
                  </div>
                ) : outboxView === 'outlook' && customerReplyMessage ? (
                  <div className="rounded-[10px] border border-[#BDDCF2] dark:border-[#214563] overflow-hidden bg-white dark:bg-[#121A16]">
                    <div className="px-3.5 py-2.5 bg-[#0072BC] text-white flex items-center justify-between gap-2">
                      <span className="text-xs font-display font-bold tracking-wide">
                        Outlook Thread Preview · Customer View
                      </span>
                      <span className="text-[11px] text-white/85">
                        {customerReplyMessage.status === 'sent'
                          ? 'Delivered in thread'
                          : 'Preview (held for CSR)'}
                      </span>
                    </div>
                    <div className="p-3.5 space-y-3">
                      <div className="rounded-lg bg-[#F4F6F5] dark:bg-[#0F1613] border border-[#DDE4E0] dark:border-[#24342C] p-3">
                        <div className="text-[11px] font-semibold text-[#6F7F77] dark:text-[#8DA196]">
                          Customer sent · {extractSenderName(selectedSender)}
                        </div>
                        <div className="text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED] mt-0.5">
                          {selectedEmail.subject}
                        </div>
                        <div className="text-xs text-[#4C5C54] dark:text-[#B3C2BA] whitespace-pre-wrap mt-1.5 leading-relaxed">
                          {selectedEmail.body}
                        </div>
                      </div>

                      <div className="rounded-lg bg-[#F4FBF7] dark:bg-[#12251C] border border-[#BFE0D0] dark:border-[#245039] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-[#006A40] dark:text-[#6EE09F]">
                            Rain Bird GolfPM Reply
                          </span>
                          <ToneBadge
                            label={getOutboxStatusDisplay(customerReplyMessage.status).label}
                            tone={getOutboxStatusDisplay(customerReplyMessage.status).color}
                          />
                        </div>
                        <div className="text-xs text-[#1D2A24] dark:text-[#EAF1ED] whitespace-pre-wrap mt-2 leading-relaxed">
                          {typeof customerReplyMessage.meta?.proposed_reply === 'string'
                            ? customerReplyMessage.meta.proposed_reply
                            : customerReplyMessage.body}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {selectedEmail.outbox.map((msg) => (
                      <OutboxCard key={msg.id} message={msg} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
