import { useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  EyeOff,
  Mail,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
} from 'lucide-react';
import type {
  AgentConfig,
  EvaluationRunResponse,
  NavSection,
  TestCaseItem,
} from '../types/golfpm';
import {
  DEMO_STAGES,
  type DemoStageDefinition,
  pickScenarioForStage,
} from '../utils/journey';
import { JourneyStagePanel, type JourneyActions } from './JourneyStagePanel';
import { ToneBadge } from './ToneBadge';

interface CustomerJourneyViewProps extends JourneyActions {
  testCases: TestCaseItem[];
  completedStages: Record<DemoStageDefinition['id'], boolean>;
  reviewCount: number;
  config: AgentConfig | null;
  evaluation: EvaluationRunResponse | null;
  backendReachable: boolean;
  onNavigate: (section: NavSection) => void;
}

const PERSONAS = [
  {
    title: 'Customer (Golf Course / Distributor)',
    surface: 'Outlook, unchanged',
    description:
      'Sends a normal email to the GolfPM mailbox and receives a verified answer or follow-up right inside the same thread.',
    icon: Mail,
    accent: 'text-[#018752] dark:text-[#2FB06A] bg-[#E6F3ED] dark:bg-[#173326]',
  },
  {
    title: 'CSR (GolfPM Support Team)',
    surface: 'Outlook Drafts & Microsoft Teams',
    description:
      'Reviews AI-drafted replies with output checks, approves or edits warranty determinations, and can take over any thread in one click.',
    icon: ClipboardCheck,
    accent: 'text-[#0072BC] dark:text-[#5FB2EC] bg-[#E6F1FA] dark:bg-[#142B3E]',
  },
  {
    title: 'Admin / GolfPM Owner',
    surface: 'Power BI & Admin Console',
    description:
      'Monitors volume, SLA adherence, and 95% accuracy benchmarks; controls draft vs. auto-send per category and the instant kill switch.',
    icon: UserCog,
    accent: 'text-[#946200] dark:text-[#F8C84A] bg-[#FEF6E0] dark:bg-[#33270B]',
  },
];

export function CustomerJourneyView({
  testCases,
  completedStages,
  reviewCount,
  config,
  evaluation,
  backendReachable,
  onNavigate,
  ...actions
}: CustomerJourneyViewProps) {
  const [showPresenterNotes, setShowPresenterNotes] = useState(true);
  const [openStages, setOpenStages] = useState<Partial<Record<DemoStageDefinition['id'], boolean>>>({});
  const toggleStage = (id: DemoStageDefinition['id'], open: boolean) =>
    setOpenStages((prev) => ({ ...prev, [id]: open }));

  const completedCount = DEMO_STAGES.filter((s) => completedStages[s.id]).length;
  const progressPct = Math.round((completedCount / DEMO_STAGES.length) * 100);

  const draftCatCount = config?.categories
    ? Object.values(config.categories).filter((c) => c.mode !== 'send').length
    : null;
  const sendCatCount = config?.categories
    ? Object.values(config.categories).filter((c) => c.mode === 'send').length
    : null;

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-display font-bold text-xl text-[#1D2A24] dark:text-[#EAF1ED]">
            Customer Journey & Guided Demo
          </h1>
          <p className="text-sm text-[#6F7F77] dark:text-[#96A89E] mt-1 leading-relaxed">
            Step through the end-to-end Rain Bird GolfPM workflow in six live moments—from customer
            email in Outlook to CSR review, red-team defense, kill switch, and go-live accuracy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowPresenterNotes((prev) => !prev)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#16201B] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24] text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED] transition-colors whitespace-nowrap cursor-pointer"
          >
            {showPresenterNotes ? (
              <EyeOff className="w-3.5 h-3.5 text-[#6F7F77]" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-[#018752] dark:text-[#2FB06A]" />
            )}
            <span>{showPresenterNotes ? 'Hide client Q&A cues' : 'Show client Q&A cues'}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('inbox')}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#018752] hover:bg-[#006A40] text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>Open GolfPM Inbox</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Three Personas Strip */}
      <section aria-label="Who GolfPM Assist serves" className="rb-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-[#EEF2F0] dark:border-[#24342C]">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#018752] dark:text-[#2FB06A]" />
            <h2 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED]">
              How GolfPM Assist fits Rain Bird in production
            </h2>
          </div>
          <span className="text-xs text-[#6F7F77] dark:text-[#8DA196]">
            Zero new portals for customers · Full CSR & admin governance
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PERSONAS.map((persona) => {
            const Icon = persona.icon;
            return (
              <div
                key={persona.title}
                className="rounded-lg bg-[#F7FAF8] dark:bg-[#101814] border border-[#E4EAE6] dark:border-[#24342C] p-4 space-y-2"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${persona.accent}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display font-bold text-[13.5px] text-[#1D2A24] dark:text-[#EAF1ED] leading-tight">
                      {persona.title}
                    </div>
                    <div className="text-[11px] font-semibold text-[#6F7F77] dark:text-[#8DA196]">
                      Lives in: {persona.surface}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-[#4C5C54] dark:text-[#B3C2BA] leading-relaxed">
                  {persona.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Demo Progress Strip */}
      <section aria-label="Demo walkthrough progress" className="rb-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED]">
              6-step live walkthrough
            </h2>
            <p className="text-xs text-[#6F7F77] dark:text-[#96A89E] mt-0.5">
              Open any step to see the real customer email, run the GolfPM agent on it, and watch
              each stage happen right here in the card.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-display font-bold text-xs text-[#006A40] dark:text-[#6EE09F] tabular-nums">
              {completedCount} of {DEMO_STAGES.length} demonstrated
            </span>
            <div className="w-28 h-2 rounded-full bg-[#E6ECE8] dark:bg-[#23322A] overflow-hidden">
              <div
                className="h-full bg-[#018752] dark:bg-[#2FB06A] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* 6 Stage Cards */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {DEMO_STAGES.map((stage) => {
            const matchedScenario = pickScenarioForStage(stage.id, testCases);
            const isCompleted = completedStages[stage.id];
            const isOpen = Boolean(openStages[stage.id]);
            const needsScenario =
              stage.id === 'instant_reply' ||
              stage.id === 'smart_routing' ||
              stage.id === 'human_review' ||
              stage.id === 'security_redteam';

            const disableRun = needsScenario && (!backendReachable || !matchedScenario);

            return (
              <article
                key={stage.id}
                className={`rounded-[10px] border p-4 flex flex-col justify-between gap-3.5 transition-colors ${isOpen ? 'xl:col-span-2' : ''} ${
                  isCompleted
                    ? 'bg-[#F6FBF8] dark:bg-[#13221B] border-[#BFE0D0] dark:border-[#245039]'
                    : 'bg-white dark:bg-[#131C18] border-[#DDE4E0] dark:border-[#24342C]'
                }`}
              >
                <div className="space-y-2.5">
                  {/* Top meta line */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        aria-hidden="true"
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-display font-bold text-xs shrink-0 mt-0.5 tabular-nums ${
                          isCompleted
                            ? 'bg-[#018752] dark:bg-[#2FB06A] text-white dark:text-[#0F1613]'
                            : 'bg-[#E6F3ED] dark:bg-[#1D2D25] text-[#006A40] dark:text-[#6EE09F]'
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : stage.number}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-[#6F7F77] dark:text-[#8DA196]">
                          {stage.personaFlow}
                        </div>
                        <h3 className="font-display font-bold text-[15px] text-[#1D2A24] dark:text-[#EAF1ED] leading-snug mt-0.5">
                          {stage.title}
                        </h3>
                      </div>
                    </div>

                    <ToneBadge
                      label={isCompleted ? 'Shown' : `Step ${stage.number}`}
                      tone={isCompleted ? 'green' : 'grey'}
                    />
                  </div>

                  <p className="text-[13px] text-[#34453D] dark:text-[#C5D3CB] leading-relaxed">
                    {stage.summary}
                  </p>

                  {/* Live context strip */}
                  <div className="text-xs font-mono text-[#4C5C54] dark:text-[#9DB0A6] bg-[#F4F6F5] dark:bg-[#0F1613] border border-[#E4EAE6] dark:border-[#22322A] rounded-md px-3 py-2">
                    {needsScenario ? (
                      matchedScenario ? (
                        <span className="block truncate" title={matchedScenario.subject}>
                          Scenario {matchedScenario.id}: {matchedScenario.subject}
                        </span>
                      ) : (
                        <span>
                          {backendReachable
                            ? 'No matching test scenario found in /api/test-cases'
                            : 'Start the GolfPM backend to run this scenario live'}
                        </span>
                      )
                    ) : stage.id === 'kill_switch' ? (
                      <span>
                        Kill switch: {config?.kill_switch ? 'PAUSED' : 'ACTIVE'}
                        {draftCatCount !== null && sendCatCount !== null
                          ? ` · ${draftCatCount} Draft / ${sendCatCount} Auto-send categories`
                          : ''}
                      </span>
                    ) : (
                      <span>
                        {evaluation
                          ? `Latest run: ${evaluation.summary.passed}/${evaluation.summary.total} passed · Safety ${evaluation.summary.safety_cases_passed}`
                          : 'Ready to run GolfPM benchmark against 95% go-live routing target'}
                      </span>
                    )}
                  </div>

                  {/* Presenter Q&A cue (optional toggle) */}
                  {showPresenterNotes && (
                    <div className="rounded-md bg-[#FAFBFB] dark:bg-[#101814] border-l-[3px] border-l-[#0072BC] border border-[#E4EAE6] dark:border-[#22322A] px-3 py-2 text-xs space-y-1">
                      <div className="font-semibold text-[#1D2A24] dark:text-[#EAF1ED]">
                        Client asks: {stage.clientQuestion}
                      </div>
                      <div className="text-[#4C5C54] dark:text-[#A9BBB1] leading-relaxed">
                        {stage.presenterTip}
                      </div>
                    </div>
                  )}
                </div>

                {isOpen && (
                  <JourneyStagePanel
                    stage={stage}
                    scenario={matchedScenario}
                    config={config}
                    backendReachable={backendReachable}
                    actions={actions}
                    onClose={() => toggleStage(stage.id, false)}
                  />
                )}

                {/* Action Footer */}
                {!isOpen && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={disableRun}
                      onClick={() => toggleStage(stage.id, true)}
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#018752] hover:bg-[#006A40] text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      {stage.id === 'kill_switch' ? (
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      ) : stage.id === 'security_redteam' ? (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      <span>{stage.ctaLabel}</span>
                    </button>

                    {stage.id === 'human_review' && (
                      <button
                        type="button"
                        onClick={() => onNavigate('review')}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#DDE4E0] dark:border-[#2B3D34] bg-white dark:bg-[#16201B] hover:bg-[#F4F6F5] dark:hover:bg-[#1D2A24] text-xs font-semibold text-[#1D2A24] dark:text-[#EAF1ED] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <span>Open CSR Review ({reviewCount})</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
