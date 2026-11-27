import { useEffect, useState } from 'react';
import { Activity, Loader2, Mail, Radio } from 'lucide-react';
import type { ActivityItem, LiveStatus } from '../types/golfpm';
import { extractSenderName, getTraceStepLabel } from '../utils/formatters';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const ago = (now: number, ts?: number | null) => {
  if (!ts) return 'not yet';
  const s = Math.max(0, Math.round(now / 1000 - ts));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
};

/** Top of the Inbox list in live mode: which mailbox, when it last checked, and emails being processed now. */
export function LiveMailboxHeader({ live }: { live: LiveStatus }) {
  const now = useNow();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="relative flex w-2.5 h-2.5">
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${live.connected ? 'bg-[#2FB06A] animate-ping opacity-60' : ''}`}
          />
          <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${live.connected ? 'bg-[#018752]' : 'bg-[#F2A900]'}`} />
        </span>
        <span className="font-display font-bold text-sm text-[#1D2A24] dark:text-[#EAF1ED]">GolfPM mailbox</span>
        <span className="ml-auto text-[11px] text-[#6F7F77] dark:text-[#96A89E] tabular-nums">
          {live.connected ? `checked ${ago(now, live.last_poll_at)}` : 'connecting…'}
        </span>
      </div>
      <div className="text-xs font-mono text-[#4C5C54] dark:text-[#B3C2BA] truncate" title={live.address}>
        {live.address}
      </div>
      {live.last_error && !live.connected && (
        <div className="text-[11px] text-[#B42318] dark:text-[#FCA5A5]">{live.last_error}</div>
      )}
      {(live.processing ?? []).map((p) => (
        <div
          key={`${p.from}-${p.since}`}
          className="trace-step-enter flex items-start gap-2 rounded-lg border border-[#BFE0D0] dark:border-[#25543C] bg-[#F6FBF8] dark:bg-[#13221B] px-3 py-2"
        >
          <Loader2 className="w-4 h-4 mt-0.5 animate-spin text-[#018752] dark:text-[#2FB06A] shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED]">
              New email from {p.from_name || extractSenderName(p.from)}
            </div>
            <div className="text-[11.5px] text-[#4C5C54] dark:text-[#B3C2BA] truncate">{p.subject}</div>
            <div className="text-[11px] text-[#006A40] dark:text-[#6EE09F]">GolfPM Assist is working on it…</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Live log of every agent step across all emails, newest first. */
export function LiveActivityLog({ live, activity }: { live: LiveStatus; activity: ActivityItem[] }) {
  const now = useNow();
  const [seen] = useState(() => new Set<number>(activity.map((a) => a.id)));
  const rows = activity.slice(0, 14);
  return (
    <section className="rb-card mb-5 overflow-hidden" aria-label="Live activity">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-b border-[#E4EAE6] dark:border-[#22322A] bg-[#FAFBFB] dark:bg-[#131C18]">
        <span className="inline-flex items-center gap-1.5 font-display font-bold text-sm text-[#1D2A24] dark:text-[#EAF1ED]">
          <Activity className="w-4 h-4 text-[#018752] dark:text-[#2FB06A]" /> Live activity
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[#4C5C54] dark:text-[#B3C2BA]">
          <Radio className={`w-3.5 h-3.5 ${live.connected ? 'text-[#018752]' : 'text-[#F2A900]'}`} />
          {live.connected ? 'Connected' : 'Connecting'} to {live.address} · checks every {live.poll_seconds}s
        </span>
        <span className="ml-auto inline-flex items-center gap-3 text-xs text-[#6F7F77] tabular-nums">
          <span>
            <Mail className="w-3.5 h-3.5 inline -mt-0.5" /> {live.received} received
          </span>
          <span>{live.sent} emails sent</span>
        </span>
      </div>
      <ol className="max-h-56 overflow-auto divide-y divide-[#EEF2F0] dark:divide-[#1F2C26] font-mono text-[12px]">
        {rows.length === 0 && (
          <li className="px-4 py-3 text-[#6F7F77] font-sans text-sm">
            Waiting for email. Send a message to {live.address} and it will appear here within {live.poll_seconds}{' '}
            seconds.
          </li>
        )}
        {rows.map((a) => {
          const fresh = !seen.has(a.id);
          const alert = /NOT opened|masked|Injected|Suspicious|FAILED|failed|Kill switch|error/i.test(a.title);
          const mail = a.step === 'mailbox';
          return (
            <li
              key={a.id}
              className={`flex items-start gap-3 px-4 py-1.5 ${fresh ? 'trace-step-enter bg-[#F6FBF8] dark:bg-[#13221B]' : ''}`}
            >
              <span className="text-[#6F7F77] tabular-nums shrink-0 w-14">{ago(now, a.ts)}</span>
              <span
                className={`shrink-0 w-36 truncate font-sans text-[11px] font-bold uppercase tracking-wider ${
                  alert ? 'text-[#B42318] dark:text-[#FCA5A5]' : mail ? 'text-[#0072BC] dark:text-[#7BC4FA]' : 'text-[#006A40] dark:text-[#6EE09F]'
                }`}
              >
                {mail ? 'Mailbox' : getTraceStepLabel(a.step)}
              </span>
              <span className="min-w-0 text-[#1D2A24] dark:text-[#DCE6E0] break-words font-sans">
                {a.title}
                {a.subject && !mail && (
                  <span className="text-[#6F7F77]">
                    {' '}
                    · {extractSenderName(a.from_addr ?? '')}: {a.subject}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
