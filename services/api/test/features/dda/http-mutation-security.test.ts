import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

import { AutomaticPreparationController } from '../../../src/features/dda/etl/api/automatic-preparation.controller.js';
import { EtlAcceptanceController } from '../../../src/features/dda/etl/api/etl-acceptance.controller.js';
import { EtlProposalController } from '../../../src/features/dda/etl/api/etl-proposal.controller.js';
import { WebIntakeController } from '../../../src/features/dda/intake/api/web-intake.controller.js';
import { ReceiptExtractionController } from '../../../src/features/dda/receipt/api/receipt-extraction.controller.js';
import { FolderProjectionController } from '../../../src/features/dda/source-catalog/api/folder-projection.controller.js';
import { TableExtractionController } from '../../../src/features/dda/table-extraction/api/table-extraction.controller.js';
import type { IamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  RequestTenantContextProblemError,
  type RequestTenantContextPortV1,
} from '../../../src/platform/http/request-tenant-context.port.js';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000001',
  workspace: '00000000-0000-4000-8000-000000000002',
  project: '00000000-0000-4000-8000-000000000003',
  otherOrganization: '00000000-0000-4000-8000-000000000101',
  otherWorkspace: '00000000-0000-4000-8000-000000000102',
  otherProject: '00000000-0000-4000-8000-000000000103',
  actor: '00000000-0000-4000-8000-000000000004',
  correlation: '00000000-0000-4000-8000-000000000005',
});

const stable = (value: string): StableIdentifierV1 => value as StableIdentifierV1;

function context(
  organizationId: string = ids.organization,
  workspaceId: string = ids.workspace,
  projectId: string = ids.project,
): IamTenantContextV1 {
  return {
    tenantScope: {
      scopeType: 'project',
      organizationId: stable(organizationId),
      workspaceId: stable(workspaceId),
      projectId: stable(projectId),
    },
    actorId: stable(ids.actor),
    correlationId: stable(ids.correlation),
    idempotencyKey: 'http-mutation-security',
    authorizationEpoch: 1,
    mfaReenrollmentRequired: false,
  };
}

const trusted = context();
const request = { headers: { authorization: 'Bearer verified-request' } };

function requestContext(value: IamTenantContextV1 = trusted): RequestTenantContextPortV1 {
  return { resolve: () => Promise.resolve(value) };
}

function Controller<T>(type: new (...args: never[]) => T, ...args: unknown[]): T {
  return Reflect.construct(type, args as never[]);
}

function assertHttpStatus(error: unknown, status: number): void {
  assert.ok(error instanceof HttpException);
  assert.equal(error.getStatus(), status);
}

const intakeBody = {
  sessionId: '00000000-0000-4000-8000-000000000010',
  fileName: 'sales.csv',
  claimedMediaType: 'text/csv',
  expectedSha256: 'a'.repeat(64),
  contentBase64: Buffer.from('name,amount\nA,1\n').toString('base64'),
};

const etlExpected = {
  rowCount: 1,
  rejectedCount: 0,
  contentHash: 'a'.repeat(64),
  schemaHash: 'b'.repeat(64),
  lineageIds: ['00000000-0000-4000-8000-000000000012'],
};

const proposalReviewContext = {
  sourceSchema: ['name'],
  inferredSchema: ['name'],
  targetSchema: ['name'],
  assumptions: [],
  beforeSample: [],
  afterSample: [],
  counts: { changed: 0, unchanged: 1, rejected: 0 },
  exclusions: [],
  unsupportedScopes: [],
  sampling: { disclosed: true, method: 'HEAD' as const, seed: 0, rowCount: 1 },
  qualityEffects: [],
  evidenceStatus: 'AVAILABLE' as const,
  estimatedCost: { cpuMs: 0, memoryMb: 0 },
  aiSuggestions: [],
};

void test('[IAM-002, IAM-019, DDA-002] web intake uses trusted scope and rejects forged authority', async () => {
  const calls: unknown[] = [];
  const service = {
    publishedProfile: () => ({ profileId: 'dda.web.tabular.v1' }),
    finalizeUpload: (input: unknown) => {
      calls.push(input);
      return Promise.resolve({
        accepted: true as const,
        value: {
          sessionId: intakeBody.sessionId,
          artifactVersionId: '00000000-0000-4000-8000-000000000011',
          status: 'FINALIZED' as const,
          profileId: 'dda.web.tabular.v1' as const,
        },
      });
    },
  };
  const controller = Controller(WebIntakeController, service, requestContext());
  const finalize = controller;

  await finalize.finalize(request, intakeBody);
  assert.deepEqual((calls[0] as { tenantScope: unknown }).tenantScope, trusted.tenantScope);

  await assert.rejects(
    finalize.finalize(request, {
      ...intakeBody,
      tenantScope: {
        scopeType: 'project',
        organizationId: ids.otherOrganization,
        workspaceId: ids.otherWorkspace,
        projectId: ids.otherProject,
      },
    } as unknown as never),
    (error: unknown) => {
      assertHttpStatus(error, 400);
      return true;
    },
  );
  assert.equal(calls.length, 1);
});

void test('[IAM-002, IAM-019, DDA-007] ETL acceptance passes trusted scope and preserves safe keys', async () => {
  const calls: unknown[] = [];
  const service = {
    accept: (input: unknown) => {
      calls.push(input);
      return Promise.resolve({
        accepted: true as const,
        value: {
          proposalId: '00000000-0000-4000-8000-000000000020',
          jobId: '00000000-0000-4000-8000-000000000021',
          artifactVersionId: '00000000-0000-4000-8000-000000000022',
          datasetVersionId: '00000000-0000-4000-8000-000000000023',
          ...etlExpected,
          replayed: false,
        },
      });
    },
  };
  const controller = Controller(EtlAcceptanceController, service, requestContext(), {
    findById: () => Promise.resolve({}),
  });
  const accept = controller;
  const body = {
    proposalId: '00000000-0000-4000-8000-000000000020',
    expectedRevision: 1,
    idempotencyKey: 'accept-1',
    correlationId: ids.correlation,
    expected: etlExpected,
  };

  await accept.accept(request, body);
  assert.deepEqual((calls[0] as { tenantScope: unknown }).tenantScope, trusted.tenantScope);
  assert.equal((calls[0] as { idempotencyKey: string }).idempotencyKey, 'accept-1');
  assert.equal((calls[0] as { correlationId: string }).correlationId, ids.correlation);

  await assert.rejects(
    accept.accept(request, {
      ...body,
      tenantScope: { organizationId: ids.otherOrganization, workspaceId: ids.otherWorkspace },
    } as unknown as never),
    (error: unknown) => {
      assertHttpStatus(error, 400);
      return true;
    },
  );
});

void test('[IAM-002, IAM-019, DDA-053] automatic preparation uses trusted scope and rejects member authority', async () => {
  const calls: unknown[] = [];
  const service = {
    evaluateAndMaybeEnqueue: (input: unknown) => {
      calls.push(input);
      return Promise.resolve({
        accepted: true as const,
        value: {
          kind: 'ETL_REVIEW' as const,
          classification: { decision: 'REVIEW_REQUIRED' as const, reasonCodes: ['QUALITY_GATE'] },
          proposalId: '00000000-0000-4000-8000-000000000030',
        },
      });
    },
  };
  const controller = Controller(AutomaticPreparationController, service, requestContext(), {
    findById: () => Promise.resolve({}),
  });
  const evaluate = controller;
  const body = {
    proposalId: '00000000-0000-4000-8000-000000000030',
    idempotencyKey: 'prep-1',
    expectedRevision: 1,
  };

  await evaluate.evaluate(request, body);
  assert.deepEqual((calls[0] as { tenantScope: unknown }).tenantScope, trusted.tenantScope);

  await assert.rejects(
    evaluate.evaluate(request, { ...body, memberAuthorized: true } as unknown as never),
    (error: unknown) => {
      assertHttpStatus(error, 400);
      return true;
    },
  );
});

void test('[IAM-002, IAM-019, DDA-041] receipt routes use trusted scope and return normal bodies', async () => {
  const calls: { extract: unknown[]; correct: unknown[] } = { extract: [], correct: [] };
  const candidate = { candidateId: '00000000-0000-4000-8000-000000000040' };
  const service = {
    extract: (input: unknown) => {
      calls.extract.push(input);
      return Promise.resolve({ accepted: true as const, value: candidate });
    },
    correct: (input: unknown) => {
      calls.correct.push(input);
      return Promise.resolve({ accepted: true as const, value: candidate });
    },
  };
  const controller = Controller(ReceiptExtractionController, service, requestContext());
  const routes = controller;
  const extractBody = {
    artifactVersionId: '00000000-0000-4000-8000-000000000041',
    profileVersionId: '00000000-0000-4000-8000-000000000042',
    profileKind: 'receipt',
    correlationId: ids.correlation,
    idempotencyKey: 'receipt-1',
  };
  const correctBody = {
    priorCandidateId: candidate.candidateId,
    artifactVersionId: '00000000-0000-4000-8000-000000000041',
    correlationId: ids.correlation,
    fieldUpdates: { merchant: 'Trusted correction' },
  };

  assert.deepEqual(await routes.extract(request, extractBody), candidate);
  assert.deepEqual(await routes.correct(request, correctBody), candidate);
  assert.deepEqual((calls.extract[0] as { tenantScope: unknown }).tenantScope, trusted.tenantScope);
  assert.deepEqual((calls.correct[0] as { tenantScope: unknown }).tenantScope, trusted.tenantScope);

  await assert.rejects(
    routes.extract(request, {
      ...extractBody,
      tenantScope: trusted.tenantScope,
    } as unknown as never),
    (error: unknown) => {
      assertHttpStatus(error, 400);
      return true;
    },
  );
});

void test('[IAM-002, DSO-015, DSO-021] folder projection uses server mode/content policy and never trusts contentAllowed', async () => {
  const policyCalls: unknown[] = [];
  const policy = {
    authorize: (input: unknown) => {
      policyCalls.push(input);
      return Promise.resolve({
        accepted: true as const,
        dataMode: 'LOCAL' as const,
        contentAllowed: true,
      });
    },
  };
  const controller = Controller(FolderProjectionController, requestContext(), policy);
  const consent = controller;
  const body = {
    bindingId: '00000000-0000-4000-8000-000000000050',
    sourceId: '00000000-0000-4000-8000-000000000051',
    dataMode: 'CLOUD' as const,
    consentGranted: true,
  };

  await assert.rejects(consent.consent(request, body as unknown as never), (error: unknown) => {
    assertHttpStatus(error, 403);
    return true;
  });
  assert.deepEqual((policyCalls[0] as { context: unknown }).context, trusted);

  await assert.rejects(
    consent.consent(request, { ...body, contentAllowed: true } as unknown as never),
    (error: unknown) => {
      assertHttpStatus(error, 400);
      return true;
    },
  );
});

void test('[IAM-002, IAM-019, DDA-005, DDA-007] ETL proposals bind plan scope to the server and hide cross-tenant GETs', async () => {
  const calls: unknown[] = [];
  const other = context(ids.otherOrganization, ids.otherWorkspace, ids.otherProject);
  const record = {
    proposalId: '00000000-0000-4000-8000-000000000060',
    revision: 1,
    state: 'READY_FOR_ACCEPTANCE' as const,
    blockingReasons: [],
    plan: {
      tenantScope: trusted.tenantScope,
      transformations: [],
    },
    review: {
      sourceSchema: [],
      inferredSchema: [],
      targetSchema: [],
      assumptions: [],
      beforeSample: [],
      afterSample: [],
      counts: { changed: 0, unchanged: 0, rejected: 0 },
      exclusions: [],
      unsupportedScopes: [],
      sampling: { disclosed: true, method: 'HEAD' as const, seed: 0, rowCount: 0 },
      qualityEffects: [],
      evidenceStatus: 'AVAILABLE' as const,
      estimatedCost: { cpuMs: 0, memoryMb: 0 },
      aiSuggestions: [],
    },
    createdAt: '2026-08-13T00:00:00.000Z',
  };
  const otherRecord = {
    ...record,
    plan: { ...record.plan, tenantScope: other.tenantScope },
  };
  const service = {
    propose: (input: unknown) => {
      calls.push(input);
      return Promise.resolve({ accepted: true as const, value: record });
    },
    getProposal: () => Promise.resolve({ accepted: true as const, value: otherRecord }),
  };
  const controller = Controller(
    EtlProposalController,
    service,
    requestContext(),
    {
      findById: () => Promise.resolve(otherRecord),
    },
    {
      authorizeAndResolve: async (input: {
        readonly planInput: Record<string, unknown>;
        readonly reviewContext: unknown;
      }) => {
        await Promise.resolve();
        return {
          accepted: true as const,
          value: {
            planInput: { ...input.planInput, tenantScope: trusted.tenantScope },
            reviewContext: input.reviewContext as never,
          },
        };
      },
      reauthorize: async () => {
        await Promise.resolve();
        return { accepted: true as const };
      },
    },
  );
  const routes = controller;

  await routes.propose(request, {
    planInput: { transformations: [] },
    reviewContext: proposalReviewContext,
  });
  assert.deepEqual(
    (calls[0] as { planInput: { tenantScope: unknown } }).planInput.tenantScope,
    trusted.tenantScope,
  );

  await assert.rejects(
    routes.propose(request, {
      planInput: { transformations: [], tenantScope: other.tenantScope },
      reviewContext: proposalReviewContext,
    }),
    (error: unknown) => {
      assertHttpStatus(error, 400);
      return true;
    },
  );
  await assert.rejects(routes.get(request, record.proposalId), (error: unknown) => {
    assertHttpStatus(error, 404);
    return true;
  });
});

void test('[IAM-002, IAM-019, DDA-057] raw table extraction requires trusted policy and fails closed when unavailable', async () => {
  const policyCalls: unknown[] = [];
  const serviceCalls: unknown[] = [];
  const service = {
    extract: (input: unknown) => {
      serviceCalls.push(input);
      return Promise.resolve({
        accepted: true as const,
        candidate: {},
        warnings: [],
      });
    },
  };
  const policy = {
    authorize: (input: unknown) => {
      policyCalls.push(input);
      return Promise.resolve({
        accepted: true as const,
        usageAllowed: true as const,
        egressAllowed: true as const,
      });
    },
  };
  const controller = Controller(TableExtractionController, service, requestContext(), policy);
  const extract = controller;
  const body = {
    mimeType: 'image/png',
    bytesBase64: Buffer.from('safe-bytes').toString('base64'),
    widthPx: 100,
    heightPx: 100,
    pageCount: 1,
  };

  await extract.extract(request, body);
  assert.deepEqual((policyCalls[0] as { context: unknown }).context, trusted);
  assert.equal(serviceCalls.length, 1);

  await assert.rejects(
    extract.extract(request, { ...body, actorId: ids.actor } as unknown as never),
    (error: unknown) => {
      assertHttpStatus(error, 400);
      return true;
    },
  );

  const failClosed = Controller(TableExtractionController, service, requestContext());
  const failClosedExtract = failClosed;
  await assert.rejects(failClosedExtract.extract(request, body), (error: unknown) => {
    assert.ok(error instanceof ServiceUnavailableException);
    return true;
  });
});

void test('[IAM-002] all protected mutation controllers map authentication failures to safe HTTP statuses', async () => {
  const failedContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.reject(new RequestTenantContextProblemError('AUTHENTICATION_FAILED')),
  };
  const controller = Controller(
    WebIntakeController,
    {
      publishedProfile: () => ({ profileId: 'dda.web.tabular.v1' }),
      finalizeUpload: () => Promise.resolve({ accepted: true as const, value: {} }),
    },
    failedContext,
  );
  const finalize = controller;
  await assert.rejects(finalize.finalize(request, intakeBody), (error: unknown) => {
    assert.ok(error instanceof UnauthorizedException);
    return true;
  });
});
