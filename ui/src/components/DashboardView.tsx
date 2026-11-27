import { RefreshCw } from 'lucide-react';
import type { MetricsResponse } from '../types/golfpm';
import { DEFAULT_CATEGORY_NAMES, getActionDisplay } from '../utils/formatters';
import { ToneBadge } from './ToneBadge';

interface DashboardViewProps {
  metrics: MetricsResponse | null;
  loading: boolean;
  onRefresh: () => void;
}

export function DashboardView({ metrics, loading, onRefresh }: DashboardViewProps) {
  const totalEmails = metrics?.emails ?? 0;
  const agentHandled = metrics?.agent_handled ?? 0;
  const agentPct = totalEmails > 0 ? Math.round((agentHandled / totalEmails) * 100) : 0;

  const categoryRows = Array.from({ length: 9 }, (_, i) => {
    const id = String(i + 1);
    const entry = metrics?.by_category?.[id];
    return {
      id,
      num: i + 1,
      name: entry?.name || DEFAULT_CATEGORY_NAMES[id] || `Category ${id}`,
      count: entry?.count ?? 0,
    };
  });

  const maxCategoryCount = Math.max(1, ...categoryRows.map((c) => c.count));

  const actionEntries = Object.entries(metrics?.actions ?? {}).sort((a, b) => b[1] - a[1]);
  const totalActions = actionEntries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-[#1D2A24] dark:text-[#EAF1ED]">
            Operations Dashboard
          </h1>
          <p className="text-sm text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
            Live volume, automation coverage, SLA queue health, and outcome distribution across
            GolfPM.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#16201B] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24] text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED] transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh metrics</span>
        </button>
      </div>

      {/* Six KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* 1. Solid green gradient tile (only gradient in app, per spec) */}
        <div className="rounded-[10px] p-4 text-white bg-gradient-to-br from-[#006A40] to-[#018752] shadow-sm">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-white/85">
            Emails received
          </div>
          <div className="font-display font-extrabold text-3xl mt-2 tabular-nums">
            {totalEmails}
          </div>
          <div className="text-xs text-white/80 mt-1 tabular-nums">
            {metrics?.cases ?? 0} active cases
          </div>
        </div>

        {/* 2. Handled by agents */}
        <div className="rb-card p-4">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
            Handled by agents
          </div>
          <div className="font-display font-extrabold text-3xl text-[#018752] dark:text-[#2FB06A] mt-2 tabular-nums">
            {agentHandled}
          </div>
          <div className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-1 tabular-nums">
            {agentPct}% of email
          </div>
        </div>

        {/* 3. Routed to owners */}
        <div className="rb-card p-4">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
            Routed to owners
          </div>
          <div className="font-display font-extrabold text-3xl text-[#0072BC] dark:text-[#5FB2EC] mt-2 tabular-nums">
            {metrics?.routed ?? 0}
          </div>
          <div className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-1">
            Categories 4–9 triage
          </div>
        </div>

        {/* 4. Escalated */}
        <div className="rb-card p-4">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
            Escalated
          </div>
          <div className="font-display font-extrabold text-3xl text-[#B42318] dark:text-[#FCA5A5] mt-2 tabular-nums">
            {metrics?.escalated ?? 0}
          </div>
          <div className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-1 tabular-nums">
            {metrics?.guardrail_blocks ?? 0} output blocks
          </div>
        </div>

        {/* 5. Waiting for CSR */}
        <div className="rb-card p-4">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
            Waiting for CSR
          </div>
          <div className="font-display font-extrabold text-3xl text-[#1D2A24] dark:text-[#EAF1ED] mt-2 tabular-nums">
            {metrics?.review_queue ?? 0}
          </div>
          <div
            className={`text-xs mt-1 font-semibold tabular-nums ${
              (metrics?.overdue ?? 0) > 0
                ? 'text-[#B42318] dark:text-[#FCA5A5]'
                : 'text-[#6F7F77] dark:text-[#96A89E] font-normal'
            }`}
          >
            {metrics?.overdue ?? 0} past SLA
          </div>
        </div>

        {/* 6. Avg first action ms */}
        <div className="rb-card p-4">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
            Avg first action
          </div>
          <div className="font-display font-extrabold text-3xl text-[#1D2A24] dark:text-[#EAF1ED] mt-2 tabular-nums">
            {Math.round(metrics?.avg_processing_ms ?? 0)}
            <span className="text-sm font-semibold text-[#6F7F77] dark:text-[#8DA196] ml-1">
              ms
            </span>
          </div>
          <div className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-1">
            {metrics?.kill_switch ? 'Kill switch active' : 'Normal operation'}
          </div>
        </div>
      </div>

      {/* Lower Charts & Outcomes Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Horizontal Bar Chart: Volume by category */}
        <section className="lg:col-span-7 rb-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-[#EEF2F0] dark:border-[#24342C]">
            <h2 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED]">
              Volume by category
            </h2>
            <div className="flex items-center gap-4 text-xs text-[#6F7F77] dark:text-[#96A89E]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#018752] dark:bg-[#2FB06A]" />
                <span>Agent (1–3)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#0072BC]" />
                <span>Routed (4–9)</span>
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {categoryRows.map((row) => {
              const isAgentCat = row.num <= 3;
              const widthPct = row.count > 0 ? Math.max(4, (row.count / maxCategoryCount) * 100) : 0;
              return (
                <div key={row.id} className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-5 sm:col-span-4 text-xs font-medium text-[#1D2A24] dark:text-[#DCE6E0] truncate">
                    <span className="font-mono text-[#6F7F77] dark:text-[#8DA196] mr-1.5">
                      {row.id}.
                    </span>
                    <span title={row.name}>{row.name}</span>
                  </div>
                  <div className="col-span-6 sm:col-span-7 h-5 rounded bg-[#EEF2F0] dark:bg-[#101814] overflow-hidden flex items-center">
                    {widthPct > 0 && (
                      <div
                        className={`h-full rounded transition-all duration-300 ${
                          isAgentCat
                            ? 'bg-[#018752] dark:bg-[#2FB06A]'
                            : 'bg-[#0072BC] dark:bg-[#2B90D9]'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    )}
                  </div>
                  <div className="col-span-1 text-right font-display font-bold text-xs text-[#1D2A24] dark:text-[#EAF1ED] tabular-nums">
                    {row.count}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Outcomes Table */}
        <section className="lg:col-span-5 rb-card p-5">
          <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-[#EEF2F0] dark:border-[#24342C]">
            <h2 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED]">
              Outcomes
            </h2>
            <span className="text-xs text-[#6F7F77] dark:text-[#96A89E] tabular-nums">
              {totalActions} total
            </span>
          </div>

          {actionEntries.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#6F7F77] dark:text-[#96A89E]">
              No email outcomes recorded yet. Process scenarios in the GolfPM Inbox to populate
              live metrics.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#DDE4E0] dark:border-[#24342C] text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
                    <th className="py-2 pr-3">Outcome</th>
                    <th className="py-2 px-3 text-right">Count</th>
                    <th className="py-2 pl-3 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F0] dark:divide-[#202E27] text-sm">
                  {actionEntries.map(([actionKey, count]) => {
                    const disp = getActionDisplay(actionKey);
                    const pct = totalActions > 0 ? Math.round((count / totalActions) * 100) : 0;
                    return (
                      <tr key={actionKey}>
                        <td className="py-2.5 pr-3">
                          <ToneBadge label={disp.label} tone={disp.color} />
                        </td>
                        <td className="py-2.5 px-3 text-right font-display font-bold text-[#1D2A24] dark:text-[#EAF1ED] tabular-nums">
                          {count}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono text-xs text-[#6F7F77] dark:text-[#96A89E] tabular-nums">
                          {pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
