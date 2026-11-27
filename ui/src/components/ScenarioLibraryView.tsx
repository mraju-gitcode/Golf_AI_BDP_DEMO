import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Database, Loader2, Play, RefreshCw, Search } from 'lucide-react';
import { golfpmApi } from '../api/client';
import type { ScenarioRow, ScenarioLibrary } from '../types/golfpm';
import { getActionDisplay } from '../utils/formatters';
import { ToneBadge } from './ToneBadge';

const btn =
  'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#16201B] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24] text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED] transition-colors cursor-pointer disabled:opacity-50';

/** Test scenario metadata DB: the validated test set every release is gated on. */
export function ScenarioLibraryView({ onError }: { onError: (err: unknown, fallback: string) => void }) {
  const [testSet, setTestSet] = useState<'validated' | 'synthetic'>('validated');
  const [data, setData] = useState<ScenarioLibrary | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [cat, setCat] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await golfpmApi.getScenarios(testSet));
    } catch (err) {
      onError(err, 'Could not load the test scenario DB');
    } finally {
      setLoading(false);
    }
  }, [testSet, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    setRunning(true);
    try {
      await golfpmApi.runEvaluation(testSet === 'validated' ? 'test_cases.json' : 'synthetic_cases.json');
      await load();
    } catch (err) {
      onError(err, 'Evaluation failed');
    } finally {
      setRunning(false);
    }
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.scenarios ?? []).filter(
      (r) =>
        (cat === 'all' || String(r.category ?? 'none') === cat) &&
        (!q || `${r.id} ${r.scenario} ${r.subject} ${r.test_type} ${r.open_items}`.toLowerCase().includes(q)),
    );
  }, [data, cat, query]);

  const s = data?.stats;
  const lastRun = s?.last_run_at ? new Date(s.last_run_at * 1000).toLocaleString() : 'not run yet';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-[#1D2A24] dark:text-[#EAF1ED] flex items-center gap-2">
            <Database className="w-5 h-5 text-[#018752]" /> Test Scenarios
          </h1>
          <p className="text-sm text-[#6F7F77] dark:text-[#96A89E] mt-0.5 max-w-3xl">
            The test scenario metadata DB. Every scenario has its category, test type, expected outcome, open items and
            evaluation questions, plus the result of its last run. Every release is gated on the validated set.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] overflow-hidden">
            {(['validated', 'synthetic'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTestSet(t)}
                className={`h-9 px-3 text-xs font-semibold cursor-pointer ${
                  testSet === t ? 'bg-[#018752] text-white' : 'bg-white dark:bg-[#16201B] text-[#4C5C54] dark:text-[#B3C2BA]'
                }`}
              >
                {t === 'validated' ? 'Validated set' : 'Synthetic set'}
              </button>
            ))}
          </div>
          <button type="button" className={btn} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#018752] hover:bg-[#006A40] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {running ? 'Running…' : 'Run this set'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-[10px] p-4 text-white bg-gradient-to-br from-[#006A40] to-[#018752]">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-white/85">Scenarios</div>
          <div className="font-display font-extrabold text-3xl mt-1 tabular-nums">{s?.total ?? 0}</div>
          <div className="text-xs text-white/80 mt-0.5">{(s?.sources ?? []).join(' · ')}</div>
        </div>
        <div className="rb-card p-4">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77]">Categories covered</div>
          <div className="font-display font-extrabold text-3xl mt-1 tabular-nums text-[#018752] dark:text-[#2FB06A]">
            {s?.categories_covered ?? 0}/{s?.categories_total ?? 9}
          </div>
          <div className="text-xs text-[#6F7F77] mt-0.5">all nine request categories</div>
        </div>
        <div className="rb-card p-4">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77]">Last run</div>
          <div className="font-display font-extrabold text-3xl mt-1 tabular-nums text-[#018752] dark:text-[#2FB06A]">
            {s?.last_run_at ? `${s.passed}/${s.total}` : '-'}
          </div>
          <div className="text-xs text-[#6F7F77] mt-0.5">{lastRun}</div>
        </div>
        <div className="rb-card p-4">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77]">Evaluation questions</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(s?.evaluation_questions ?? {}).map(([q, n]) => (
              <ToneBadge key={q} label={`${q} · ${n}`} tone="green" />
            ))}
          </div>
          <div className="text-xs text-[#6F7F77] mt-1.5">E1 categorize · E2 act · E3 route · E4 respond</div>
        </div>
      </div>

      <div className="rb-card overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E4EAE6] dark:border-[#22322A] font-display font-bold text-sm text-[#1D2A24] dark:text-[#EAF1ED]">
          Coverage by category
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-[#6F7F77]">
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Scenarios</th>
                <th className="px-4 py-2">Test types</th>
                <th className="px-4 py-2">Last run</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(s?.by_category ?? {})
                .filter(([, v]) => v.count > 0)
                .map(([k, v]) => (
                  <tr
                    key={k}
                    onClick={() => setCat(cat === k ? 'all' : k)}
                    className={`border-t border-[#EEF2F0] dark:border-[#24342C] cursor-pointer hover:bg-[#F6FBF8] dark:hover:bg-[#13221B] ${cat === k ? 'bg-[#E6F3ED] dark:bg-[#163626]' : ''}`}
                  >
                    <td className="px-4 py-2 font-semibold text-[#1D2A24] dark:text-[#EAF1ED] whitespace-nowrap">
                      {k === 'none' ? '' : `${k}. `}
                      {v.name}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{v.count}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(v.types).map(([t, n]) => (
                          <span key={t} className="px-1.5 py-0.5 rounded bg-[#F4F6F5] dark:bg-[#1D2A24] text-[#4C5C54] dark:text-[#B3C2BA]">
                            {t} {n}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {v.run ? (
                        <span className={v.passed === v.run ? 'text-[#018752] font-semibold' : 'text-[#B42318] font-semibold'}>
                          {v.passed}/{v.run} passed
                        </span>
                      ) : (
                        <span className="text-[#6F7F77]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rb-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#E4EAE6] dark:border-[#22322A]">
          <span className="font-display font-bold text-sm text-[#1D2A24] dark:text-[#EAF1ED]">
            Scenarios {cat !== 'all' && <span className="text-[#6F7F77] font-normal">· category {cat}</span>}
          </span>
          {cat !== 'all' && (
            <button type="button" className="text-xs text-[#006A40] hover:underline cursor-pointer" onClick={() => setCat('all')}>
              show all
            </button>
          )}
          <label className="relative ml-auto w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#6F7F77]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a scenario, ID or open item…"
              aria-label="Search scenarios"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#0F1613] text-sm focus:outline-none focus:ring-2 focus:ring-[#018752]"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-[#6F7F77]">
                <th className="px-3 py-2" />
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Scenario</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Expected</th>
                <th className="px-3 py-2">Covers</th>
                <th className="px-3 py-2">Open items</th>
                <th className="px-3 py-2">Last result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: ScenarioRow) => {
                const exp = getActionDisplay(r.expected_action);
                const isOpen = open === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      key={r.id}
                      onClick={() => setOpen(isOpen ? null : r.id)}
                      className="border-t border-[#EEF2F0] dark:border-[#24342C] cursor-pointer hover:bg-[#F6FBF8] dark:hover:bg-[#13221B] align-top"
                    >
                      <td className="px-3 py-2 text-[#6F7F77]">{isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
                      <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">{r.id}</td>
                      <td className="px-3 py-2 text-[#1D2A24] dark:text-[#EAF1ED] min-w-[220px]">{r.scenario}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.test_type}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="text-[#4C5C54] dark:text-[#B3C2BA]">{r.category ? `Cat ${r.category} · ` : ''}</span>
                        <ToneBadge label={exp.label} tone={exp.color} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-[#4C5C54] dark:text-[#B3C2BA]">{r.evaluation_questions}</td>
                      <td className="px-3 py-2 text-[#4C5C54] dark:text-[#B3C2BA]">{r.open_items || '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.last_run_at ? (
                          r.last_passed ? (
                            <ToneBadge label="Pass" tone="green" />
                          ) : (
                            <ToneBadge label="Fail" tone="red" />
                          )
                        ) : (
                          <span className="text-[#6F7F77]">-</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.id}-body`} className="bg-[#FAFCFB] dark:bg-[#101814]">
                        <td />
                        <td colSpan={7} className="px-3 py-3">
                          <div className="text-[11px] text-[#6F7F77]">
                            {r.source} · from {r.sender}
                            {r.thread_of ? ` · follows ${r.thread_of}` : ''}
                          </div>
                          <div className="font-semibold text-[13px] text-[#1D2A24] dark:text-[#EAF1ED] mt-1">{r.subject}</div>
                          <div className="text-[12.5px] whitespace-pre-wrap text-[#34453D] dark:text-[#C5D3CB] mt-1">{r.body}</div>
                          {r.last_reason && (
                            <div className="text-[11.5px] text-[#4C5C54] dark:text-[#B3C2BA] mt-2">
                              Last run: {r.last_action} · {r.last_reason}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
