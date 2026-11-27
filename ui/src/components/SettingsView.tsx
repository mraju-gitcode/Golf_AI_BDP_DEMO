import { useEffect, useState } from 'react';
import { Power, RefreshCw, ShieldAlert } from 'lucide-react';
import type { AgentConfig } from '../types/golfpm';
import {
  DEFAULT_CATEGORY_NAMES,
  formatSlaDuration,
  getPatternDisplay,
  normalizePercent,
} from '../utils/formatters';
import { ToneBadge } from './ToneBadge';

interface SettingsViewProps {
  config: AgentConfig | null;
  loading: boolean;
  savingKey: string | null;
  onUpdateConfig: (partial: Record<string, unknown>, key: string, successMessage: string) => Promise<void>;
  onRefresh: () => void;
}

export function SettingsView({
  config,
  loading,
  savingKey,
  onUpdateConfig,
  onRefresh,
}: SettingsViewProps) {
  const isFloatThreshold = (config?.confidence_threshold ?? 0.75) <= 1;
  const currentThresholdPct = normalizePercent(config?.confidence_threshold ?? 0.75);
  const [sliderPct, setSliderPct] = useState<number>(Math.max(30, Math.min(95, currentThresholdPct)));

  useEffect(() => {
    if (config) {
      const pct = normalizePercent(config.confidence_threshold);
      setSliderPct(Math.max(30, Math.min(95, pct)));
    }
  }, [config]);

  if (loading && !config) {
    return (
      <div className="space-y-4">
        <div className="rb-card h-24 animate-pulse" />
        <div className="rb-card h-80 animate-pulse" />
        <div className="rb-card h-56 animate-pulse" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rb-card p-10 text-center">
        <h2 className="font-display font-bold text-base text-[#1D2A24] dark:text-[#EAF1ED]">
          Configuration unavailable
        </h2>
        <p className="text-sm text-[#6F7F77] dark:text-[#96A89E] mt-1">
          Start the GolfPM backend (<code className="font-mono">uvicorn golfpm.api:app --port 8000</code>){' '}
          to view and modify live agent settings.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#018752] hover:bg-[#006A40] text-white text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const categoryEntries = Array.from({ length: 9 }, (_, i) => {
    const id = String(i + 1);
    const cat = config.categories?.[id];
    return {
      id,
      name: cat?.name || DEFAULT_CATEGORY_NAMES[id] || `Category ${id}`,
      pattern: cat?.pattern || (i < 2 ? 'agent' : i === 2 ? 'approval' : 'route'),
      mode: cat?.mode || 'draft',
      owner: cat?.owner || '-',
      sla_minutes: cat?.sla_minutes ?? 60,
    };
  });

  const killSwitchOn = Boolean(config.kill_switch);

  const commitConfidence = (pct: number) => {
    const payloadValue = isFloatThreshold ? Number((pct / 100).toFixed(2)) : pct;
    onUpdateConfig(
      { confidence_threshold: payloadValue },
      'confidence_threshold',
      `Confidence threshold set to ${pct}%`,
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-[#1D2A24] dark:text-[#EAF1ED]">
            Agent Settings
          </h1>
          <p className="text-sm text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
            Control the global kill switch, per-category draft vs. auto-send posture, and reply
            policy.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#16201B] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24] text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED] transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Reload config</span>
        </button>
      </div>

      {/* Kill-Switch Panel */}
      <section
        aria-label="Global kill switch"
        className={`rounded-[10px] border p-5 transition-colors flex flex-wrap items-center justify-between gap-4 ${
          killSwitchOn
            ? 'bg-[#FDECEC] dark:bg-[#331616] border-[#F7C5C2] dark:border-[#6B2626]'
            : 'bg-white dark:bg-[#16201B] border-[#DDE4E0] dark:border-[#24342C]'
        }`}
      >
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              killSwitchOn
                ? 'bg-[#D92D20] text-white'
                : 'bg-[#E6F3ED] dark:bg-[#173326] text-[#018752] dark:text-[#2FB06A]'
            }`}
          >
            {killSwitchOn ? <ShieldAlert className="w-5 h-5" /> : <Power className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display font-bold text-base text-[#1D2A24] dark:text-[#EAF1ED]">
                Emergency kill switch
              </h2>
              <ToneBadge
                label={killSwitchOn ? 'Agent paused' : 'Agent active'}
                tone={killSwitchOn ? 'red' : 'green'}
              />
            </div>
            <p className="text-sm text-[#4C5C54] dark:text-[#B3C2BA] mt-1 leading-relaxed">
              {killSwitchOn
                ? 'All incoming GolfPM emails bypass automation and are routed directly to human CSRs.'
                : 'When switched on, GolfPM Assist immediately stops sending or drafting and forwards every new email straight to people.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={killSwitchOn}
          aria-label="Toggle emergency kill switch"
          disabled={savingKey === 'kill_switch'}
          onClick={() =>
            onUpdateConfig(
              { kill_switch: !killSwitchOn },
              'kill_switch',
              !killSwitchOn
                ? 'Kill switch enabled: agent paused'
                : 'Kill switch disabled: agent resumed',
            )
          }
          className={`relative inline-flex h-10 w-[72px] shrink-0 items-center rounded-full p-1 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#018752] disabled:opacity-60 ${
            killSwitchOn ? 'bg-[#D92D20]' : 'bg-[#CBD5D0] dark:bg-[#2F4138]'
          }`}
        >
          <span
            className={`inline-block h-8 w-8 rounded-full bg-white shadow-sm transform transition-transform ${
              killSwitchOn ? 'translate-x-8' : 'translate-x-0'
            }`}
          />
        </button>
      </section>

      {/* 9-Category Routing & Delivery Table */}
      <section className="rb-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#DDE4E0] dark:border-[#24342C]">
          <h2 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED]">
            Category handling & delivery mode
          </h2>
          <p className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
            Switch each category between CSR draft review and direct automated sending.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-[#F7FAF8] dark:bg-[#121A16] border-b border-[#DDE4E0] dark:border-[#24342C] text-[11px] font-display font-bold uppercase tracking-wider text-[#6F7F77] dark:text-[#8DA196]">
                <th className="py-3 pl-5 pr-3">Category</th>
                <th className="py-3 px-3">Handling</th>
                <th className="py-3 px-3">Delivery mode</th>
                <th className="py-3 px-3">Owner</th>
                <th className="py-3 pl-3 pr-5 text-right">SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F0] dark:divide-[#202E27] text-sm">
              {categoryEntries.map((cat) => {
                const patternDisp = getPatternDisplay(cat.pattern);
                const isSend = cat.mode.toLowerCase() === 'send';
                const rowSaving = savingKey === `cat-${cat.id}`;

                return (
                  <tr
                    key={cat.id}
                    className="hover:bg-[#FAFBFB] dark:hover:bg-[#1A251F] transition-colors"
                  >
                    <td className="py-3 pl-5 pr-3 font-semibold text-[#1D2A24] dark:text-[#EAF1ED]">
                      <span className="font-mono text-xs text-[#6F7F77] dark:text-[#8DA196] mr-2">
                        {cat.id}
                      </span>
                      <span>{cat.name}</span>
                    </td>
                    <td className="py-3 px-3">
                      <ToneBadge label={patternDisp.label} tone={patternDisp.color} />
                    </td>
                    <td className="py-3 px-3">
                      <div
                        role="group"
                        aria-label={`Delivery mode for ${cat.name}`}
                        className="inline-flex p-0.5 rounded-lg bg-[#E9EFEC] dark:bg-[#0F1613] border border-[#DDE4E0] dark:border-[#24342C]"
                      >
                        <button
                          type="button"
                          disabled={rowSaving}
                          aria-pressed={!isSend}
                          onClick={() => {
                            if (!isSend) return;
                            onUpdateConfig(
                              { categories: { [cat.id]: { mode: 'draft' } } },
                              `cat-${cat.id}`,
                              `${cat.name}: set to Draft for CSR`,
                            );
                          }}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            !isSend
                              ? 'bg-white dark:bg-[#1E2B24] text-[#006A40] dark:text-[#6EE09F] shadow-xs'
                              : 'text-[#4C5C54] dark:text-[#96A89E] hover:text-[#1D2A24] dark:hover:text-[#EAF1ED]'
                          }`}
                        >
                          Draft for CSR
                        </button>
                        <button
                          type="button"
                          disabled={rowSaving}
                          aria-pressed={isSend}
                          onClick={() => {
                            if (isSend) return;
                            onUpdateConfig(
                              { categories: { [cat.id]: { mode: 'send' } } },
                              `cat-${cat.id}`,
                              `${cat.name}: set to Send directly`,
                            );
                          }}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            isSend
                              ? 'bg-[#018752] text-white shadow-xs'
                              : 'text-[#4C5C54] dark:text-[#96A89E] hover:text-[#1D2A24] dark:hover:text-[#EAF1ED]'
                          }`}
                        >
                          Send directly
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs text-[#4C5C54] dark:text-[#B3C2BA]">
                      {cat.owner}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right font-mono text-xs text-[#1D2A24] dark:text-[#DCE6E0] tabular-nums">
                      {formatSlaDuration(cat.sla_minutes)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reply Policy Card */}
      <section className="rb-card p-5 space-y-5">
        <div className="pb-3 border-b border-[#EEF2F0] dark:border-[#24342C]">
          <h2 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED]">
            Reply policy
          </h2>
          <p className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
            Disclosure text, recipient rules, confidence gating, and multi-turn technical support
            limits.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Disclosure Toggle + Text */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#1D2A24] dark:text-[#EAF1ED]">
                  AI disclosure notice
                </div>
                <p className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
                  Append Rain Bird AI assistance footer to customer-facing replies.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(config.ai_disclosure?.enabled)}
                aria-label="Toggle AI disclosure notice"
                disabled={savingKey === 'ai_disclosure'}
                onClick={() =>
                  onUpdateConfig(
                    { ai_disclosure: { enabled: !config.ai_disclosure?.enabled } },
                    'ai_disclosure',
                    !config.ai_disclosure?.enabled
                      ? 'AI disclosure enabled'
                      : 'AI disclosure disabled',
                  )
                }
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                  config.ai_disclosure?.enabled
                    ? 'bg-[#018752] dark:bg-[#2FB06A]'
                    : 'bg-[#CBD5D0] dark:bg-[#2F4138]'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transform transition-transform ${
                    config.ai_disclosure?.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-[#F4F6F5] dark:bg-[#0F1613] border border-[#DDE4E0] dark:border-[#24342C] text-xs font-mono text-[#34453D] dark:text-[#C5D3CB] leading-relaxed">
              {config.ai_disclosure?.text || 'No disclosure text configured.'}
            </div>
          </div>

          {/* Right column: CC toggle, Confidence slider, Tech support max rounds */}
          <div className="space-y-5">
            {/* Reply to CC */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#1D2A24] dark:text-[#EAF1ED]">
                  Include people copied on the email
                </div>
                <p className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
                  Preserve CC recipients when replying to customer threads.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(config.reply_to_cc)}
                aria-label="Include people copied on the email"
                disabled={savingKey === 'reply_to_cc'}
                onClick={() =>
                  onUpdateConfig(
                    { reply_to_cc: !config.reply_to_cc },
                    'reply_to_cc',
                    !config.reply_to_cc
                      ? 'CC recipients will be included'
                      : 'Replies limited to primary sender',
                  )
                }
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                  config.reply_to_cc
                    ? 'bg-[#018752] dark:bg-[#2FB06A]'
                    : 'bg-[#CBD5D0] dark:bg-[#2F4138]'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transform transition-transform ${
                    config.reply_to_cc ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Confidence Threshold Slider (30-95%) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="confidence-threshold-slider"
                  className="text-sm font-semibold text-[#1D2A24] dark:text-[#EAF1ED]"
                >
                  Confidence threshold
                </label>
                <span className="font-display font-bold text-sm text-[#018752] dark:text-[#2FB06A] tabular-nums">
                  {sliderPct}%
                </span>
              </div>
              <input
                id="confidence-threshold-slider"
                type="range"
                min={30}
                max={95}
                step={1}
                value={sliderPct}
                onChange={(e) => setSliderPct(Number(e.target.value))}
                onMouseUp={(e) => commitConfidence(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => commitConfidence(Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => commitConfidence(Number((e.target as HTMLInputElement).value))}
                className="rb-slider w-full"
              />
              <div className="flex items-center justify-between text-[11px] font-mono text-[#6F7F77] dark:text-[#8DA196]">
                <span>30%</span>
                <span>Below threshold routes to CSR review</span>
                <span>95%</span>
              </div>
            </div>

            {/* Tech-support max rounds */}
            <div className="flex items-center justify-between gap-4 pt-1 border-t border-[#EEF2F0] dark:border-[#24342C]">
              <div>
                <div className="text-sm font-semibold text-[#1D2A24] dark:text-[#EAF1ED]">
                  Tech-support round limit
                </div>
                <p className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
                  Max automated diagnostic follow-up rounds before escalating to a specialist.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  aria-label="Decrease tech-support round limit"
                  disabled={
                    savingKey === 'tech_support_max_rounds' ||
                    (config.tech_support_max_rounds ?? 1) <= 1
                  }
                  onClick={() =>
                    onUpdateConfig(
                      { tech_support_max_rounds: Math.max(1, (config.tech_support_max_rounds ?? 2) - 1) },
                      'tech_support_max_rounds',
                      `Tech-support round limit set to ${Math.max(1, (config.tech_support_max_rounds ?? 2) - 1)}`,
                    )
                  }
                  className="w-8 h-8 rounded-md border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#1D2A24] hover:bg-[#F4F6F5] dark:hover:bg-[#24342C] text-sm font-bold cursor-pointer disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-10 text-center font-display font-bold text-base text-[#1D2A24] dark:text-[#EAF1ED] tabular-nums">
                  {config.tech_support_max_rounds ?? 2}
                </span>
                <button
                  type="button"
                  aria-label="Increase tech-support round limit"
                  disabled={
                    savingKey === 'tech_support_max_rounds' ||
                    (config.tech_support_max_rounds ?? 2) >= 10
                  }
                  onClick={() =>
                    onUpdateConfig(
                      { tech_support_max_rounds: Math.min(10, (config.tech_support_max_rounds ?? 2) + 1) },
                      'tech_support_max_rounds',
                      `Tech-support round limit set to ${Math.min(10, (config.tech_support_max_rounds ?? 2) + 1)}`,
                    )
                  }
                  className="w-8 h-8 rounded-md border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#1D2A24] hover:bg-[#F4F6F5] dark:hover:bg-[#24342C] text-sm font-bold cursor-pointer disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
