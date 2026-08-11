import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acceptEtlProposal,
  etlLiveConfiguration,
  fetchEtlProposal,
} from '../src/features/data-intake/etl-api.ts';

describe('ETL live API configuration [DDA-006]', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires API base URL and proposal identity before requesting live review', () => {
    expect(etlLiveConfiguration({})).toBeUndefined();
    expect(
      etlLiveConfiguration({
        VITE_DATABREEZE_API_BASE_URL: 'https://api.example.test/',
      }),
    ).toBeUndefined();
    expect(
      etlLiveConfiguration({
        VITE_DATABREEZE_API_BASE_URL: 'https://api.example.test/',
        VITE_DATABREEZE_ETL_PROPOSAL_ID: 'proposal-123',
      }),
    ).toEqual({
      baseUrl: 'https://api.example.test',
      proposalId: 'proposal-123',
    });
  });

  it('fails closed on unauthorized ETL proposal reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchEtlProposal({
        baseUrl: 'https://api.example.test',
        proposalId: 'proposal-123',
      }),
    ).rejects.toThrow('ETL_PROPOSAL_UNAUTHORIZED');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/dda/etl-proposals/proposal-123',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    );
  });

  it('rejects malformed ETL proposal payloads instead of inventing review counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 200 })),
    );

    await expect(
      fetchEtlProposal({
        baseUrl: 'https://api.example.test',
        proposalId: 'proposal-123',
      }),
    ).rejects.toThrow('ETL_PROPOSAL_INVALID');
  });

  it('fails closed on unauthorized ETL acceptance and never invents hashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      acceptEtlProposal({
        baseUrl: 'https://api.example.test',
        tenantScope: {
          scopeType: 'workspace',
          organizationId: '00000000-0000-4000-8000-000000000001',
          workspaceId: '00000000-0000-4000-8000-000000000002',
        },
        proposalId: 'proposal-123',
        expectedRevision: 1,
        idempotencyKey: '00000000-0000-4000-8000-0000000000aa',
        correlationId: '00000000-0000-4000-8000-0000000000bb',
        expected: {
          rowCount: 10,
          rejectedCount: 1,
          contentHash: 'a'.repeat(64),
          schemaHash: 'b'.repeat(64),
          lineageIds: ['00000000-0000-4000-8000-0000000000cc'],
        },
      }),
    ).rejects.toThrow('ETL_ACCEPT_UNAUTHORIZED');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/dda/etl-acceptances',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      expected: { contentHash: string };
    };
    expect(body.expected.contentHash).toBe('a'.repeat(64));
  });
});
