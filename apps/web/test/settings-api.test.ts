import { describe, expect, it, vi } from 'vitest';

import { fetchWorkspaceSettings, setAgentGrant } from '../src/features/settings/settings-api.ts';

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response;
}

const ids = {
  workspace: '00000000-0000-4000-8000-000000000401',
  member: '00000000-0000-4000-8000-000000000402',
};

describe('workspace settings API routes', () => {
  it('reads the generated v3 projection and mutates grants through IAM v1', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          schemaVersion: 3,
          workspaceId: ids.workspace,
          canManage: true,
          members: [
            {
              memberId: ids.member,
              displayName: 'An',
              accessPreset: 'EDITOR',
              agentGrantLevel: 'ANALYZE',
              agentGrantRevision: 2,
              membershipRevision: 4,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ accepted: true }));

    const projection = await fetchWorkspaceSettings({ baseUrl: '/api', fetcher });
    await setAgentGrant({
      baseUrl: '/api',
      fetcher,
      memberId: ids.member,
      level: 'PROPOSE_CHANGES',
      expectedRevision: 2,
    });

    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v3/workspaces/settings');
    expect(fetcher.mock.calls[1]?.[0]).toBe(`/api/v1/workspaces/agent-grants/${ids.member}`);
    expect(projection.members[0]?.agentGrantLevel).toBe('ANALYZE');
    const body = fetcher.mock.calls[1]?.[1]?.body;
    expect(typeof body).toBe('string');
    if (typeof body !== 'string') throw new Error('TEST_GRANT_BODY_MISSING');
    expect(JSON.parse(body)).toEqual({
      level: 'PROPOSE_CHANGES',
      expectedRevision: 2,
    });
  });
});
