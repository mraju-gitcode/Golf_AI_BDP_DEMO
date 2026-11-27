import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, FileSpreadsheet, FileText, RefreshCw, Search } from 'lucide-react';
import { golfpmApi } from '../api/client';
import type { KnowledgeDocument, KnowledgeResponse } from '../types/golfpm';
import { DocumentViewer } from './DocumentViewer';
import { ToneBadge } from './ToneBadge';

type Filter = 'all' | 'public' | 'internal' | 'data';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'public', label: 'Customer-facing' },
  { id: 'internal', label: 'Internal' },
  { id: 'data', label: 'Data & attachments' },
];

function groupOf(d: KnowledgeDocument): Filter {
  if (d.format === 'xlsx' || d.audience === 'customer') return 'data';
  return d.audience === 'public' ? 'public' : 'internal';
}

function audienceBadge(d: KnowledgeDocument) {
  if (d.audience === 'public') return <ToneBadge label="Customer-facing" tone="green" />;
  if (d.audience === 'customer') return <ToneBadge label="Customer attachment" tone="blue" />;
  return <ToneBadge label="Internal only" tone="amber" />;
}

export function KnowledgeView({ onError }: { onError: (err: unknown, fallback: string) => void }) {
  const [data, setData] = useState<KnowledgeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState<KnowledgeDocument | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await golfpmApi.getDocuments());
    } catch (err) {
      onError(err, 'Could not load knowledge sources');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const docs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.documents ?? []).filter(
      (d) =>
        (filter === 'all' || groupOf(d) === filter) &&
        (!q || `${d.title} ${d.doc_type} ${d.owner} ${d.location}`.toLowerCase().includes(q)),
    );
  }, [data, filter, query]);

  const stats = data?.stats;
  const tile = (label: string, value: number | string, sub: string, accent = false) => (
    <div
      className={
        accent
          ? 'rounded-[10px] p-4 text-white bg-gradient-to-br from-[#006A40] to-[#018752] shadow-sm'
          : 'rb-card p-4'
      }
    >
      <div
        className={`text-[11px] font-display font-bold uppercase tracking-wider ${accent ? 'text-white/85' : 'text-[#6F7F77] dark:text-[#8DA196]'}`}
      >
        {label}
      </div>
      <div
        className={`font-display font-extrabold text-3xl mt-2 tabular-nums ${accent ? '' : 'text-[#1D2A24] dark:text-[#EAF1ED]'}`}
      >
        {value}
      </div>
      <div className={`text-xs mt-1 ${accent ? 'text-white/80' : 'text-[#6F7F77] dark:text-[#96A89E]'}`}>{sub}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      {viewing && <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-[#1D2A24] dark:text-[#EAF1ED]">Knowledge Sources</h1>
          <p className="text-sm text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
            The approved documents the agents may use, and how each one may be used. All synthetic stand-ins for the
            Box and rainbird.com sources in the Behavior Specification.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#16201B] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24] text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED] transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {tile('Documents', stats?.total ?? 0, 'PDF, Word and Excel files', true)}
        {tile('Searched by agents', stats?.indexed ?? 0, 'indexed with citations')}
        {tile('Customer-facing', stats?.public ?? 0, 'may be cited and linked in replies')}
        {tile('Internal only', stats?.internal ?? 0, 'inform CSRs, never quoted')}
      </div>

      <div className="rb-card">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[#E4EAE6] dark:border-[#22322A]">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Document filter">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`h-8 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  filter === f.id
                    ? 'bg-[#018752] text-white'
                    : 'bg-[#F4F6F5] dark:bg-[#1D2A24] text-[#4C5C54] dark:text-[#B3C2BA] hover:bg-[#E6F3ED] dark:hover:bg-[#163626]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#6F7F77]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a document, owner or location..."
              aria-label="Search documents"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#0F1613] text-sm text-[#1D2A24] dark:text-[#EAF1ED] focus:outline-none focus:ring-2 focus:ring-[#018752]"
            />
          </label>
        </div>

        <ul className="divide-y divide-[#E4EAE6] dark:divide-[#22322A]">
          {docs.map((d) => {
            const Icon = d.format === 'xlsx' ? FileSpreadsheet : FileText;
            return (
              <li key={d.id} className="p-4 flex flex-col md:flex-row md:items-start gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg grid place-items-center bg-[#E6F3ED] dark:bg-[#163626] text-[#018752] dark:text-[#2FB06A] shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-[#1D2A24] dark:text-[#EAF1ED]">{d.title}</span>
                      <span className="text-[11px] font-mono uppercase text-[#6F7F77]">{d.format}</span>
                    </div>
                    <div className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
                      {d.doc_type} · {d.owner} · {d.location} · updated {d.updated}
                    </div>
                    <div className="text-xs text-[#4C5C54] dark:text-[#B3C2BA] mt-1.5">{d.usage}</div>
                    {d.sections.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {d.sections.map((s) => (
                          <span
                            key={s}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-[#F4F6F5] dark:bg-[#1D2A24] text-[#4C5C54] dark:text-[#B3C2BA]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap md:flex-col md:items-end gap-1.5 shrink-0">
                  {audienceBadge(d)}
                  {d.indexed ? (
                    <ToneBadge label="Searched by agents" tone="green" />
                  ) : (
                    <ToneBadge label="Not searched" tone="grey" />
                  )}
                  <button
                    type="button"
                    onClick={() => setViewing(d)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#006A40] dark:text-[#6EE09F] hover:underline mt-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" /> Open
                  </button>
                </div>
              </li>
            );
          })}
          {!docs.length && (
            <li className="p-10 text-center text-sm text-[#6F7F77]">
              {loading ? 'Loading documents...' : 'No documents match this filter.'}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
