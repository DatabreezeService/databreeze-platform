import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DDA_NOTIFICATION_KINDS,
  groupNotificationEvents,
  projectNotification,
  shouldSuppressRoutineRefresh,
} from '../../../src/features/dda/notification/dda-notification-policy.js';

void test('[NCO-001] allows only the committed in-app notification kinds', () => {
  assert.deepEqual([...DDA_NOTIFICATION_KINDS].sort(), [
    'AGENT_BUDGET_DENIED',
    'OCR_REVIEW_REQUIRED',
    'PREPARATION_BLOCKED',
    'REFRESH_BLOCKED',
    'REVIEW_REQUIRED',
    'SECURITY_NOTICE',
    'SOURCE_MISMATCH',
    'SYNC_FAILED',
  ]);
});

void test('[NCO-002] suppresses routine successful refreshes and groups unresolved duplicates', () => {
  assert.equal(
    shouldSuppressRoutineRefresh({
      kind: 'REFRESH_BLOCKED',
      outcome: 'BLOCKED',
    }),
    false,
  );
  assert.equal(
    shouldSuppressRoutineRefresh({
      kind: 'REVIEW_REQUIRED',
      outcome: 'SUCCEEDED',
    }),
    false,
  );
  assert.equal(
    shouldSuppressRoutineRefresh({
      kind: 'REFRESH_SUCCEEDED',
      outcome: 'SUCCEEDED',
    } as never),
    true,
  );

  const grouped = groupNotificationEvents([
    {
      eventId: 'evt-1',
      workspaceId: 'ws-1',
      subjectId: 'sub-1',
      kind: 'SYNC_FAILED',
      unresolved: true,
      createdAt: '2026-08-12T00:00:00.000Z',
    },
    {
      eventId: 'evt-2',
      workspaceId: 'ws-1',
      subjectId: 'sub-1',
      kind: 'SYNC_FAILED',
      unresolved: true,
      createdAt: '2026-08-12T00:01:00.000Z',
    },
    {
      eventId: 'evt-3',
      workspaceId: 'ws-1',
      subjectId: 'sub-1',
      kind: 'SYNC_FAILED',
      unresolved: false,
      createdAt: '2026-08-12T00:02:00.000Z',
    },
  ]);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped[0]?.eventIds, ['evt-1', 'evt-2']);
});

void test('[NCO-003] projects content-safe payloads without source values or paths', () => {
  const projected = projectNotification({
    eventId: 'evt-9',
    workspaceId: 'ws-1',
    subjectId: 'sub-9',
    kind: 'OCR_REVIEW_REQUIRED',
    unresolved: true,
    createdAt: '2026-08-12T00:00:00.000Z',
    correlationId: 'corr-9',
    actionRoute: '/data/reviews/sub-9',
    labelVi: 'Can xem lai OCR',
    labelEn: 'OCR review required',
    forbiddenSourceValue: 'C:\\Secrets\\receipt.png',
  } as never);

  assert.deepEqual(projected, {
    eventId: 'evt-9',
    workspaceId: 'ws-1',
    subjectId: 'sub-9',
    kind: 'OCR_REVIEW_REQUIRED',
    unresolved: true,
    createdAt: '2026-08-12T00:00:00.000Z',
    correlationId: 'corr-9',
    actionRoute: '/data/reviews/sub-9',
    labelVi: 'Can xem lai OCR',
    labelEn: 'OCR review required',
  });
  assert.equal(/C:\\|Secrets|receipt\.png/u.test(JSON.stringify(projected)), false);
});
