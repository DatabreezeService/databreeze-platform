import { describe, expect, it, vi } from 'vitest';
import {
  createNotificationStore,
  notificationActionPath,
} from '../src/features/notifications/notification-store.ts';

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response;
}

const page = {
  schemaVersion: 3,
  items: [
    {
      schemaVersion: 3,
      id: '00000000-0000-4000-8000-000000000301',
      workspaceId: '00000000-0000-4000-8000-000000000302',
      subjectId: '00000000-0000-4000-8000-000000000303',
      kind: 'SYNC_FAILED',
      labelVi: 'Đồng bộ cần chú ý',
      labelEn: 'Sync needs attention',
      action: 'OPEN_DATA',
      createdAt: '2026-08-12T00:00:00.000Z',
      correlationId: '00000000-0000-4000-8000-000000000304',
      state: 'UNREAD',
      revision: 1,
    },
  ],
  unreadCount: 3,
};

describe('notification store', () => {
  it('keeps unavailable separate from confirmed empty and retries without false badge state', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ code: 'temporary failure' }, 503))
      .mockResolvedValueOnce(response({ ...page, items: [], unreadCount: 0 }));
    const store = createNotificationStore({ baseUrl: '/api', fetcher });

    await store.load();
    expect(store.getState()).toMatchObject({ status: 'error', items: [] });
    await store.retry();
    expect(store.getState()).toMatchObject({ status: 'confirmed-empty', unreadCount: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the server unread count independent of the first page and paginates with an opaque cursor', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ ...page, nextCursor: 'cursor-v1-safe' }))
      .mockResolvedValueOnce(response({ ...page, items: [] }));
    const store = createNotificationStore({ baseUrl: '/api', fetcher, pageSize: 1 });

    await store.load();
    expect(store.getState().unreadCount).toBe(3);
    await store.loadNextPage();
    const secondRequest = fetcher.mock.calls[1]?.[0];
    expect(typeof secondRequest).toBe('string');
    if (typeof secondRequest !== 'string') return;
    expect(secondRequest).toContain('cursor=cursor-v1-safe');
    expect(secondRequest).not.toMatch(/workspaceId|actorId|recipientId/u);
  });

  it('rejects unknown or unsafe server records instead of rendering content', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        ...page,
        items: [{ ...page.items[0], kind: 'ATTACK', labelEn: 'C:\\secret.txt' }],
      }),
    );
    const store = createNotificationStore({ baseUrl: '/api', fetcher });

    await store.load();
    expect(store.getState().status).toBe('error');
    expect(store.getState().items).toHaveLength(0);
  });

  it('maps only registered logical actions into the active locale', () => {
    expect(notificationActionPath('vi-VN', 'OPEN_DATA')).toBe('/vi-VN/data');
    expect(notificationActionPath('en', 'OPEN_SETTINGS')).toBe('/en/administration');
    expect(notificationActionPath('en', 'https://example.test')).toBeUndefined();
  });

  it('sends a generated v3 state command and reconciles the authoritative badge', async () => {
    const updated = {
      ...page.items[0],
      state: 'ARCHIVED',
      revision: 2,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(page))
      .mockResolvedValueOnce(response(updated))
      .mockResolvedValueOnce(response({ ...page, items: [updated], unreadCount: 2 }));
    const store = createNotificationStore({ baseUrl: '/api', fetcher });

    await store.load();
    await store.archive(page.items[0]!.id, 1);

    expect(fetcher).toHaveBeenCalledTimes(3);
    const [url, init] = fetcher.mock.calls[1] ?? [];
    expect(url).toBe(`/api/v3/notifications/${page.items[0]!.id}`);
    expect(init?.method).toBe('PATCH');
    const body = init?.body;
    expect(typeof body).toBe('string');
    if (typeof body !== 'string') throw new Error('TEST_COMMAND_BODY_MISSING');
    expect(JSON.parse(body)).toMatchObject({
      schemaVersion: 3,
      state: 'ARCHIVED',
      expectedRevision: 1,
    });
    expect(store.getState().unreadCount).toBe(2);
    expect(store.getState().items[0]?.state).toBe('ARCHIVED');
  });
});
