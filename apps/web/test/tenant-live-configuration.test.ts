import { afterEach, describe, expect, it } from 'vitest';

import {
  clearAuthSessionV1,
  rememberAuthBootstrapV1,
  rememberAuthSessionV1,
} from '../src/features/auth/auth-session.ts';
import { tenantLiveConfiguration } from '../src/features/session/tenant-live-configuration.ts';

afterEach(clearAuthSessionV1);

describe('tenant live configuration [IAM-009][DDA-002][DDA-006]', () => {
  it('fails closed instead of trusting tenant identity from build-time environment', () => {
    expect(
      tenantLiveConfiguration({
        VITE_DATABREEZE_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000001',
        VITE_DATABREEZE_WORKSPACE_ID: '00000000-0000-4000-8000-000000000002',
        VITE_DATABREEZE_INTAKE_SESSION_ID: '00000000-0000-4000-8000-0000000000f1',
      }),
    ).toBeUndefined();
  });

  it('derives tenant scope from authenticated bootstrap while retaining an optional intake id', () => {
    const session = {
      schemaVersion: 4 as const,
      scopeType: 'TENANT' as const,
      sessionId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      organizationId: '00000000-0000-4000-8000-000000000003',
      workspaceId: '00000000-0000-4000-8000-000000000004',
      accessToken: 'a'.repeat(80),
      accessExpiresAt: '2026-08-13T00:15:00.000Z',
      securityEpoch: 1,
      mfaRequired: false,
      mfaReenrollmentRequired: false,
    };
    const projectId = '00000000-0000-4000-8000-000000000005';
    rememberAuthSessionV1(session);
    expect(
      rememberAuthBootstrapV1({
        user: {
          id: session.userId,
          displayName: 'Mai',
          locale: 'vi-VN',
          mfaState: 'NOT_CONFIGURED',
        },
        organizations: [
          {
            id: session.organizationId,
            name: 'DataBreeze',
            personal: true,
            status: 'ACTIVE',
            workspaces: [
              {
                id: session.workspaceId,
                name: 'Không gian chính',
                status: 'ACTIVE',
                projects: [
                  { id: projectId, name: 'Dữ liệu đầu tiên', kind: 'INTERNAL', status: 'ACTIVE' },
                ],
              },
            ],
          },
        ],
        recentScopes: [],
        session: {
          scopeType: 'project',
          organizationId: session.organizationId,
          workspaceId: session.workspaceId,
          projectId,
          authorizationEpoch: 1,
        },
        platform: { apiVersion: 'v1' },
      }),
    ).toBe(true);

    expect(
      tenantLiveConfiguration({
        VITE_DATABREEZE_INTAKE_SESSION_ID: '00000000-0000-4000-8000-0000000000f1',
      }),
    ).toEqual({
      organizationId: session.organizationId,
      workspaceId: session.workspaceId,
      projectId,
      sessionId: '00000000-0000-4000-8000-0000000000f1',
      tenantScope: {
        scopeType: 'project',
        organizationId: session.organizationId,
        workspaceId: session.workspaceId,
        projectId,
      },
    });

    expect(tenantLiveConfiguration({})).toEqual({
      organizationId: session.organizationId,
      workspaceId: session.workspaceId,
      projectId,
      tenantScope: {
        scopeType: 'project',
        organizationId: session.organizationId,
        workspaceId: session.workspaceId,
        projectId,
      },
    });
  });
});
