import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PlatformAdminProblemError,
  PlatformAdminService,
} from '../../../src/features/platform-admin/application/platform-admin.service.js';
import { PrismaPlatformOperatorAuthorityAdapter } from '../../../src/features/iam/adapter/prisma-platform-operator-authority.adapter.js';

const actorId = '00000000-0000-4000-8000-000000000010';
const organizationId = '00000000-0000-4000-8000-000000000020';

function service(role: 'PLATFORM_OWNER' | 'PLATFORM_SUPPORT' | undefined) {
  return new PlatformAdminService({
    authority: { resolve: async () => (role === undefined ? undefined : { role, revision: 1 }) },
    feedbacks: {
      readRecent: async () => ({
        total: 1,
        items: [
          {
            id: '00000000-0000-4000-8000-000000000030',
            createdAt: '2026-08-14T04:10:00.000Z',
            email: 'le.thi.mai@example.vn',
            name: 'Lê Thị Mai',
            organization: 'Xưởng Dữ liệu Sài Gòn',
            role: 'analyst',
            experience: 'active',
            category: 'data-trust',
            rating: 5,
            message: 'Truy vết bằng chứng tới từng ô dữ liệu giúp tôi tự tin trình bày.',
            contactPermission: true,
          },
        ],
      }),
    },
    identities: {
      read: async () => ({
        totals: { users: 8, activeUsers: 7, organizations: 3, workspaces: 5, activeSessions: 4 },
        registrationSeries: [{ month: '2026-08', count: 2 }],
        recentUsers: [
          {
            userId: actorId,
            email: 'platform-owner@databreeze.local',
            displayName: 'Platform Owner',
            status: 'ACTIVE',
            createdAt: '2026-08-15T00:00:00.000Z',
          },
        ],
        organizationNames: [{ organizationId, name: 'Synthetic Retail' }],
      }),
    },
    billing: {
      read: async () => ({
        totals: {
          subscriptions: 3,
          activeSubscriptions: 2,
          subscriberUsers: 2,
          settledRevenueVnd: 798_000,
          paidOrders: 2,
        },
        subscriptionStatuses: [{ key: 'ACTIVE', count: 2 }],
        subscriptionPlans: [{ key: 'professional-monthly', count: 2 }],
        revenueSeries: [{ month: '2026-08', revenueVnd: 798_000, paidOrders: 2 }],
        recentSubscriptions: [
          {
            subscriptionId: '00000000-0000-4000-8000-000000000021',
            organizationId,
            planId: 'professional-monthly',
            source: 'PAYOS',
            status: 'ACTIVE',
            startsAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-15T00:00:00.000Z',
          },
        ],
        recentPayments: [],
        organizationIds: [organizationId],
      }),
    },
    now: () => new Date('2026-08-16T12:00:00.000Z'),
  });
}

void test('[IAM-026][BUA-024] active platform owner receives authoritative merged aggregates', async () => {
  const result = await service('PLATFORM_OWNER').overview(actorId, 180);
  assert.equal(result.operator.role, 'PLATFORM_OWNER');
  assert.equal(result.totals.users, 8);
  assert.equal(result.totals.activeSubscriptions, 2);
  assert.equal(result.recentSubscriptions[0]?.organizationName, 'Synthetic Retail');
  assert.equal(JSON.stringify(result).includes('sourcePath'), false);
});

void test('[IAM-026] an ordinary tenant admin is denied without running aggregate reads', async () => {
  await assert.rejects(
    service(undefined).overview(actorId, 180),
    (error: unknown) =>
      error instanceof PlatformAdminProblemError && error.code === 'PLATFORM_ADMIN_FORBIDDEN',
  );
});

void test('[IAM-026] suspended assignments fail closed at current-state lookup', async () => {
  const authority = new PrismaPlatformOperatorAuthorityAdapter({
    platformOperatorRecord: {
      findUnique: async () => ({ role: 'PLATFORM_OWNER', status: 'SUSPENDED', revision: 2 }),
    },
  });
  assert.equal(await authority.resolve(actorId), undefined);
});

void test('[IAM-026][WEB-027] feedbacks read stays bounded and omits network identifiers', async () => {
  const result = await service('PLATFORM_OWNER').feedbacks(actorId, 200);
  assert.equal(result.schemaVersion, 4);
  assert.equal(result.total, 1);
  assert.equal(result.feedbacks[0]?.email, 'le.thi.mai@example.vn');
  assert.equal(result.feedbacks[0]?.name, 'Lê Thị Mai');
  assert.equal(JSON.stringify(result).includes('sourceIpHash'), false);
});

void test('[IAM-026][WEB-027] tenant admins are denied before feedback reads run', async () => {
  await assert.rejects(
    service(undefined).feedbacks(actorId, 200),
    (error: unknown) =>
      error instanceof PlatformAdminProblemError && error.code === 'PLATFORM_ADMIN_FORBIDDEN',
  );
});
