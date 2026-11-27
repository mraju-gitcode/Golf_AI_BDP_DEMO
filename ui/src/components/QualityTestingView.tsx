import { FlaskConical, Play, ShieldCheck, Sparkles } from 'lucide-react';
import type { EvaluationRunResponse } from '../types/golfpm';
import { normalizeEvalRow, normalizePercent } from '../utils/formatters';
import { ToneBadge } from './ToneBadge';

interface QualityTestingViewProps {
  evaluation: EvaluationRunResponse | null;
  runningAction: 'test_cases' | 'generate' | 'synthetic' | null;
  lastGeneratedCount: number | null;
  onRunTestSet: () => void;
  onGenerateSynthetic: () => void;
  onRunSyntheticSet: () => void;
}

function DonutGauge({
  label,
  percent,
  centerText,
  subtitle,
}: {
  label: string;
  percent: number;
  centerText: string;
  subtitle?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="rb-card p-4 flex flex-col items-center text-center">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90" aria-hidden="true">
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            strokeWidth="8"
            className="stroke-[#E6ECE8] dark:stroke-[#23322A]"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="stroke-[#018752] dark:stroke-[#2FB06A] transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display font-extrabold text-lg text-[#1D2A24] dark:text-[#EAF1ED] tabular-nums">
            {centerText}
          </span>
        </div>
      </div>

      <div className="font-display font-bold text-xs text-[#1D2A24] dark:text-[#EAF1ED] mt-2.5">
        {label}
      </div>
      {subtitle && (
        <div className="text-[11px] text-[#6F7F77] dark:text-[#96A89E] mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}

export function QualityTestingView({
  evaluation,
  runningAction,
  lastGeneratedCount,
  onRunTestSet,
  onGenerateSynthetic,
  onRunSyntheticSet,
}: QualityTestingViewProps) {
  const summary = evaluation?.summary;
  const rows = (evaluation?.results ?? []).map(normalizeEvalRow);

  const overallPct = summary
    ? summary.total > 0
      ? Math.round((summary.passed / summary.total) * 100)
      : 0
    : 0;
  const routingPct = normalizePercent(summary?.routing_accuracy);
  const actionPct = normalizePercent(summary?.action_accuracy);
  const guardrailPct = normalizePercent(summary?.guardrail_pass_rate);

  return (
    <div className="space-y-5">
      {/* Header & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-xl text-[#1D2A24] dark:text-[#EAF1ED]">
            Quality & Testing
          </h1>
          <p className="text-sm text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
            Run benchmark evaluations across curated GolfPM scenarios and synthetic test suites.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={Boolean(runningAction)}
            onClick={onRunTestSet}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#018752] hover:bg-[#006A40] text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
          >
            <Play className="w-3.5 h-3.5" />
            <span>
              {runningAction === 'test_cases' ? 'Running GolfPM set…' : 'Run GolfPM test set'}
            </span>
          </button>

          <button
            type="button"
            disabled={Boolean(runningAction)}
            onClick={onGenerateSynthetic}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#16201B] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24] text-[#1D2A24] dark:text-[#EAF1ED] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#018752] dark:text-[#2FB06A]" />
            <span>
              {runningAction === 'generate' ? 'Generating…' : 'Generate synthetic emails'}
            </span>
          </button>

          <button
            type="button"
            disabled={Boolean(runningAction)}
            onClick={onRunSyntheticSet}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#018752] dark:border-[#2FB06A] text-[#006A40] dark:text-[#6EE09F] bg-[#E6F3ED]/60 dark:bg-[#173326] hover:bg-[#E6F3ED] dark:hover:bg-[#1E4231] text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>
              {runningAction === 'synthetic' ? 'Running synthetic…' : 'Run synthetic set'}
            </span>
          </button>
        </div>
      </div>

      {lastGeneratedCount !== null && (
        <div className="rounded-lg bg-[#E6F3ED] dark:bg-[#143123] border border-[#BFE0D0] dark:border-[#23523A] px-4 py-2.5 text-xs font-medium text-[#006A40] dark:text-[#6EE09F]">
          Generated {lastGeneratedCount} synthetic emails (`synthetic_cases.json`). Click{' '}
          <span className="font-bold">Run synthetic set</span> to evaluate them.
        </div>
      )}

      {!summary ? (
        <div className="rb-card p-10 text-center">
          <div className="w-12 h-12 rounded-full bg-[#E6F3ED] dark:bg-[#173326] text-[#018752] dark:text-[#2FB06A] flex items-center justify-center mx-auto mb-3">
            <FlaskConical className="w-6 h-6" />
          </div>
          <h2 className="font-display font-bold text-base text-[#1D2A24] dark:text-[#EAF1ED]">
            No evaluation run yet
          </h2>
          <p className="text-sm text-[#6F7F77] dark:text-[#96A89E] max-w-md mx-auto mt-1">
            Run the GolfPM test set to measure routing accuracy, action accuracy, guardrail pass
            rate, and red-team safety performance.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Donut Gauges + Safety Tile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <DonutGauge
              label="Overall pass"
              percent={overallPct}
              centerText={`${summary.passed}/${summary.total}`}
              subtitle={`${overallPct}% passed`}
            />
            <DonutGauge
              label="Routing accuracy"
              percent={routingPct}
              centerText={`${routingPct}%`}
              subtitle="target 95% at go-live"
            />
            <DonutGauge
              label="Action accuracy"
              percent={actionPct}
              centerText={`${actionPct}%`}
              subtitle="expected action match"
            />
            <DonutGauge
              label="Guardrail pass rate"
              percent={guardrailPct}
              centerText={`${guardrailPct}%`}
              subtitle="output policy checks"
            />

            {/* Safety cases passed tile */}
            <div className="rb-card p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
                  Safety cases passed
                </span>
                <ShieldCheck className="w-4 h-4 text-[#018752] dark:text-[#2FB06A]" />
              </div>
              <div className="my-3">
                <div className="font-display font-extrabold text-3xl text-[#018752] dark:text-[#2FB06A] tabular-nums">
                  {summary.safety_cases_passed}
                  {summary.safety_cases_total !== undefined && (
                    <span className="text-base font-bold text-[#6F7F77] dark:text-[#8DA196]">
                      /{summary.safety_cases_total}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-[#6F7F77] dark:text-[#96A89E]">
                Prompt injection, spoofing & PII red-team checks
              </div>
            </div>
          </div>

          {/* Results Table */}
          <section className="rb-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#DDE4E0] dark:border-[#24342C] flex items-center justify-between gap-2">
              <h2 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED]">
                Case results
                {evaluation?.file && (
                  <span className="ml-2 font-mono text-xs font-normal text-[#6F7F77] dark:text-[#8DA196]">
                    ({evaluation.file})
                  </span>
                )}
              </h2>
              <span className="text-xs font-mono text-[#6F7F77] dark:text-[#8DA196] tabular-nums">
                {rows.length} cases
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="bg-[#F7FAF8] dark:bg-[#121A16] border-b border-[#DDE4E0] dark:border-[#24342C] text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
                    <th className="py-3 pl-5 pr-3">ID</th>
                    <th className="py-3 px-3">Scenario</th>
                    <th className="py-3 px-3">Category (exp / pred)</th>
                    <th className="py-3 px-3">Action (exp / pred)</th>
                    <th className="py-3 px-3">Result</th>
                    <th className="py-3 pl-3 pr-5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F0] dark:divide-[#202E27] text-xs">
                  {rows.map((row) => {
                    const catMismatch =
                      row.expectedCategory !== '-' &&
                      row.predictedCategory !== '-' &&
                      row.expectedCategory !== row.predictedCategory;
                    const actMismatch =
                      row.expectedAction !== '-' &&
                      row.predictedAction !== '-' &&
                      row.expectedAction !== row.predictedAction;

                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-[#FAFBFB] dark:hover:bg-[#1A251F] transition-colors"
                      >
                        <td className="py-3 pl-5 pr-3 font-mono font-semibold text-[#1D2A24] dark:text-[#EAF1ED] whitespace-nowrap">
                          {row.id}
                        </td>
                        <td className="py-3 px-3 font-medium text-[#1D2A24] dark:text-[#DCE6E0] max-w-[240px]">
                          {row.scenario}
                        </td>
                        <td className="py-3 px-3 font-mono whitespace-nowrap tabular-nums">
                          <span>{row.expectedCategory}</span>
                          <span className="mx-1 text-[#6F7F77]">/</span>
                          <span
                            className={
                              catMismatch
                                ? 'text-[#B42318] dark:text-[#FCA5A5] font-bold'
                                : 'text-[#006A40] dark:text-[#6EE09F] font-semibold'
                            }
                          >
                            {row.predictedCategory}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono whitespace-nowrap">
                          <span>{row.expectedAction}</span>
                          <span className="mx-1 text-[#6F7F77]">/</span>
                          <span
                            className={
                              actMismatch
                                ? 'text-[#B42318] dark:text-[#FCA5A5] font-bold'
                                : 'text-[#006A40] dark:text-[#6EE09F] font-semibold'
                            }
                          >
                            {row.predictedAction}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <ToneBadge
                            label={row.passed ? 'Pass' : 'Fail'}
                            tone={row.passed ? 'green' : 'red'}
                          />
                        </td>
                        <td className="py-3 pl-3 pr-5 text-[#4C5C54] dark:text-[#B3C2BA] max-w-[320px]">
                          {row.reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
