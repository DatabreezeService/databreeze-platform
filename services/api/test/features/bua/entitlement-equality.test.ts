import assert from 'node:assert/strict';
import test from 'node:test';

import type { UsageReservationV1 } from '@databreeze/domain/entitlements/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import { validUsageReservationTransitionV1 } from '../../../src/features/bua/application/entitlement-equality.js';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
}

function timestamp(value: string) {
  const parsed = parseStrictUtcTimestampV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid test timestamp');
  return parsed.value;
}

const active: UsageReservationV1 = Object.freeze({
  reservationId: stable('00000000-0000-4000-8000-000000000001'),
  tenantScope: Object.freeze({
    scopeType: 'organization',
    organizationId: stable('00000000-0000-4000-8000-000000000002'),
  }),
  metric: 'job_count',
  reservedUnits: 1,
  status: 'ACTIVE',
  createdAt: timestamp('2026-01-01T00:00:00.000Z'),
  revision: 1,
});

void test('[BUA-012] reservation transitions share one terminal-state policy', () => {
  assert.equal(
    validUsageReservationTransitionV1(active, { ...active, status: 'FINALIZED', revision: 2 }),
    true,
  );
  assert.equal(
    validUsageReservationTransitionV1(active, { ...active, status: 'RELEASED', revision: 2 }),
    true,
  );
  assert.equal(
    validUsageReservationTransitionV1(active, { ...active, status: 'ACTIVE', revision: 2 }),
    false,
  );
  assert.equal(
    validUsageReservationTransitionV1(
      { ...active, status: 'FINALIZED' },
      { ...active, status: 'RELEASED', revision: 2 },
    ),
    false,
  );
});
