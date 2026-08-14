import { afterEach, describe, expect, it, vi } from 'vitest';

import { acceptEtlProposal } from '../src/features/data-intake/etl-api.ts';
import { createWebIntakeApi } from '../src/features/data-intake/intake-api.ts';

const AUTHORITY_KEYS = new Set([
  'actor',
  'actorId',
  'authorization',
  'authorized',
  'context',
  'memberAuthorized',
  'memberId',
  'organizationId',
  'projectId',
  'role',
  'tenantScope',
  'workspaceId',
]);

function findAuthorityKeys(value: unknown, found: string[] = []): readonly string[] {
  if (Array.isArray(value)) {
    for (const child of value) findAuthorityKeys(child, found);
    return found;
  }
  if (typeof value !== 'object' || value === null) return found;
  for (const [key, child] of Object.entries(value)) {
    if (AUTHORITY_KEYS.has(key)) found.push(key);
    findAuthorityKeys(child, found);
  }
  return found;
}

const intakeCommand = {
  sessionId: '00000000-0000-4000-8000-000000000112',
  fileName: 'sales.csv',
  claimedMediaType: 'text/csv',
  expectedSha256: 'a'.repeat(64),
  contentBase64: 'YSxiCjEsMgo=',
};

const etlCommand = {
  baseUrl: 'https://api.example.test',
  proposalId: '00000000-0000-4000-8000-000000000123',
  expectedRevision: 2,
  idempotencyKey: '00000000-0000-4000-8000-0000000000aa',
  correlationId: '00000000-0000-4000-8000-0000000000bb',
  expected: {
    rowCount: 10,
    rejectedCount: 1,
    contentHash: 'a'.repeat(64),
    schemaHash: 'b'.repeat(64),
    lineageIds: ['00000000-0000-4000-8000-0000000000cc'],
  },
};

describe('[WEB-002][WEB-016][WEB-021][DDA-002][DDA-007] live data mutations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allowlists the intake body and recursively strips every client authority field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accepted: true,
          sessionId: intakeCommand.sessionId,
          artifactVersionId: '00000000-0000-4000-8000-000000000012',
          status: 'FINALIZED',
          profileId: 'dda.web.tabular.v1',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createWebIntakeApi('https://api.example.test/v1/dda/web-intake').finalize({
      ...intakeCommand,
      tenantScope: {
        organizationId: '00000000-0000-4000-8000-000000000001',
        workspaceId: '00000000-0000-4000-8000-000000000002',
      },
      metadata: { actor: { actorId: 'hostile', role: 'OWNER' } },
    } as never);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body: unknown = JSON.parse(request.body as string);
    expect(body).toEqual(intakeCommand);
    expect(findAuthorityKeys(body)).toEqual([]);
  });

  it.each([
    [400, 'INTAKE_INVALID'],
    [403, 'INTAKE_UNAUTHORIZED'],
    [409, 'INTAKE_CONFLICT'],
    [503, 'INTAKE_UNAVAILABLE'],
  ] as const)('maps intake HTTP %i to %s', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));

    await expect(
      createWebIntakeApi('https://api.example.test/v1/dda/web-intake').finalize(intakeCommand),
    ).rejects.toThrow(code);
  });

  it('rejects a malformed successful intake response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ accepted: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(
      createWebIntakeApi('https://api.example.test/v1/dda/web-intake').finalize(intakeCommand),
    ).rejects.toThrow('INTAKE_RESPONSE_INVALID');
  });

  it('allowlists the ETL acceptance body and recursively strips client authority fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accepted: true,
          proposalId: etlCommand.proposalId,
          datasetVersionId: '00000000-0000-4000-8000-000000000456',
          replayed: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await acceptEtlProposal({
      ...etlCommand,
      tenantScope: {
        organizationId: '00000000-0000-4000-8000-000000000001',
        workspaceId: '00000000-0000-4000-8000-000000000002',
      },
      metadata: { actor: { actorId: 'hostile', role: 'OWNER' } },
    } as never);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body: unknown = JSON.parse(request.body as string);
    expect(body).toEqual({
      proposalId: etlCommand.proposalId,
      expectedRevision: etlCommand.expectedRevision,
      idempotencyKey: etlCommand.idempotencyKey,
      correlationId: etlCommand.correlationId,
      expected: etlCommand.expected,
    });
    expect(findAuthorityKeys(body)).toEqual([]);
  });

  it.each([
    [400, 'ETL_ACCEPT_INVALID'],
    [403, 'ETL_ACCEPT_UNAUTHORIZED'],
    [409, 'ETL_ACCEPT_CONFLICT'],
    [503, 'ETL_ACCEPT_UNAVAILABLE'],
  ] as const)('maps ETL acceptance HTTP %i to %s', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));

    await expect(acceptEtlProposal(etlCommand)).rejects.toThrow(code);
  });
});
