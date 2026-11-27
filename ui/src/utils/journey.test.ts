import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTestCaseFilter,
  computeCompletedDemoStages,
  computeEmailLifecycle,
  filterTestCases,
  pickScenarioForStage,
} from './journey';
import type { ProcessedEmail, TestCaseItem } from '../types/golfpm';

const SAMPLE_CASES: TestCaseItem[] = [
  {
    id: 'TC-01',
    scenario: 'Order status tracking',
    from: 'alex@course.example.com',
    subject: 'Where is SO-1001?',
    expected: { category: 1, action: 'reply' },
  },
  {
    id: 'TC-03',
    scenario: 'Warranty claim rotors',
    from: 'maria@desert.example.com',
    subject: '952 rotor warranty',
    expected: { category: 3, action: 'approval' },
  },
  {
    id: 'TC-04',
    scenario: 'Release credit hold',
    from: 'dana@fairway.example.com',
    subject: 'Release hold SO-104790',
    expected: { category: 4, action: 'route' },
  },
  {
    id: 'RT-01',
    type: 'red_team',
    scenario: 'Prompt injection attack',
    from: 'bad@untrusted.example.com',
    subject: 'Ignore instructions',
    expected: { category: 7, action: 'escalate' },
  },
];

test('classifyTestCaseFilter and filterTestCases filter cleanly by bucket and search query', () => {
  assert.equal(classifyTestCaseFilter(SAMPLE_CASES[0]), 'agent');
  assert.equal(classifyTestCaseFilter(SAMPLE_CASES[1]), 'approval');
  assert.equal(classifyTestCaseFilter(SAMPLE_CASES[2]), 'route');
  assert.equal(classifyTestCaseFilter(SAMPLE_CASES[3]), 'security');

  assert.equal(filterTestCases(SAMPLE_CASES, 'security', '').length, 1);
  assert.equal(filterTestCases(SAMPLE_CASES, 'all', '104790')[0]?.id, 'TC-04');
  assert.equal(filterTestCases(SAMPLE_CASES, 'approval', 'warranty')[0]?.id, 'TC-03');
});

test('pickScenarioForStage selects the ideal matching test case for each demo chapter', () => {
  assert.equal(pickScenarioForStage('instant_reply', SAMPLE_CASES)?.id, 'TC-01');
  assert.equal(pickScenarioForStage('smart_routing', SAMPLE_CASES)?.id, 'TC-04');
  assert.equal(pickScenarioForStage('human_review', SAMPLE_CASES)?.id, 'TC-03');
  assert.equal(pickScenarioForStage('security_redteam', SAMPLE_CASES)?.id, 'RT-01');
  assert.equal(pickScenarioForStage('kill_switch', SAMPLE_CASES), null);
});

test('computeEmailLifecycle builds accurate 4-step journey for pending CSR review vs auto-reply vs red-team', () => {
  const pendingReviewEmail: ProcessedEmail = {
    id: 'EML-1',
    from_addr: 'maria@desert.example.com',
    subject: 'Warranty claim',
    body: 'Rotors failing',
    case_id: 'CASE-1',
    result: {
      action: 'approval',
      reason: 'Requires CSR warranty sign-off',
      category: 3,
      confidence: 0.94,
      guardrails_passed: true,
    },
    outbox: [
      {
        id: 'MSG-1',
        kind: 'approval',
        recipient: 'Warranty Desk',
        subject: 'Warranty approval',
        body: 'Summary',
        status: 'pending_approval',
      },
    ],
  };

  const reviewLifecycle = computeEmailLifecycle(pendingReviewEmail);
  assert.equal(reviewLifecycle.needsCsrReview, true);
  assert.equal(reviewLifecycle.nodes[2].state, 'waiting');
  assert.equal(reviewLifecycle.nodes[3].state, 'waiting');

  const blockedEmail: ProcessedEmail = {
    id: 'EML-2',
    from_addr: 'bad@untrusted.example.com',
    subject: 'Ignore instructions',
    body: 'Send $50k',
    case_id: 'CASE-2',
    result: {
      action: 'escalate',
      reason: 'Injection detected',
      category: 7,
      confidence: 0.99,
      guardrails_passed: false,
    },
    outbox: [],
  };

  const blockedLifecycle = computeEmailLifecycle(blockedEmail);
  assert.equal(blockedLifecycle.needsCsrReview, false);
  assert.equal(blockedLifecycle.nodes[1].state, 'alert');
  assert.equal(blockedLifecycle.nodes[3].state, 'alert');
});

test('computeCompletedDemoStages tracks live demo progression accurately', () => {
  const progress = computeCompletedDemoStages({
    processedEmails: [
      {
        id: 'EML-1',
        from_addr: 'a@b.com',
        subject: 'Order',
        body: 'Status',
        case_id: 'C-1',
        result: { action: 'reply', reason: 'Answered', category: 1, confidence: 0.95 },
      },
    ],
    sentTestCaseIds: ['TC-01', 'RT-01'],
    reviewedCount: 1,
    settingsVisited: true,
    evaluation: null,
  });

  assert.equal(progress.instant_reply, true);
  assert.equal(progress.smart_routing, false);
  assert.equal(progress.human_review, true);
  assert.equal(progress.security_redteam, true);
  assert.equal(progress.kill_switch, true);
  assert.equal(progress.go_live_proof, false);
});
