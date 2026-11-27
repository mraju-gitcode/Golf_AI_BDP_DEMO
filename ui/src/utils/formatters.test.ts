import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSenderName,
  formatSlaDuration,
  getActionDisplay,
  getInitials,
  getOutboxKindLabel,
  getOutboxStatusDisplay,
  getTraceDotTone,
  getTraceStepLabel,
  groupTestCases,
  normalizeEvalRow,
  normalizePercent,
  normalizeReviewCheck,
  validateComposeEmail,
} from './formatters';

test('getActionDisplay maps all documented result.action values', () => {
  assert.deepEqual(getActionDisplay('reply'), { label: 'Answered', color: 'green' });
  assert.deepEqual(getActionDisplay('ask'), { label: 'Asked customer', color: 'blue' });
  assert.deepEqual(getActionDisplay('approval'), { label: 'Sent for approval', color: 'amber' });
  assert.deepEqual(getActionDisplay('route'), { label: 'Routed to owner', color: 'blue' });
  assert.deepEqual(getActionDisplay('escalate'), { label: 'Escalated', color: 'red' });
  assert.deepEqual(getActionDisplay('review'), { label: 'CSR review', color: 'amber' });
  assert.deepEqual(getActionDisplay('file'), { label: 'Filed, no reply', color: 'grey' });
  assert.deepEqual(getActionDisplay('ignore'), { label: 'Ignored', color: 'grey' });
  assert.deepEqual(getActionDisplay('human'), {
    label: 'Sent to people (kill switch)',
    color: 'red',
  });
});

test('getTraceStepLabel and getTraceDotTone match trace rules', () => {
  assert.equal(getTraceStepLabel('intake'), 'Intake & protection');
  assert.equal(getTraceStepLabel('followup'), 'Follow-up agent');
  assert.equal(getTraceStepLabel('guardrails'), 'Output checks');
  assert.equal(getTraceStepLabel('deliver'), 'Delivery');
  assert.equal(getTraceStepLabel('human'), 'Person');
  assert.equal(getTraceStepLabel('result'), 'Outcome');

  assert.equal(getTraceDotTone({ step: 'guardrails', title: 'All output checks passed' }), 'amber');
  assert.equal(getTraceDotTone({ step: 'followup', title: 'Matched existing thread' }), 'blue');
  assert.equal(getTraceDotTone({ step: 'human', title: 'CSR took over thread' }), 'blue');
  assert.equal(getTraceDotTone({ step: 'result', title: 'Completed' }), 'deep');
  assert.equal(getTraceDotTone({ step: 'intake', title: 'Attachment NOT opened' }), 'red');
  assert.equal(getTraceDotTone({ step: 'intake', title: 'Suspicious sender domain' }), 'red');
  assert.equal(getTraceDotTone({ step: 'guardrails', title: 'Injected prompt detected' }), 'red');
  assert.equal(getTraceDotTone({ step: 'triage', title: 'Kill switch active' }), 'red');
  assert.equal(getTraceDotTone({ step: 'guardrails', title: 'PII masked before reply' }), 'red');
});

test('extractSenderName and getInitials parse email addresses cleanly', () => {
  assert.equal(extractSenderName('dana.price@fairwayirrigation.example.com'), 'Dana Price');
  assert.equal(getInitials('dana.price@fairwayirrigation.example.com'), 'DP');
  assert.equal(extractSenderName('Mike_Torres+golf@pinevalley.org'), 'Mike Torres Golf');
  assert.equal(getInitials('Mike_Torres@pinevalley.org'), 'MT');
});

test('groupTestCases groups RT- items under Security red-team at the end', () => {
  const groups = groupTestCases([
    {
      id: 'RT-01',
      scenario: 'Prompt injection attempt',
      from: 'attacker@evil.example.com',
      subject: 'Ignore instructions',
      expected: { category: 1 },
    },
    {
      id: 'TC-04',
      scenario: 'Release hold on SO',
      from: 'dana.price@fairway.example.com',
      subject: 'Release hold',
      expected: { category: 4 },
    },
    {
      id: 'TC-01',
      scenario: 'Order status check',
      from: 'alex.chen@pebble.example.com',
      subject: 'Where is order 1002?',
      expected: { category: 1 },
    },
  ]);

  assert.equal(groups.length, 3);
  assert.equal(groups[0].key, 'cat-1');
  assert.equal(groups[1].key, 'cat-4');
  assert.equal(groups[2].label, 'Security red-team');
  assert.equal(groups[2].items[0].id, 'RT-01');
});

test('normalizePercent handles both 0..1 and 0..100 values', () => {
  assert.equal(normalizePercent(0.97), 97);
  assert.equal(normalizePercent(1), 100);
  assert.equal(normalizePercent(0), 0);
  assert.equal(normalizePercent(88.4), 88);
});

test('validateComposeEmail rejects missing fields and invalid email', () => {
  const empty = validateComposeEmail({ from: '', subject: '', body: '' });
  assert.equal(empty.valid, false);
  assert.ok(empty.errors.from);
  assert.ok(empty.errors.subject);
  assert.ok(empty.errors.body);

  const badEmail = validateComposeEmail({
    from: 'not-an-email',
    subject: 'Order update',
    body: 'Hello',
  });
  assert.equal(badEmail.valid, false);
  assert.ok(badEmail.errors.from);

  const ok = validateComposeEmail({
    from: 'super@augusta.example.com',
    subject: 'Rotor replacement',
    body: 'Need tracking number for SO-9910.',
  });
  assert.equal(ok.valid, true);
});

test('outbox, SLA, review check, and eval row helpers work accurately', () => {
  assert.equal(getOutboxKindLabel('teams'), 'Microsoft Teams');
  assert.deepEqual(getOutboxStatusDisplay('pending_review'), {
    label: 'Draft · awaiting CSR',
    color: 'amber',
  });
  assert.equal(formatSlaDuration(45), '45m');
  assert.equal(formatSlaDuration(120), '2h');
  assert.equal(formatSlaDuration(150), '2h 30m');

  assert.deepEqual(normalizeReviewCheck({ name: 'No pricing hallucination', passed: true }), {
    label: 'No pricing hallucination',
    passed: true,
    detail: undefined,
  });
  assert.deepEqual(normalizeReviewCheck('✗ Missing warranty serial'), {
    label: 'Missing warranty serial',
    passed: false,
  });

  const evalRow = normalizeEvalRow({
    id: 'TC-01',
    scenario: 'Order lookup',
    expected: { category: 1, action: 'reply' },
    predicted: { category: 1, action: 'reply' },
    passed: true,
    reason: 'Matched SO-104790',
  });
  assert.equal(evalRow.expectedCategory, '1');
  assert.equal(evalRow.predictedAction, 'reply');
  assert.equal(evalRow.passed, true);
});
