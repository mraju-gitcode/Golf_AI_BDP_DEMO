import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileCheck2,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import type { ReviewQueueItem } from '../types/golfpm';
import {
  formatSlaDuration,
  normalizeReviewCheck,
  normalizeReviewSource,
} from '../utils/formatters';
import { ToneBadge } from './ToneBadge';

interface CsrReviewViewProps {
  items: ReviewQueueItem[];
  loading: boolean;
  submittingId: string | null;
  onDecision: (
    id: string,
    decision: 'approve' | 'edit' | 'reject',
    body: string,
  ) => Promise<void>;
  onRefresh: () => void;
}

function ReviewCard({
  item,
  submitting,
  onDecision,
}: {
  item: ReviewQueueItem;
  submitting: boolean;
  onDecision: (
    id: string,
    decision: 'approve' | 'edit' | 'reject',
    body: string,
  ) => Promise<void>;
}) {
  const isApproval = item.kind.toLowerCase() === 'approval';
  const initialDraft = isApproval
    ? (item.meta?.proposed_reply ?? item.body ?? '')
    : (item.body ?? '');

  const [draftBody, setDraftBody] = useState(initialDraft);

  useEffect(() => {
    setDraftBody(initialDraft);
  }, [initialDraft, item.id]);

  const checks = (item.meta?.checks ?? []).map(normalizeReviewCheck);
  const sources = (item.meta?.sources ?? []).map(normalizeReviewSource);
  const isBlocked = Boolean(item.meta?.blocked);
  const isOverdue = Boolean(item.overdue);
  const ageText =
    item.age_minutes !== undefined && item.sla_minutes !== undefined
      ? `${formatSlaDuration(item.age_minutes)} / ${formatSlaDuration(item.sla_minutes)} SLA`
      : item.sla_minutes !== undefined
        ? `SLA ${formatSlaDuration(item.sla_minutes)}`
        : null;

  return (
    <article
      className={`rb-card overflow-hidden ${
        isBlocked ? 'border-[#F7C5C2] dark:border-[#6B2626]' : ''
      }`}
    >
      {/* Card Header */}
      <div className="px-5 py-3.5 bg-[#FAFBFB] dark:bg-[#131C18] border-b border-[#DDE4E0] dark:border-[#24342C] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <ToneBadge
            label={isApproval ? 'Warranty determination' : 'Draft reply'}
            tone={isApproval ? 'amber' : 'blue'}
          />
          <h2 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED] truncate">
            {item.subject}
          </h2>
          {isBlocked && (
            <ToneBadge label="Blocked by output checks" tone="red" />
          )}
        </div>

        {ageText && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 ${
              isOverdue
                ? 'bg-[#FDECEC] text-[#B42318] border-[#F7C5C2] dark:bg-[#3A1717] dark:text-[#FCA5A5] dark:border-[#5E2424]'
                : 'bg-[#F4F6F5] text-[#4C5C54] border-[#DDE4E0] dark:bg-[#1E2B24] dark:text-[#B3C2BA] dark:border-[#2C3E35]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{ageText}</span>
          </span>
        )}
      </div>

      {/* Card Body: Left Editable Draft + Actions, Right Monospace Inspection Panel */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Side */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="text-[11px] font-medium text-[#6F7F77] dark:text-[#8DA196] flex flex-wrap items-center gap-1.5">
            <span>Customer email</span>
            <span aria-hidden="true">→</span>
            <span>Agent draft & checks</span>
            <span aria-hidden="true">→</span>
            <span className="font-semibold text-[#006A40] dark:text-[#6EE09F]">
              {isApproval ? 'CSR warranty sign-off' : 'CSR approval'}
            </span>
            <span aria-hidden="true">→</span>
            <span>Outlook reply</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6F7F77] dark:text-[#96A89E]">
            <span>
              To:{' '}
              <span className="font-semibold text-[#1D2A24] dark:text-[#EAF1ED]">
                {item.meta?.customer || item.recipient}
              </span>
            </span>
            {item.meta?.internal_sender && (
              <span>· Internal sender</span>
            )}
            <span className="font-mono text-[11px]">{item.id}</span>
          </div>

          <label htmlFor={`review-draft-${item.id}`} className="sr-only">
            Reply body for {item.subject}
          </label>
          <textarea
            id={`review-draft-${item.id}`}
            rows={8}
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            className="w-full rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#0F1613] px-3.5 py-2.5 text-[13.5px] text-[#1D2A24] dark:text-[#EAF1ED] leading-relaxed focus:outline-none focus:border-[#018752] dark:focus:border-[#2FB06A] resize-y"
          />

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={submitting}
              onClick={() => onDecision(item.id, 'approve', draftBody)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#018752] hover:bg-[#006A40] text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isApproval ? 'Approve & send' : 'Send'}</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => onDecision(item.id, 'edit', draftBody)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#1D2A24] hover:bg-[#F4F6F5] dark:hover:bg-[#24342C] text-[#1D2A24] dark:text-[#EAF1ED] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Send with my edits</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => onDecision(item.id, 'reject', draftBody)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[#B42318] dark:text-[#FCA5A5] hover:bg-[#FDECEC] dark:hover:bg-[#3A1717] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>
          </div>
        </div>

        {/* Right Side: Monospace panel */}
        <div className="lg:col-span-5 rounded-lg bg-[#F4F6F5] dark:bg-[#0F1613] border border-[#DDE4E0] dark:border-[#24342C] p-4 font-mono text-xs text-[#1D2A24] dark:text-[#D5E1DA] overflow-auto max-h-[320px]">
          {isApproval ? (
            <div>
              <div className="text-[10.5px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196] mb-2">
                Case summary
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{item.body}</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-[10.5px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196] mb-2">
                  Output checks
                </div>
                {checks.length === 0 ? (
                  <div className="text-[#6F7F77] dark:text-[#8DA196]">No check details attached.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {checks.map((chk, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-snug">
                        <span
                          aria-hidden="true"
                          className={`font-bold shrink-0 ${
                            chk.passed
                              ? 'text-[#018752] dark:text-[#2FB06A]'
                              : 'text-[#D92D20] dark:text-[#FCA5A5]'
                          }`}
                        >
                          {chk.passed ? '✓' : '✗'}
                        </span>
                        <div>
                          <span
                            className={
                              chk.passed
                                ? 'text-[#1D2A24] dark:text-[#D5E1DA]'
                                : 'text-[#B42318] dark:text-[#FCA5A5] font-semibold'
                            }
                          >
                            {chk.label}
                          </span>
                          {chk.detail && (
                            <div className="text-[11px] text-[#6F7F77] dark:text-[#8DA196] mt-0.5">
                              {chk.detail}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-3 border-t border-[#DDE4E0] dark:border-[#24342C]">
                <div className="text-[10.5px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196] mb-2">
                  Sources
                </div>
                {sources.length === 0 ? (
                  <div className="text-[#6F7F77] dark:text-[#8DA196]">No external sources cited.</div>
                ) : (
                  <ul className="space-y-1 list-disc list-inside text-[11.5px]">
                    {sources.map((src, idx) => (
                      <li key={idx} className="break-words">
                        {src}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function CsrReviewView({
  items,
  loading,
  submittingId,
  onDecision,
  onRefresh,
}: CsrReviewViewProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-[#1D2A24] dark:text-[#EAF1ED]">
            CSR Review Queue
          </h1>
          <p className="text-sm text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
            Approve, edit, or reject drafted customer replies and warranty determinations before
            release.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#16201B] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24] text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED] transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh queue</span>
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-4">
          {[0, 1].map((idx) => (
            <div key={idx} className="rb-card h-56 animate-pulse bg-white dark:bg-[#16201B]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rb-card p-10 text-center">
          <div className="w-12 h-12 rounded-full bg-[#E6F3ED] dark:bg-[#173326] text-[#018752] dark:text-[#2FB06A] flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="font-display font-bold text-base text-[#1D2A24] dark:text-[#EAF1ED]">
            Queue is clear
          </h2>
          <p className="text-sm text-[#6F7F77] dark:text-[#96A89E] max-w-md mx-auto mt-1">
            All drafted replies and warranty approval cards have been handled. New items appear here
            automatically when categories are set to draft mode or flagged by output checks.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              submitting={submittingId === item.id}
              onDecision={onDecision}
            />
          ))}
        </div>
      )}
    </div>
  );
}
