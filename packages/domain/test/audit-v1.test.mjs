import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  appendAuditEventV1,
  createAuditSealV1,
  sanitizeAuditSummaryV1,
  verifyAuditChainV1,
} from '../dist/audit/v1.js';

const id = (tail) => `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const scope = { scopeType: 'organization', organizationId: id('1') };
const digestPort = { digest: (value) => createHash('sha256').update(value).digest('base64url') };

function input(eventId, idempotencyKey, summary = { outcome: 'accepted' }) {
  return {
    eventId: id(eventId),
    action: 'membership.invited',
    tenantScope: scope,
    actor: { actorType: 'USER', actorId: id('2') },
    entityType: 'membership',
    entityId: id('3'),
    entityRevision: 1,
    occurredAt: '2026-01-01T00:00:00.000Z',
    correlationId: id('4'),
    idempotencyKey,
    summary,
  };
}

test('[AUD-003, AUD-005] summary sanitization rejects unknown or unsafe fields', () => {
  assert.deepEqual(sanitizeAuditSummaryV1({ outcome: 'accepted', revision: 2 }), {
    accepted: true,
    value: { outcome: 'accepted', revision: 2 },
  });
  assert.deepEqual(sanitizeAuditSummaryV1({ password: 'do-not-log' }), {
    accepted: false,
    code: 'INVALID_SUMMARY',
  });
  assert.deepEqual(sanitizeAuditSummaryV1({ outcome: 'line\nbreak' }), {
    accepted: false,
    code: 'INVALID_SUMMARY',
  });
});

test('[AUD-001, AUD-004, AUD-006, AUD-007] append is tenant-sequenced, chained, and idempotent', () => {
  const first = appendAuditEventV1({ events: [] }, input('10', 'invite-1'), digestPort);
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.value.event.sequence, 1);
  assert.equal(first.value.event.previousDigest, null);
  const repeated = appendAuditEventV1(first.value.state, input('10', 'invite-1'), digestPort);
  assert.equal(repeated.accepted, true);
  if (!repeated.accepted) return;
  assert.equal(repeated.value.state.events.length, 1);
  const conflicting = appendAuditEventV1(first.value.state, input('11', 'invite-1'), digestPort);
  assert.deepEqual(conflicting, { accepted: false, code: 'IDEMPOTENCY_CONFLICT' });
  const second = appendAuditEventV1(first.value.state, input('11', 'invite-2'), digestPort);
  assert.equal(second.accepted, true);
  if (second.accepted) {
    assert.equal(second.value.event.sequence, 2);
    assert.equal(second.value.event.previousDigest, first.value.event.digest);
    assert.deepEqual(verifyAuditChainV1(second.value.state.events, digestPort), {
      accepted: true,
      value: true,
    });
  }
});

test('[AUD-015, AUD-016] seal contains an independently verifiable scoped root', () => {
  const first = appendAuditEventV1({ events: [] }, input('20', 'invite-20'), digestPort);
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  const second = appendAuditEventV1(first.value.state, input('21', 'invite-21'), digestPort);
  assert.equal(second.accepted, true);
  if (!second.accepted) return;
  const seal = createAuditSealV1(
    second.value.state.events,
    scope,
    '2026-01-01T00:01:00.000Z',
    digestPort,
  );
  assert.equal(seal.accepted, true);
  if (seal.accepted) {
    assert.equal(seal.value.firstSequence, 1);
    assert.equal(seal.value.lastSequence, 2);
    assert.equal(seal.value.eventCount, 2);
  }
  const tampered = [...second.value.state.events];
  tampered[1] = { ...tampered[1], summary: { outcome: 'tampered' } };
  assert.deepEqual(verifyAuditChainV1(tampered, digestPort), {
    accepted: false,
    code: 'CHAIN_INVALID',
  });
});
