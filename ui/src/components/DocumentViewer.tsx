import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, X } from 'lucide-react';
import { API_BASE_URL, golfpmApi } from '../api/client';
import type { DocumentPreview, KnowledgeDocument } from '../types/golfpm';
import { ToneBadge } from './ToneBadge';

/** Popup viewer for a knowledge source: formatted document, spreadsheet table, or inline PDF. */
export function DocumentViewer({ doc, onClose }: { doc: KnowledgeDocument; onClose: () => void }) {
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    golfpmApi
      .getDocumentPreview(doc.id)
      .then((p) => alive && setPreview(p))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load the document'));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [doc.id, onClose]);

  const Icon = doc.format === 'xlsx' ? FileSpreadsheet : FileText;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl bg-white dark:bg-[#16201B] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-[#E4EAE6] dark:border-[#22322A]">
          <div className="w-10 h-10 rounded-lg grid place-items-center bg-[#E6F3ED] dark:bg-[#163626] text-[#018752] dark:text-[#2FB06A] shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display font-bold text-base text-[#1D2A24] dark:text-[#EAF1ED] leading-snug">{doc.title}</div>
            <div className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
              {doc.doc_type} · {doc.owner} · {doc.location} · updated {doc.updated}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {doc.audience === 'public' ? (
                <ToneBadge label="Customer-facing" tone="green" />
              ) : doc.audience === 'customer' ? (
                <ToneBadge label="Customer attachment" tone="blue" />
              ) : (
                <ToneBadge label="Internal only" tone="amber" />
              )}
              {doc.indexed ? <ToneBadge label="Searched by agents" tone="green" /> : <ToneBadge label="Not searched" tone="grey" />}
            </div>
          </div>
          <a
            href={`${API_BASE_URL}/api/documents/file/${doc.file}`}
            className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-[#006A40] dark:text-[#6EE09F] hover:underline mt-1"
            title="Download the original file"
          >
            <Download className="w-3.5 h-3.5" /> {doc.format.toUpperCase()}
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-[#6F7F77] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-[#F4F6F5] dark:bg-[#0F1613] p-4 sm:p-6">
          {error && <p className="text-sm text-[#B42318]">{error}</p>}
          {!preview && !error && (
            <div className="flex items-center gap-2 text-sm text-[#6F7F77]">
              <Loader2 className="w-4 h-4 animate-spin" /> Opening document…
            </div>
          )}

          {preview?.kind === 'sections' && (
            <article className="mx-auto max-w-3xl bg-white dark:bg-[#16201B] rounded-lg shadow-sm border border-[#E4EAE6] dark:border-[#22322A] p-6 sm:p-8">
              <div className="text-[11px] font-semibold text-white bg-[#018752] rounded px-3 py-1.5">{preview.banner}</div>
              <h1 className="font-display font-bold text-xl text-[#018752] dark:text-[#2FB06A] mt-5">{doc.title}</h1>
              <div className="text-xs text-[#6F7F77] mt-1">
                {doc.doc_type} | Owner: {doc.owner} | Updated: {doc.updated}
              </div>
              {preview.sections.map((s) => (
                <section key={s.heading} className="mt-5">
                  <h2 className="font-display font-bold text-[15px] text-[#018752] dark:text-[#2FB06A]">{s.heading}</h2>
                  <div className="mt-1.5 space-y-1.5">
                    {s.lines.map((l, i) => (
                      <p key={i} className="text-[13.5px] leading-relaxed text-[#1D2A24] dark:text-[#DCE6E0]">
                        {l}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </article>
          )}

          {preview?.kind === 'table' && (
            <div className="bg-white dark:bg-[#16201B] rounded-lg shadow-sm border border-[#E4EAE6] dark:border-[#22322A] overflow-hidden">
              <div className="px-4 py-2 text-[11px] font-semibold text-white bg-[#018752]">{preview.banner}</div>
              <div className="px-4 py-2 text-xs text-[#4C5C54] dark:text-[#B3C2BA] border-b border-[#E4EAE6] dark:border-[#22322A]">{preview.note}</div>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {preview.headers.map((h) => (
                        <th key={h} className="text-left font-semibold px-3 py-2 bg-[#E6F3ED] dark:bg-[#163626] text-[#006A40] dark:text-[#6EE09F] whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} className="border-t border-[#EEF2F0] dark:border-[#24342C]">
                        {r.map((c, j) => (
                          <td key={j} className="px-3 py-2 text-[#1D2A24] dark:text-[#DCE6E0] whitespace-nowrap">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview?.kind === 'pdf' && (
            <iframe
              title={doc.title}
              src={`${API_BASE_URL}${preview.url}`}
              className="w-full h-[70vh] rounded-lg border border-[#E4EAE6] dark:border-[#22322A] bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
