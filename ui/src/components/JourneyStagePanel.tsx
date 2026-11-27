import { useEffect, useState } from 'react';
import { FlaskConical, Loader2, Play, Power, Send, X } from 'lucide-react';
import type {
  AgentConfig,
  EvaluationRunResponse,
  OutboxMessage,
  ProcessedEmail,
  TestCaseItem,
} from '../types/golfpm';
import type { DemoStageDefinition } from '../utils/journey';
import { InlineResult, ScenarioRunner } from './ScenarioRunner';

export interface JourneyActions {
  onRunScenario: (tc: TestCaseItem) => Promise<ProcessedEmail | null>;
  onApprove: (msg: OutboxMessage) => Promise<boolean>;
  onOpenEmail: (email: ProcessedEmail) => void;
  onSetKillSwitch: (on: boolean) => Promise<boolean>;
  onSendProbe: () => Promise<ProcessedEmail | null>;
  onRunEvaluation: () => Promise<EvaluationRunResponse | null>;
}

const btnPrimary =
  'inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#018752] hover:bg-[#006A40] text-white text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50';
const btnSecondary =
  'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#16201B] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24] text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50';

/** Live, in-card run of one journey step: open the ticket, run the agent, watch the result. */
export function JourneyStagePanel({
  stage,
  scenario,
  config,
  backendReachable,
  actions,
  onClose,
}: {
  stage: DemoStageDefinition;
  scenario: TestCaseItem | null;
  config: AgentConfig | null;
  backendReachable: boolean;
  actions: JourneyActions;
  onClose: () => void;
}) {
  return (
    <div className="rounded-[10px] border border-[#BFE0D0] dark:border-[#25543C] bg-[#FAFCFB] dark:bg-[#101814] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-display font-bold text-xs uppercase tracking-wider text-[#006A40] dark:text-[#6EE09F]">
          Live run
        </span>
        <button type="button" onClick={onClose} className="ml-auto text-[#6F7F77] hover:text-[#1D2A24] cursor-pointer" aria-label="Close live run">
          <X className="w-4 h-4" />
        </button>
      </div>
      {stage.id === 'kill_switch' ? (
        <KillSwitchRun config={config} actions={actions} />
      ) : stage.id === 'go_live_proof' ? (
        <EvaluationRun actions={actions} />
      ) : scenario ? (
        <ScenarioRun scenario={scenario} backendReachable={backendReachable} actions={actions} />
      ) : (
        <p className="text-sm text-[#6F7F77]">No matching scenario found. Start the backend and refresh.</p>
      )}
    </div>
  );
}

function ScenarioRun({
  scenario,
  backendReachable,
  actions,
}: {
  scenario: TestCaseItem;
  backendReachable: boolean;
  actions: JourneyActions;
}) {
  const [running, setRunning] = useState(false);
  const [email, setEmail] = useState<ProcessedEmail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);

  const run = async () => {
    setRunning(true);
    setError(null);
    const started = Date.now();
    const result = await actions.onRunScenario(scenario);
    // Keep the progress view on screen for at least ~2.5 s so the audience can follow the stages.
    const wait = Math.max(0, 2500 - (Date.now() - started));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    setRunning(false);
    if (result) setEmail(result);
    else setError('The agent run failed. Check the backend terminal, then try again.');
  };

  if (email) {
    return (
      <InlineResult
        email={email}
        replayKey={replay}
        onOpenInbox={() => actions.onOpenEmail(email)}
        onApprove={actions.onApprove}
        onReplay={() => setReplay((n) => n + 1)}
      />
    );
  }
  return (
    <ScenarioRunner
      scenario={scenario}
      running={running}
      error={error}
      onRun={() => void run()}
      backendReachable={backendReachable}
      compact
    />
  );
}

function KillSwitchRun({ config, actions }: { config: AgentConfig | null; actions: JourneyActions }) {
  const [on, setOn] = useState<boolean>(Boolean(config?.kill_switch));
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [probe, setProbe] = useState<ProcessedEmail | null>(null);
  const [replay, setReplay] = useState(0);

  useEffect(() => setOn(Boolean(config?.kill_switch)), [config?.kill_switch]);

  const toggle = async () => {
    setBusy(true);
    if (await actions.onSetKillSwitch(!on)) {
      setOn(!on);
      setProbe(null);
    }
    setBusy(false);
  };
  const send = async () => {
    setSending(true);
    const r = await actions.onSendProbe();
    setSending(false);
    if (r) {
      setProbe(r);
      setReplay((n) => n + 1);
    }
  };

  return (
    <div className="space-y-3">
      <div
        className={`flex flex-wrap items-center gap-3 rounded-[10px] border p-4 ${
          on
            ? 'border-[#F7C5C2] bg-[#FDECEC] dark:border-[#5E2424] dark:bg-[#3A1717]'
            : 'border-[#DDE4E0] dark:border-[#24342C] bg-white dark:bg-[#131C18]'
        }`}
      >
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={busy}
          onClick={() => void toggle()}
          className={`relative w-14 h-8 rounded-full transition-colors cursor-pointer disabled:opacity-60 ${on ? 'bg-[#D92D20]' : 'bg-[#018752]'}`}
        >
          <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${on ? 'left-7' : 'left-1'}`} />
        </button>
        <div>
          <div className="font-display font-bold text-sm text-[#1D2A24] dark:text-[#EAF1ED] flex items-center gap-1.5">
            <Power className="w-4 h-4" /> Kill switch is {on ? 'ON: agent paused' : 'OFF: agent active'}
          </div>
          <div className="text-xs text-[#6F7F77] dark:text-[#96A89E]">
            {on
              ? 'Every new email goes to a person unchanged. No automated replies.'
              : 'Flip it to stop all automated replies instantly, without a deployment.'}
          </div>
        </div>
        <button type="button" className={`${btnSecondary} ml-auto`} disabled={sending} onClick={() => void send()}>
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          <span>Send a test email now</span>
        </button>
      </div>
      {probe && (
        <InlineResult
          email={probe}
          replayKey={replay}
          onOpenInbox={() => actions.onOpenEmail(probe)}
          onApprove={actions.onApprove}
          onReplay={() => setReplay((n) => n + 1)}
        />
      )}
      {on && (
        <p className="text-xs font-semibold text-[#B42318] dark:text-[#FCA5A5]">
          Remember to switch it back off before the next scene.
        </p>
      )}
    </div>
  );
}

function EvaluationRun({ actions }: { actions: JourneyActions }) {
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [res, setRes] = useState<EvaluationRunResponse | null>(null);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  const run = async () => {
    setRes(null);
    setStartedAt(Date.now());
    setRunning(true);
    const r = await actions.onRunEvaluation();
    setRunning(false);
    setRes(r);
  };

  const s = res?.summary;
  const pct = (x?: number) => (x == null ? '-' : `${Math.round(x * 100)}%`);
  return (
    <div className="space-y-3">
      {!running && !res && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimary} onClick={() => void run()}>
            <Play className="w-4 h-4" /> <span>Run the 44-case GolfPM test set</span>
          </button>
          <span className="text-xs text-[#6F7F77]">39 sample emails + 5 red-team attacks, each in a clean test mailbox. About 30 s.</span>
        </div>
      )}
      {running && (
        <div className="rounded-[10px] border border-[#BFE0D0] dark:border-[#25543C] bg-[#F6FBF8] dark:bg-[#13221B] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1D2A24] dark:text-[#EAF1ED]">
            <FlaskConical className="w-4 h-4 text-[#018752]" /> Running 44 emails through the live agent in parallel
            <span className="ml-auto font-mono text-xs text-[#6F7F77] tabular-nums">{((now - startedAt) / 1000).toFixed(0)} s</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-[#E6ECE8] dark:bg-[#23322A] overflow-hidden">
            <div
              className="h-full bg-[#018752] transition-all duration-300"
              style={{ width: `${Math.min(95, ((now - startedAt) / 1000 / 35) * 100)}%` }}
            />
          </div>
        </div>
      )}
      {s && (
        <div className="trace-step-enter grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {[
            ['Passed', `${s.passed}/${s.total}`],
            ['Correct category', pct(s.routing_accuracy)],
            ['Correct action', pct(s.action_accuracy)],
            ['Output checks', pct(s.guardrail_pass_rate)],
            ['Safety & red team', String(s.safety_cases_passed)],
          ].map(([k, v]) => (
            <div key={k} className="rb-card p-3">
              <div className="text-[10.5px] font-display font-bold uppercase tracking-wider text-[#6F7F77]">{k}</div>
              <div className="font-display font-extrabold text-2xl text-[#018752] dark:text-[#2FB06A] tabular-nums">{v}</div>
            </div>
          ))}
          <div className="col-span-2 md:col-span-5 flex flex-wrap items-center gap-2 text-xs text-[#6F7F77]">
            Go-live gate is 95% correct routing on Rain Bird's real emails.
            <button type="button" className={btnSecondary} onClick={() => void run()}>
              <Play className="w-3.5 h-3.5" /> Run again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
