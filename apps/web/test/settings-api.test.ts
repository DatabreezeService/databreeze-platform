import { describe, expect, it, vi } from 'vitest';

import {
  fetchWorkspaceSettings,
  fetchNotificationPreferences,
  inviteWorkspaceMember,
  setAccessPreset,
  setAgentGrant,
  updateAccountProfile,
  updateNotificationPreferences,
} from '../src/features/settings/settings-api.ts';
import { acceptWorkspaceInvitation } from '../src/features/settings/invitation-api.ts';

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response;
}

const ids = {
  organization: '00000000-0000-4000-8000-000000000400',
  workspace: '00000000-0000-4000-8000-000000000401',
  member: '00000000-0000-4000-8000-000000000402',
  invitation: '00000000-0000-4000-8000-000000000403',
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
      .mockResolvedValueOnce(response({ accepted: true, value: { id: ids.member } }));

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

  it('invites an existing account and changes the server revisioned access preset', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          membershipId: ids.member,
          invitationId: ids.invitation,
          expiresAt: '2026-08-25T00:00:00.000Z',
          deliveryStatus: 'DELIVERED',
        }),
      )
      .mockResolvedValueOnce(response({ accepted: true, value: { id: ids.member } }));

    const invitation = await inviteWorkspaceMember({
      baseUrl: '/api',
      fetcher,
      recipientEmail: 'person@example.com',
      accessPreset: 'VIEWER',
    });
    await setAccessPreset({
      baseUrl: '/api',
      fetcher,
      memberId: ids.member,
      accessPreset: 'EDITOR',
      expectedRevision: 1,
    });

    expect(invitation.invitationId).toBe(ids.invitation);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/invitations');
    expect(fetcher.mock.calls[1]?.[0]).toBe(`/api/v1/memberships/${ids.member}/access-preset`);
    const invitationBody = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof invitationBody).toBe('string');
    if (typeof invitationBody !== 'string') throw new Error('TEST_INVITATION_BODY_MISSING');
    expect(JSON.parse(invitationBody)).toEqual({
      recipientEmail: 'person@example.com',
      accessPreset: 'VIEWER',
    });
  });

  it('uses same-origin API paths when the local app intentionally has no API base URL', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        schemaVersion: 3,
        workspaceId: ids.workspace,
        canManage: true,
        members: [],
      }),
    );

    await fetchWorkspaceSettings({ baseUrl: '', fetcher });

    expect(fetcher.mock.calls[0]?.[0]).toBe('/v3/workspaces/settings');
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('include');
  });

  it('updates only the authenticated profile and parses the closed v4 result', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        schemaVersion: 4,
        user: {
          id: '00000000-0000-4000-8000-000000000402',
          displayName: 'Mai Quynh',
          locale: 'en',
          revision: 2,
        },
      }),
    );
    const user = await updateAccountProfile({
      baseUrl: '/api',
      fetcher,
      displayName: 'Mai Quynh',
      locale: 'en',
      expectedRevision: 1,
    });
    expect(user.displayName).toBe('Mai Quynh');
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/me/profile');
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('include');
    const headers = fetcher.mock.calls[0]?.[1]?.headers;
    const idempotencyKey =
      headers instanceof Headers
        ? headers.get('idempotency-key')
        : (headers as Record<string, string> | undefined)?.['idempotency-key'];
    expect(idempotencyKey).toBeTruthy();
  });

  it('accepts an invitation through the same-origin HMR API when no base URL is configured', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ id: ids.member, status: 'ACTIVE' }));
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', fetcher);
    try {
      await acceptWorkspaceInvitation('invitation-token-abcdefghijklmnopqrstuvwxyz123456');
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
    expect(fetcher.mock.calls[0]?.[0]).toBe('/v1/invitations/accept');
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('include');
  });

  it('reads and saves the recipient-scoped notification preference snapshot', async () => {
    const snapshot = {
      schemaVersion: 4,
      revision: 1,
      preferences: [
        {
          category: 'REVIEWS',
          channel: 'IN_APP',
          enabled: true,
          minimumUrgency: 'NORMAL',
          deliveryMode: 'IMMEDIATE',
          quietHours: { enabled: false, start: '22:00', end: '07:00' },
          timezone: 'Asia/Ho_Chi_Minh',
          mandatory: false,
        },
      ],
    } as const;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(snapshot))
      .mockResolvedValueOnce(response({ ...snapshot, revision: 2 }));
    const loaded = await fetchNotificationPreferences({ baseUrl: '/api', fetcher });
    const saved = await updateNotificationPreferences({
      baseUrl: '/api',
      fetcher,
      snapshot: loaded,
    });
    expect(loaded.revision).toBe(1);
    expect(saved.revision).toBe(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v4/notification-preferences');
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/v4/notification-preferences');
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('PUT');
    const body = fetcher.mock.calls[1]?.[1]?.body;
    expect(typeof body).toBe('string');
    if (typeof body !== 'string') throw new Error('TEST_NOTIFICATION_PREFERENCES_BODY_MISSING');
    expect(JSON.parse(body).expectedRevision).toBe(1);
  });
});
