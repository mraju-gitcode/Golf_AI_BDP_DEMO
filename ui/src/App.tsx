import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, golfpmApi } from './api/client';
import { CsrReviewView } from './components/CsrReviewView';
import { CustomerJourneyView } from './components/CustomerJourneyView';
import { DashboardView } from './components/DashboardView';
import { Header } from './components/Header';
import { InboxView } from './components/InboxView';
import { KnowledgeView } from './components/KnowledgeView';
import { QualityTestingView } from './components/QualityTestingView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { ToastStack } from './components/Toast';
import type {
  AgentConfig,
  BackendStatus,
  EvaluationRunResponse,
  MetricsResponse,
  NavSection,
  OutboxMessage,
  ProcessedEmail,
  ReviewQueueItem,
  TestCaseItem,
  ToastMessage,
} from './types/golfpm';
import { DEFAULT_CATEGORY_NAMES } from './utils/formatters';
import {
  computeCompletedDemoStages,
  type DemoStageDefinition,
} from './utils/journey';

// Rebuild "already sent" scenarios from the mailbox, so a page refresh reopens results
// instead of re-sending (which the duplicate guard would ignore).
function sentMapFromEmails(emails: ProcessedEmail[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of [...emails].reverse()) {
    const id = e.test_id ?? e.test_case_id;
    if (id) map[id] = e.id;
  }
  return map;
}

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('journey');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('golfpm_theme') === 'dark';
  });

  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [resetting, setResetting] = useState(false);

  // Inbox state
  const [testCases, setTestCases] = useState<TestCaseItem[]>([]);
  const [processedEmails, setProcessedEmails] = useState<ProcessedEmail[]>([]);
  const [sentTestCaseMap, setSentTestCaseMap] = useState<Record<string, string>>({});
  const [selectedEmail, setSelectedEmail] = useState<ProcessedEmail | null>(null);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const selectedTestCaseIdRef = useRef<string | null>(null);
  selectedTestCaseIdRef.current = selectedTestCaseId;
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [sendingScenarioId, setSendingScenarioId] = useState<string | null>(null);
  const [takingOver, setTakingOver] = useState(false);
  const [composing, setComposing] = useState(false);

  // CSR Review state
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [submittingReviewId, setSubmittingReviewId] = useState<string | null>(null);

  // Dashboard state
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Settings state
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfigKey, setSavingConfigKey] = useState<string | null>(null);

  // Quality & Testing state
  const [evaluation, setEvaluation] = useState<EvaluationRunResponse | null>(null);
  const [runningEvalAction, setRunningEvalAction] = useState<
    'test_cases' | 'generate' | 'synthetic' | null
  >(null);
  const [lastGeneratedCount, setLastGeneratedCount] = useState<number | null>(null);

  // Guided Customer Journey state
  const [reviewedCount, setReviewedCount] = useState(0);
  const [settingsVisited, setSettingsVisited] = useState(false);
  const [runningStageId, setRunningStageId] = useState<DemoStageDefinition['id'] | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      window.localStorage.setItem('golfpm_theme', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [darkMode]);

  const pushToast = useCallback((message: string, variant: 'success' | 'error' = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleApiError = useCallback(
    (err: unknown, fallback: string, silent = false) => {
      if (err instanceof ApiError && err.isNetworkError) {
        setBackendStatus('unreachable');
      }
      if (!silent) {
        const message = err instanceof Error ? err.message : fallback;
        pushToast(message, 'error');
      }
    },
    [pushToast],
  );

  const checkHealth = useCallback(async (silent = true) => {
    try {
      const data = await golfpmApi.getHealth();
      setBackendStatus(data.llm ? 'connected_llm' : 'connected_rules');
      if (!silent) {
        pushToast(
          data.llm ? 'Backend connected (AI model active)' : 'Backend connected (Offline rules mode)',
          'success',
        );
      }
      return true;
    } catch (err) {
      setBackendStatus('unreachable');
      if (!silent) {
        handleApiError(err, 'Backend not reachable');
      }
      return false;
    }
  }, [handleApiError, pushToast]);

  const loadReviewQueue = useCallback(
    async (silent = true) => {
      setLoadingReview(true);
      try {
        const items = await golfpmApi.getReviewQueue();
        setReviewQueue(items);
      } catch (err) {
        handleApiError(err, 'Failed to load CSR review queue', silent);
      } finally {
        setLoadingReview(false);
      }
    },
    [handleApiError],
  );

  const loadInboxData = useCallback(
    async (silent = true) => {
      setLoadingInbox(true);
      try {
        const [cases, emails] = await Promise.all([
          golfpmApi.getTestCases(),
          golfpmApi.getEmails(),
        ]);
        setTestCases(cases);
        setProcessedEmails(emails);
        setSentTestCaseMap((prev) => ({ ...sentMapFromEmails(emails), ...prev }));
      } catch (err) {
        handleApiError(err, 'Failed to load GolfPM inbox', silent);
      } finally {
        setLoadingInbox(false);
      }
    },
    [handleApiError],
  );

  const loadMetrics = useCallback(
    async (silent = false) => {
      setLoadingMetrics(true);
      try {
        const data = await golfpmApi.getMetrics();
        setMetrics(data);
      } catch (err) {
        handleApiError(err, 'Failed to load dashboard metrics', silent);
      } finally {
        setLoadingMetrics(false);
      }
    },
    [handleApiError],
  );

  const loadConfig = useCallback(
    async (silent = true) => {
      setLoadingConfig(true);
      try {
        const data = await golfpmApi.getConfig();
        setConfig(data);
      } catch (err) {
        handleApiError(err, 'Failed to load agent settings', silent);
      } finally {
        setLoadingConfig(false);
      }
    },
    [handleApiError],
  );

  // Initial load
  useEffect(() => {
    void (async () => {
      const ok = await checkHealth(true);
      if (ok) {
        await Promise.all([loadInboxData(true), loadReviewQueue(true), loadConfig(true)]);
      }
    })();
  }, [checkHealth, loadInboxData, loadReviewQueue, loadConfig]);

  // Refresh relevant data when switching tabs
  useEffect(() => {
    if (activeSection === 'settings') {
      setSettingsVisited(true);
    }
    if (backendStatus === 'unreachable') return;
    if (activeSection === 'review') {
      void loadReviewQueue(false);
    } else if (activeSection === 'dashboard') {
      void loadMetrics(false);
    } else if (activeSection === 'settings') {
      void loadConfig(false);
    } else if (activeSection === 'inbox' || activeSection === 'journey') {
      void loadReviewQueue(true);
    }
  }, [activeSection, backendStatus, loadReviewQueue, loadMetrics, loadConfig]);

  const categoryNameMap = useMemo(() => {
    const merged: Record<string, string> = { ...DEFAULT_CATEGORY_NAMES };
    if (config?.categories) {
      for (const [id, entry] of Object.entries(config.categories)) {
        if (entry?.name) merged[id] = entry.name;
      }
    }
    return merged;
  }, [config]);

  const completedStages = useMemo(
    () =>
      computeCompletedDemoStages({
        processedEmails,
        sentTestCaseIds: Object.keys(sentTestCaseMap),
        reviewedCount,
        settingsVisited,
        evaluation,
      }),
    [processedEmails, sentTestCaseMap, reviewedCount, settingsVisited, evaluation],
  );

  const refreshSidebarAndEmails = useCallback(async () => {
    try {
      const [emails, queue] = await Promise.all([
        golfpmApi.getEmails(),
        golfpmApi.getReviewQueue(),
      ]);
      setProcessedEmails(emails);
      setSentTestCaseMap((prev) => ({ ...sentMapFromEmails(emails), ...prev }));
      setReviewQueue(queue);
    } catch {
      // Non-blocking refresh
    }
  }, []);

  const handleSelectTestCase = async (tc: TestCaseItem) => {
    const existingEmailId = sentTestCaseMap[tc.id];
    setSelectedTestCaseId(tc.id);

    if (existingEmailId) {
      try {
        const email = await golfpmApi.getEmail(existingEmailId);
        setSelectedEmail(email);
      } catch (err) {
        handleApiError(err, `Failed to load email ${existingEmailId}`);
      }
      return;
    }

    // Not processed yet: open it as a ticket; the presenter clicks "Run GolfPM agent".
    setSelectedEmail(null);
    setRunError(null);
  };

  const handleRunTestCase = async (tc: TestCaseItem): Promise<ProcessedEmail | null> => {
    setSendingScenarioId(tc.id);
    setRunError(null);
    try {
      const email = await golfpmApi.sendTestCase(tc.id);
      setSentTestCaseMap((prev) => ({ ...prev, [tc.id]: email.id }));
      setProcessedEmails((prev) => [email, ...prev.filter((item) => item.id !== email.id)]);
      setSelectedEmail((prev) => (prev === null && selectedTestCaseIdRef.current === tc.id ? email : prev));
      void refreshSidebarAndEmails();
      return email;
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to run ${tc.id}`;
      setRunError(message);
      handleApiError(err, `Failed to run ${tc.id}`, true);
      return null;
    } finally {
      setSendingScenarioId(null);
    }
  };

  // ---- Customer Journey: runs happen inside the step card ----
  const handleJourneyRun = async (tc: TestCaseItem): Promise<ProcessedEmail | null> => {
    const existing = sentTestCaseMap[tc.id];
    if (existing) {
      try {
        return await golfpmApi.getEmail(existing);
      } catch {
        // fall through and run it
      }
    }
    return handleRunTestCase(tc);
  };

  const handleJourneyApprove = async (msg: OutboxMessage): Promise<boolean> => {
    try {
      const body = msg.kind === 'approval' ? String((msg.meta as Record<string, unknown> | undefined)?.proposed_reply ?? msg.body) : msg.body;
      await golfpmApi.submitReviewDecision(msg.id, { decision: 'approve', body });
      setReviewedCount((prev) => prev + 1);
      void loadReviewQueue(true);
      pushToast('Approved by CSR and sent to the customer', 'success');
      return true;
    } catch (err) {
      handleApiError(err, 'Approval failed');
      return false;
    }
  };

  const handleJourneyOpenEmail = (email: ProcessedEmail) => {
    setSelectedEmail(email);
    setSelectedTestCaseId(email.test_id ?? email.test_case_id ?? null);
    setActiveSection('inbox');
  };

  const handleJourneySetKillSwitch = async (on: boolean): Promise<boolean> => {
    try {
      const updated = await golfpmApi.updateConfig({ kill_switch: on });
      setConfig(updated);
      setSettingsVisited(true);
      return true;
    } catch (err) {
      handleApiError(err, 'Failed to change the kill switch');
      return false;
    }
  };

  const handleJourneySendProbe = async (): Promise<ProcessedEmail | null> => {
    try {
      const stamp = new Date().toLocaleTimeString();
      const email = await golfpmApi.sendEmail({
        from: 'mike.alvarez@pinehollowgc.example.com',
        subject: 'Quick check on SO-TEST-104582',
        body: `Hi team,\n\nIs SO-TEST-104582 still on schedule? (sent ${stamp})\n\nMike`,
      });
      setProcessedEmails((prev) => [email, ...prev.filter((item) => item.id !== email.id)]);
      void refreshSidebarAndEmails();
      return email;
    } catch (err) {
      handleApiError(err, 'Failed to send the test email');
      return null;
    }
  };

  const handleJourneyRunEval = async (): Promise<EvaluationRunResponse | null> => {
    try {
      const res = await golfpmApi.runEvaluation('test_cases.json');
      const withFile = { ...res, file: res.file || 'test_cases.json' };
      setEvaluation(withFile);
      return withFile;
    } catch (err) {
      handleApiError(err, 'Failed to run the GolfPM test set');
      return null;
    }
  };

  const handleResendTestCase = async (tcId: string) => {
    setSendingScenarioId(tcId);
    try {
      const email = await golfpmApi.sendTestCase(tcId);
      setSelectedEmail(email);
      setSentTestCaseMap((prev) => ({ ...prev, [tcId]: email.id }));
      setProcessedEmails((prev) => [email, ...prev.filter((item) => item.id !== email.id)]);
      void refreshSidebarAndEmails();
      pushToast(`Re-sent ${tcId} (${email.id})`, 'success');
    } catch (err) {
      handleApiError(err, `Failed to resend ${tcId}`);
    } finally {
      setSendingScenarioId(null);
    }
  };

  const handleSelectProcessedEmail = async (emailId: string) => {
    const matchingTc = Object.entries(sentTestCaseMap).find(([, id]) => id === emailId)?.[0] ?? null;
    setSelectedTestCaseId(matchingTc);
    try {
      const email = await golfpmApi.getEmail(emailId);
      setSelectedEmail(email);
    } catch (err) {
      handleApiError(err, `Failed to open email ${emailId}`);
    }
  };

  const handleComposeSubmit = async (payload: {
    from: string;
    subject: string;
    body: string;
  }): Promise<boolean> => {
    setComposing(true);
    try {
      const email = await golfpmApi.sendEmail(payload);
      setSelectedTestCaseId(null);
      setSelectedEmail(email);
      setProcessedEmails((prev) => [email, ...prev.filter((item) => item.id !== email.id)]);
      void refreshSidebarAndEmails();
      pushToast(`Email processed (${email.id})`, 'success');
      return true;
    } catch (err) {
      handleApiError(err, 'Failed to send custom email');
      return false;
    } finally {
      setComposing(false);
    }
  };

  const handleTakeoverCase = async (caseId: string) => {
    setTakingOver(true);
    try {
      await golfpmApi.takeoverCase(caseId, 'GolfPM CSR');
      if (selectedEmail?.id) {
        try {
          const refreshed = await golfpmApi.getEmail(selectedEmail.id);
          setSelectedEmail(refreshed);
        } catch {
          // Keep current email view if detail refresh isn't needed
        }
      }
      void refreshSidebarAndEmails();
      pushToast(`Thread ${caseId} taken over by GolfPM CSR`, 'success');
    } catch (err) {
      handleApiError(err, `Failed to take over case ${caseId}`);
    } finally {
      setTakingOver(false);
    }
  };

  const handleReviewDecision = async (
    id: string,
    decision: 'approve' | 'edit' | 'reject',
    body: string,
  ) => {
    setSubmittingReviewId(id);
    try {
      await golfpmApi.submitReviewDecision(id, { decision, body });
      setReviewQueue((prev) => prev.filter((item) => item.id !== id));
      setReviewedCount((prev) => prev + 1);
      const labelMap = {
        approve: 'Approved and sent',
        edit: 'Sent with your edits',
        reject: 'Rejected and removed from queue',
      };
      pushToast(`${labelMap[decision]} (${id})`, 'success');
      void loadReviewQueue(true);
    } catch (err) {
      handleApiError(err, `Failed to submit review decision for ${id}`);
    } finally {
      setSubmittingReviewId(null);
    }
  };

  const handleUpdateConfig = async (
    partial: Record<string, unknown>,
    key: string,
    successMessage: string,
  ) => {
    setSavingConfigKey(key);
    try {
      const updated = await golfpmApi.updateConfig(partial);
      setConfig(updated);
      pushToast(successMessage, 'success');
    } catch (err) {
      handleApiError(err, 'Failed to update agent configuration');
    } finally {
      setSavingConfigKey(null);
    }
  };

  const handleRunTestSet = async () => {
    setRunningEvalAction('test_cases');
    try {
      const res = await golfpmApi.runEvaluation('test_cases.json');
      setEvaluation({ ...res, file: res.file || 'test_cases.json' });
      pushToast(
        `GolfPM test set finished: ${res.summary.passed}/${res.summary.total} passed`,
        'success',
      );
    } catch (err) {
      handleApiError(err, 'Failed to run GolfPM test set');
    } finally {
      setRunningEvalAction(null);
    }
  };

  const handleGenerateSynthetic = async () => {
    setRunningEvalAction('generate');
    try {
      const res = await golfpmApi.generateSynthetic(10);
      const count = res.count ?? res.generated ?? 90;
      setLastGeneratedCount(count);
      pushToast(`Generated ${count} synthetic emails`, 'success');
    } catch (err) {
      handleApiError(err, 'Failed to generate synthetic emails');
    } finally {
      setRunningEvalAction(null);
    }
  };

  const handleRunSyntheticSet = async () => {
    setRunningEvalAction('synthetic');
    try {
      const res = await golfpmApi.runEvaluation('synthetic_cases.json');
      setEvaluation({ ...res, file: res.file || 'synthetic_cases.json' });
      pushToast(
        `Synthetic evaluation finished: ${res.summary.passed}/${res.summary.total} passed`,
        'success',
      );
    } catch (err) {
      handleApiError(err, 'Failed to run synthetic evaluation');
    } finally {
      setRunningEvalAction(null);
    }
  };

  const handleResetDemo = async () => {
    setResetting(true);
    try {
      await golfpmApi.resetDemo();
      setSentTestCaseMap({});
      setSelectedEmail(null);
      setSelectedTestCaseId(null);
      setEvaluation(null);
      setLastGeneratedCount(null);
      setReviewedCount(0);
      setSettingsVisited(false);
      await Promise.all([
        checkHealth(true),
        loadInboxData(true),
        loadReviewQueue(true),
        loadConfig(true),
        activeSection === 'dashboard' ? loadMetrics(true) : Promise.resolve(),
      ]);
      pushToast('Demo state and configuration reset', 'success');
    } catch (err) {
      handleApiError(err, 'Failed to reset demo');
    } finally {
      setResetting(false);
    }
  };

  const handleRetryConnection = async () => {
    const ok = await checkHealth(false);
    if (ok) {
      await Promise.all([loadInboxData(true), loadReviewQueue(true), loadConfig(true)]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F5] dark:bg-[#0F1613] text-[#1D2A24] dark:text-[#EAF1ED] transition-colors">
      <Header
        backendStatus={backendStatus}
        darkMode={darkMode}
        resetting={resetting}
        onToggleTheme={() => setDarkMode((prev) => !prev)}
        onResetDemo={handleResetDemo}
        onRefreshHealth={() => void handleRetryConnection()}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-w-0">
        <Sidebar
          activeSection={activeSection}
          reviewCount={reviewQueue.length}
          onSelect={setActiveSection}
        />

        <main className="flex-1 min-w-0 p-4 sm:p-6 max-w-[1600px] w-full">
          {activeSection === 'journey' && (
            <CustomerJourneyView
              testCases={testCases}
              completedStages={completedStages}
              reviewCount={reviewQueue.length}
              config={config}
              evaluation={evaluation}
              backendReachable={backendStatus !== 'unreachable'}
              onRunScenario={handleJourneyRun}
              onApprove={handleJourneyApprove}
              onOpenEmail={handleJourneyOpenEmail}
              onSetKillSwitch={handleJourneySetKillSwitch}
              onSendProbe={handleJourneySendProbe}
              onRunEvaluation={handleJourneyRunEval}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'inbox' && (
            <InboxView
              testCases={testCases}
              processedEmails={processedEmails}
              sentTestCaseMap={sentTestCaseMap}
              selectedEmail={selectedEmail}
              selectedTestCaseId={selectedTestCaseId}
              categoryNameMap={categoryNameMap}
              loadingList={loadingInbox || backendStatus === 'checking'}
              sendingId={sendingScenarioId}
              takingOver={takingOver}
              composing={composing}
              backendReachable={backendStatus !== 'unreachable'}
              onSelectTestCase={handleSelectTestCase}
              onRunTestCase={(tc) => void handleRunTestCase(tc)}
              runError={runError}
              onResendTestCase={handleResendTestCase}
              onSelectProcessedEmail={handleSelectProcessedEmail}
              onComposeSubmit={handleComposeSubmit}
              onTakeoverCase={handleTakeoverCase}
              onOpenCsrReview={() => setActiveSection('review')}
              onRetryLoad={() => void handleRetryConnection()}
            />
          )}

          {activeSection === 'review' && (
            <CsrReviewView
              items={reviewQueue}
              loading={loadingReview}
              submittingId={submittingReviewId}
              onDecision={handleReviewDecision}
              onRefresh={() => void loadReviewQueue(false)}
            />
          )}

          {activeSection === 'knowledge' && <KnowledgeView onError={handleApiError} />}

          {activeSection === 'dashboard' && (
            <DashboardView
              metrics={metrics}
              loading={loadingMetrics}
              onRefresh={() => void loadMetrics(false)}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              config={config}
              loading={loadingConfig}
              savingKey={savingConfigKey}
              onUpdateConfig={handleUpdateConfig}
              onRefresh={() => void loadConfig(false)}
            />
          )}

          {activeSection === 'testing' && (
            <QualityTestingView
              evaluation={evaluation}
              runningAction={runningEvalAction}
              lastGeneratedCount={lastGeneratedCount}
              onRunTestSet={handleRunTestSet}
              onGenerateSynthetic={handleGenerateSynthetic}
              onRunSyntheticSet={handleRunSyntheticSet}
            />
          )}
        </main>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
