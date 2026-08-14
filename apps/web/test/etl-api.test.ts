import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acceptEtlProposal,
  etlAcceptEnabled,
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
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as {
      expected: { contentHash: string };
    };
    expect(body.expected.contentHash).toBe('a'.repeat(64));
  });

  it('parses explicit acceptanceEvidence hashes from proposal GET and never invents them', async () => {
    const contentHash = 'a'.repeat(64);
    const schemaHash = 'b'.repeat(64);
    const lineageIds = ['00000000-0000-4000-8000-000000000012'];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            accepted: true,
            proposalId: 'proposal-123',
            revision: 2,
            state: 'READY_FOR_ACCEPTANCE',
            sourceSchema: ['name'],
            inferredSchema: ['name'],
            targetSchema: ['name'],
            orderedSteps: ['TRIM_TEXT'],
            assumptions: ['trim'],
            counts: { changed: 3, unchanged: 1, rejected: 1 },
            exclusions: [],
            unsupportedScopes: [],
            qualityEffects: [],
            evidenceStatus: 'AVAILABLE',
            estimatedCost: { cpuMs: 5, memoryMb: 8 },
            acceptanceEvidence: {
              revision: 2,
              rowCount: 4,
              rejectedCount: 1,
              contentHash,
              schemaHash,
              lineageIds,
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const review = await fetchEtlProposal({
      baseUrl: 'https://api.example.test',
      proposalId: 'proposal-123',
    });
    expect(review.acceptanceEvidence).toEqual({
      revision: 2,
      rowCount: 4,
      rejectedCount: 1,
      contentHash,
      schemaHash,
      lineageIds,
    });
  });

  it('omits acceptanceEvidence when GET omits hashes instead of inventing KPIs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            accepted: true,
            proposalId: 'proposal-123',
            revision: 1,
            state: 'READY_FOR_ACCEPTANCE',
            sourceSchema: ['name'],
            inferredSchema: ['name'],
            targetSchema: ['name'],
            orderedSteps: ['TRIM_TEXT'],
            assumptions: ['trim'],
            counts: { changed: 1, unchanged: 0, rejected: 0 },
            exclusions: [],
            unsupportedScopes: [],
            qualityEffects: [],
            evidenceStatus: 'AVAILABLE',
            estimatedCost: { cpuMs: 5, memoryMb: 8 },
          }),
          { status: 200 },
        ),
      ),
    );

    const review = await fetchEtlProposal({
      baseUrl: 'https://api.example.test',
      proposalId: 'proposal-123',
    });
    expect(review.acceptanceEvidence).toBeUndefined();
  });

  it('enables Accept only with tenant, live config, ready state, and explicit hashes [DDA-007]', () => {
    const configuration = {
      baseUrl: 'https://api.example.test',
      proposalId: 'proposal-123',
    };
    const acceptanceEvidence = {
      revision: 1,
      rowCount: 4,
      rejectedCount: 1,
      contentHash: 'a'.repeat(64),
      schemaHash: 'b'.repeat(64),
      lineageIds: ['00000000-0000-4000-8000-000000000012'],
    };
    const readyProposal = {
      proposalId: 'proposal-123',
      revision: 1,
      sourceSchema: ['name'],
      inferredSchema: ['name'],
      targetSchema: ['name'],
      orderedSteps: ['TRIM_TEXT'],
      assumptions: ['trim'],
      beforeSample: [],
      afterSample: [],
      counts: { changed: 3, unchanged: 1, rejected: 1 },
      exclusions: [],
      unsupportedScopes: [],
      qualityEffects: [],
      evidenceStatus: 'AVAILABLE',
      estimatedCost: { cpuMs: 5, memoryMb: 8 },
      state: 'READY_FOR_ACCEPTANCE',
      acceptanceEvidence,
    };

    expect(
      etlAcceptEnabled({
        tenantConfigured: true,
        configuration,
        proposal: readyProposal,
      }),
    ).toBe(true);
    expect(
      etlAcceptEnabled({
        tenantConfigured: false,
        configuration,
        proposal: readyProposal,
      }),
    ).toBe(false);
    expect(
      etlAcceptEnabled({
        tenantConfigured: true,
        configuration: undefined,
        proposal: readyProposal,
      }),
    ).toBe(false);
    const { acceptanceEvidence: _acceptanceEvidence, ...proposalWithoutEvidence } = readyProposal;
    void _acceptanceEvidence;
    expect(
      etlAcceptEnabled({
        tenantConfigured: true,
        configuration,
        proposal: proposalWithoutEvidence,
      }),
    ).toBe(false);
    expect(
      etlAcceptEnabled({
        tenantConfigured: true,
        configuration,
        proposal: { ...readyProposal, state: 'NEEDS_REVIEW' },
      }),
    ).toBe(false);
  });
});
