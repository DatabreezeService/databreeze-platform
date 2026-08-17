import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiApplication } from '../../../src/bootstrap.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { LandingFeedbackListPortV1 } from '../../../src/features/lfb/application/landing-feedback-intake.port.js';

const actorId = '00000000-0000-4000-8000-000000000010';
const organizationId = '00000000-0000-4000-8000-000000000020';
const workspaceId = '00000000-0000-4000-8000-000000000021';

function context() {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId,
    correlationId: '00000000-0000-4000-8000-000000000030',
    idempotencyKey: 'platform-overview-test',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid test context');
  return result.value;
}

const identities = {
  read: async () => ({
    totals: { users: 4, activeUsers: 4, organizations: 1, workspaces: 1, activeSessions: 1 },
    registrationSeries: [],
    recentUsers: [],
    organizationNames: [{ organizationId, name: 'DataBreeze Local QA' }],
  }),
};

const billing = {
  read: async () => ({
    totals: {
      subscriptions: 1,
      activeSubscriptions: 1,
      subscriberUsers: 1,
      settledRevenueVnd: 399_000,
      paidOrders: 1,
    },
    subscriptionStatuses: [{ key: 'ACTIVE', count: 1 }],
    subscriptionPlans: [{ key: 'professional-monthly', count: 1 }],
    revenueSeries: [],
    recentSubscriptions: [],
    recentPayments: [],
    organizationIds: [organizationId],
  }),
};

void test('[IAM-026][BUA-024] protected overview returns the closed v4 response', async () => {
  const { app } = await createApiApplication({
    requestTenantContext: { resolve: async () => context() },
    platformOperatorAuthority: {
      resolve: async () => ({ role: 'PLATFORM_OWNER' as const, revision: 1 }),
    },
    platformIdentityAnalytics: identities,
    platformBillingAnalytics: billing,
    platformAdminClock: () => new Date('2026-08-16T12:00:00.000Z'),
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/platform-admin/overview?days=180',
    });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body) as {
      readonly schemaVersion?: number;
      readonly totals?: unknown;
    };
    assert.equal(body.schemaVersion, 4);
    assert.ok(body.totals);
    assert.equal(response.body.includes('sourcePath'), false);
  } finally {
    await app.close();
  }
});

void test('[IAM-026] tenant Owner/Admin receives 403 from platform administration', async () => {
  const { app } = await createApiApplication({
    requestTenantContext: { resolve: async () => context() },
    platformOperatorAuthority: { resolve: async () => undefined },
    platformIdentityAnalytics: identities,
    platformBillingAnalytics: billing,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/platform-admin/overview' });
    assert.equal(response.statusCode, 403);
    assert.equal(
      (JSON.parse(response.body) as { readonly code?: string }).code,
      'PLATFORM_ADMIN_FORBIDDEN',
    );
  } finally {
    await app.close();
  }
});

const feedbacks: LandingFeedbackListPortV1 = {
  readRecent: async () => ({
    total: 1,
    items: [
      {
        id: '00000000-0000-4000-8000-000000000040',
        createdAt: '2026-08-14T04:10:00.000Z',
        email: 'le.thi.mai@example.vn',
        name: 'Lê Thị Mai',
        organization: 'Xưởng Dữ liệu Sài Gòn',
        role: 'analyst',
        experience: 'active',
        category: 'data-trust',
        rating: 5,
        message:
          'Truy vết bằng chứng tới từng ô dữ liệu giúp tôi tự tin trình bày với ban giám đốc.',
        contactPermission: true,
      },
    ],
  }),
};

void test('[IAM-026][WEB-027] protected feedbacks read returns the closed bounded response', async () => {
  const { app } = await createApiApplication({
    requestTenantContext: { resolve: async () => context() },
    platformOperatorAuthority: {
      resolve: async () => ({ role: 'PLATFORM_OWNER' as const, revision: 1 }),
    },
    platformIdentityAnalytics: identities,
    platformBillingAnalytics: billing,
    platformFeedbacks: feedbacks,
    platformAdminClock: () => new Date('2026-08-17T12:00:00.000Z'),
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/platform-admin/feedbacks' });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body) as {
      readonly schemaVersion?: number;
      readonly total?: number;
      readonly feedbacks?: readonly { readonly email?: string }[];
    };
    assert.equal(body.schemaVersion, 4);
    assert.equal(body.total, 1);
    assert.equal(body.feedbacks?.[0]?.email, 'le.thi.mai@example.vn');
    assert.equal(response.body.includes('sourceIpHash'), false);
  } finally {
    await app.close();
  }
});

void test('[IAM-026][WEB-027] tenant Owner/Admin receives 403 from the feedbacks read', async () => {
  const { app } = await createApiApplication({
    requestTenantContext: { resolve: async () => context() },
    platformOperatorAuthority: { resolve: async () => undefined },
    platformIdentityAnalytics: identities,
    platformBillingAnalytics: billing,
    platformFeedbacks: feedbacks,
  });
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/platform-admin/feedbacks' });
    assert.equal(response.statusCode, 403);
    assert.equal(
      (JSON.parse(response.body) as { readonly code?: string }).code,
      'PLATFORM_ADMIN_FORBIDDEN',
    );
  } finally {
    await app.close();
  }
});
