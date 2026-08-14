import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAuthorizedConversation,
  fetchAuthorizedConversationHistory,
  runAuthorizedAgentTurn,
} from '../src/features/analysis/analysis-api.ts';

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000101';
const DATASET_ID = '00000000-0000-4000-8000-000000000102';
const DATASET_VERSION_ID = '00000000-0000-4000-8000-000000000103';

const summary = Object.freeze({
  schemaVersion: 4 as const,
  conversationId: CONVERSATION_ID,
  title: 'Doanh thu theo khu vực',
  datasets: Object.freeze([
    Object.freeze({ datasetId: DATASET_ID, datasetVersionId: DATASET_VERSION_ID }),
  ]),
  createdAt: '2026-08-13T01:00:00.000Z',
  updatedAt: '2026-08-13T02:00:00.000Z',
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('[DDA-055][DDA-056][DDA-060] v4 Analysis transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads only the generated authorized conversation history without client tenant authority', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        schemaVersion: 4,
        accepted: true,
        items: [summary],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAuthorizedConversationHistory({
      baseUrl: 'https://api.example.test/',
      limit: 20,
    });

    expect(result.items).toEqual([summary]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/dda/conversations?limit=20',
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(
      /organizationId|workspaceId|tenantScope|memberAuthorized/u,
    );
  });

  it('loads immutable messages and authorized context events through the v4 contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        schemaVersion: 4,
        accepted: true,
        conversation: summary,
        messages: [
          {
            messageId: '00000000-0000-4000-8000-000000000104',
            conversationId: CONVERSATION_ID,
            role: 'AGENT',
            text: 'Miền Nam đang dẫn đầu.',
            sequence: 1,
            datasetVersionId: DATASET_VERSION_ID,
            createdAt: '2026-08-13T02:00:00.000Z',
          },
        ],
        contextEvents: [
          {
            eventId: '00000000-0000-4000-8000-000000000105',
            conversationId: CONVERSATION_ID,
            kind: 'DATASET_VERSION_ADVANCED',
            datasetId: DATASET_ID,
            beforeVersionId: '00000000-0000-4000-8000-000000000106',
            afterVersionId: DATASET_VERSION_ID,
            sequence: 2,
            occurredAt: '2026-08-13T02:01:00.000Z',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAuthorizedConversation({
      baseUrl: 'https://api.example.test',
      conversationId: CONVERSATION_ID,
      limit: 50,
    });

    expect(result.messages[0]?.text).toBe('Miền Nam đang dẫn đầu.');
    expect(result.contextEvents[0]?.kind).toBe('DATASET_VERSION_ADVANCED');
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.test/v1/dda/conversations/${CONVERSATION_ID}?limit=50`,
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('sends exactly the generated agent-turn command with idempotency and no authority fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        schemaVersion: 4,
        accepted: true,
        narrative: 'Miền Nam tăng 18,4%.',
        toolResults: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await runAuthorizedAgentTurn({
      baseUrl: 'https://api.example.test',
      conversationId: CONVERSATION_ID,
      messageId: '00000000-0000-4000-8000-000000000107',
      idempotencyKey: 'turn:00000000-0000-4000-8000-000000000107',
      locale: 'vi-VN',
      text: 'Khu vực nào tăng nhanh nhất?',
    });

    expect(result.narrative).toBe('Miền Nam tăng 18,4%.');
    const request = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request[0]).toBe('https://api.example.test/v1/dda/agent/turns');
    expect(request[1]).toEqual(expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(JSON.parse(String(request[1].body))).toEqual({
      schemaVersion: 4,
      conversationId: CONVERSATION_ID,
      messageId: '00000000-0000-4000-8000-000000000107',
      text: 'Khu vực nào tăng nhanh nhất?',
      idempotencyKey: 'turn:00000000-0000-4000-8000-000000000107',
      locale: 'vi-VN',
    });
  });

  it('fails closed on a malformed response and distinguishes permission denial', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ accepted: true })));
    await expect(
      fetchAuthorizedConversationHistory({ baseUrl: 'https://api.example.test' }),
    ).rejects.toMatchObject({
      code: 'CONVERSATION_RESPONSE_INVALID',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 403 })));
    await expect(
      runAuthorizedAgentTurn({
        baseUrl: 'https://api.example.test',
        conversationId: CONVERSATION_ID,
        messageId: '00000000-0000-4000-8000-000000000108',
        idempotencyKey: 'turn:00000000-0000-4000-8000-000000000108',
        locale: 'en',
        text: 'Compare regions',
      }),
    ).rejects.toMatchObject({
      code: 'AGENT_TURN_FORBIDDEN',
    });
  });
});
