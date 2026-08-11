import { describe, expect, it } from 'vitest';

import { tenantLiveConfiguration } from '../src/features/session/tenant-live-configuration.ts';

describe('tenant live configuration [DDA-002][DDA-006]', () => {
  it('fails closed unless organization, workspace, and intake session are configured', () => {
    expect(tenantLiveConfiguration({})).toBeUndefined();
    expect(
      tenantLiveConfiguration({
        VITE_DATABREEZE_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000001',
        VITE_DATABREEZE_WORKSPACE_ID: '00000000-0000-4000-8000-000000000002',
      }),
    ).toBeUndefined();
    expect(
      tenantLiveConfiguration({
        VITE_DATABREEZE_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000001',
        VITE_DATABREEZE_WORKSPACE_ID: '00000000-0000-4000-8000-000000000002',
        VITE_DATABREEZE_INTAKE_SESSION_ID: '00000000-0000-4000-8000-0000000000f1',
        VITE_DATABREEZE_PROJECT_ID: '00000000-0000-4000-8000-000000000003',
      }),
    ).toEqual({
      organizationId: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
      projectId: '00000000-0000-4000-8000-000000000003',
      sessionId: '00000000-0000-4000-8000-0000000000f1',
      tenantScope: {
        scopeType: 'project',
        organizationId: '00000000-0000-4000-8000-000000000001',
        workspaceId: '00000000-0000-4000-8000-000000000002',
        projectId: '00000000-0000-4000-8000-000000000003',
      },
    });
  });

  it('uses workspace scope when project id is absent', () => {
    expect(
      tenantLiveConfiguration({
        VITE_DATABREEZE_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000001',
        VITE_DATABREEZE_WORKSPACE_ID: '00000000-0000-4000-8000-000000000002',
        VITE_DATABREEZE_INTAKE_SESSION_ID: '00000000-0000-4000-8000-0000000000f1',
      }),
    ).toMatchObject({
      tenantScope: {
        scopeType: 'workspace',
        organizationId: '00000000-0000-4000-8000-000000000001',
        workspaceId: '00000000-0000-4000-8000-000000000002',
      },
    });
  });
});
