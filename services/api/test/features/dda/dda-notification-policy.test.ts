import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DDA_NOTIFICATION_KINDS,
  groupNotificationEvents,
  projectNotification,
  shouldSuppressRoutineRefresh,
} from '../../../src/features/dda/notification/dda-notification-policy.js';
import { projectCommittedNotifications } from '../../../src/features/dda/notification/dda-notification-projector.js';

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
  assert.equal(grouped[0]?.occurrenceCount, 2);
  assert.equal(grouped[0]?.latestCreatedAt, '2026-08-12T00:01:00.000Z');
});

void test('[NCO-002][NCO-014] repeated committed event IDs remain one occurrence', () => {
  const grouped = groupNotificationEvents([
    {
      eventId: 'evt-replayed',
      workspaceId: 'ws-1',
      subjectId: 'sub-1',
      kind: 'REVIEW_REQUIRED',
      unresolved: true,
      createdAt: '2026-08-12T00:00:00.000Z',
    },
    {
      eventId: 'evt-replayed',
      workspaceId: 'ws-1',
      subjectId: 'sub-1',
      kind: 'REVIEW_REQUIRED',
      unresolved: true,
      createdAt: '2026-08-12T00:00:00.000Z',
    },
  ]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]?.occurrenceCount, 1);
  assert.deepEqual(grouped[0]?.eventIds, ['evt-replayed']);
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
    labelVi: 'C:\\Secrets\\receipt.png',
    labelEn: 'OpenAI token: secret',
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
    labelVi: 'Cần xem lại kết quả OCR',
    labelEn: 'OCR review required',
    occurrenceCount: 1,
    firstOccurredAt: '2026-08-12T00:00:00.000Z',
    lastOccurredAt: '2026-08-12T00:00:00.000Z',
  });
  assert.equal(/C:\\|Secrets|receipt\.png|OpenAI|token/u.test(JSON.stringify(projected)), false);
});

void test('[NCO-001][NCO-014] projector ignores uncommitted and routine refresh events', () => {
  const projected = projectCommittedNotifications([
    {
      eventId: 'evt-committed',
      workspaceId: 'ws-1',
      subjectId: 'sub-1',
      kind: 'SYNC_FAILED',
      unresolved: true,
      createdAt: '2026-08-12T00:00:00.000Z',
      committed: true,
    },
    {
      eventId: 'evt-uncommitted',
      workspaceId: 'ws-1',
      subjectId: 'sub-2',
      kind: 'SECURITY_NOTICE',
      unresolved: true,
      createdAt: '2026-08-12T00:01:00.000Z',
      committed: false,
    },
    {
      eventId: 'evt-refresh-success',
      workspaceId: 'ws-1',
      subjectId: 'sub-3',
      kind: 'REFRESH_SUCCEEDED',
      unresolved: false,
      createdAt: '2026-08-12T00:02:00.000Z',
      committed: true,
    },
  ]);

  assert.equal(projected.length, 1);
  assert.equal(projected[0]?.eventId, 'evt-committed');
  assert.equal(projected[0]?.occurrenceCount, 1);
});
