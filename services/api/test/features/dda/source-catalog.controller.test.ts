/* eslint-disable @typescript-eslint/require-await -- controller doubles mirror async services. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SourceCatalogController } from '../../../src/features/dda/source-catalog/api/source-catalog.controller.js';
import { InMemorySourceCatalogRepositoryAdapter } from '../../../src/features/dda/source-catalog/adapter/in-memory-source-catalog-repository.adapter.js';
import type { OriginalViewService } from '../../../src/features/dda/source-catalog/application/original-view.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { RequestTenantContextProblemError } from '../../../src/platform/http/request-tenant-context.port.js';
import type { FastifyReply } from 'fastify';
import {
  createTestOriginalViewService,
  createTestSourceCatalogService,
} from './source-catalog.test-support.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000b01',
  workspace: '00000000-0000-4000-8000-000000000b02',
  dataset: '00000000-0000-4000-8000-000000000b03',
  otherDataset: '00000000-0000-4000-8000-000000000b09',
  source: '00000000-0000-4000-8000-000000000b04',
  version: '00000000-0000-4000-8000-000000000b05',
  iae: '00000000-0000-4000-8000-000000000b06',
  actor: '00000000-0000-4000-8000-000000000b07',
  correlation: '00000000-0000-4000-8000-000000000b08',
};

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid controller fixture');
  return parsed.value;
}

function controllerContext(key = 'controller') {
  const context = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
    },
    actorId: stable(ids.actor),
    correlationId: stable(ids.correlation),
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(context.accepted, true);
  if (!context.accepted) throw new Error('invalid controller context');
  return context.value;
}

function replyRecorder() {
  const statusCodes: number[] = [];
  const reply = {
    code(statusCode: number) {
      statusCodes.push(statusCode);
      return reply;
    },
  } as unknown as FastifyReply;
  return { reply, statusCodes };
}

void test('[DDA-052] source catalog controller lists sources through the authenticated tenant context', async () => {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([
    {
      id: stable(ids.source),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.iae),
      sourceType: 'CSV',
      safeDisplayLabel: 'Controller source',
      status: 'ACTIVE',
      health: 'HEALTHY',
      versionId: stable(ids.version),
      dataMode: 'CLOUD',
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z',
    },
  ]);
  const catalog = createTestSourceCatalogService(repository);
  const originals = createTestOriginalViewService(catalog, repository);
  const context = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
    },
    actorId: stable(ids.actor),
    correlationId: stable(ids.correlation),
    idempotencyKey: 'controller',
    authorizationEpoch: 1,
  });
  assert.equal(context.accepted, true);
  if (!context.accepted) return;
  const controller = new SourceCatalogController(catalog, originals, {
    resolve: async () => context.value,
  });
  const listed = await controller.listSources({}, ids.dataset, { limit: 10 });
  assert.equal((listed as { accepted: boolean }).accepted, true);
});

void test('[DDA-026, IAM-009] original-view controller passes dataset binding and maps mismatches safely', async () => {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([
    {
      id: stable(ids.source),
      organizationId: stable(ids.organization),
      workspaceId: stable(ids.workspace),
      dsmDatasetId: stable(ids.dataset),
      iaeArtifactVersionId: stable(ids.iae),
      sourceType: 'CSV',
      safeDisplayLabel: 'Controller source',
      status: 'ACTIVE',
      health: 'HEALTHY',
      versionId: stable(ids.version),
      dataMode: 'CLOUD',
      revision: 1,
      updatedAt: '2026-08-12T00:00:00.000Z',
    },
  ]);
  const catalog = createTestSourceCatalogService(repository);
  const originals = createTestOriginalViewService(catalog, repository);
  const controller = new SourceCatalogController(catalog, originals, {
    resolve: async () => controllerContext('original-view'),
  });

  const successReply = replyRecorder();
  const success = await controller.resolveOriginalView(
    { body: { datasetVersionIds: { [ids.dataset]: ids.source } } },
    ids.dataset,
    ids.source,
    successReply.reply,
  );
  assert.equal((success as { accepted: boolean }).accepted, true);
  assert.deepEqual(successReply.statusCodes, [200]);

  const mismatchReply = replyRecorder();
  const mismatch = await controller.resolveOriginalView(
    {},
    ids.otherDataset,
    ids.source,
    mismatchReply.reply,
  );
  assert.deepEqual(mismatch, { accepted: false, code: 'NOT_FOUND' });
  assert.deepEqual(mismatchReply.statusCodes, [404]);
});

void test('[IAM-009] original-view controller rejects forged authority fields in every request container', async () => {
  let resolverCalls = 0;
  const controller = new SourceCatalogController(undefined, undefined, {
    resolve: async () => {
      resolverCalls += 1;
      return controllerContext('forged-authority');
    },
  });

  for (const location of ['body', 'query', 'params'] as const) {
    let deeplyNestedAuthority: Record<string, unknown> = { memberAuthorized: true };
    for (let depth = 0; depth < 12; depth += 1) {
      deeplyNestedAuthority = { nested: deeplyNestedAuthority };
    }
    await assert.rejects(
      controller.resolveOriginalView(
        {
          [location]: deeplyNestedAuthority,
        },
        ids.dataset,
        ids.source,
      ),
      (error: unknown) => error instanceof BadRequestException,
    );
  }
  assert.equal(resolverCalls, 0);
});

void test('[IAM-009] original-view controller maps authentication and resolver failures to safe statuses', async () => {
  const authenticationFailure = new SourceCatalogController(undefined, undefined, {
    resolve: async () => {
      throw new RequestTenantContextProblemError('AUTHENTICATION_FAILED');
    },
  });
  await assert.rejects(
    authenticationFailure.resolveOriginalView({}, ids.dataset, ids.source),
    (error: unknown) => error instanceof UnauthorizedException,
  );

  const unavailableResolver = new SourceCatalogController(undefined, undefined, {
    resolve: async () => {
      throw new RequestTenantContextProblemError('AUTHENTICATION_UNAVAILABLE');
    },
  });
  await assert.rejects(
    unavailableResolver.resolveOriginalView({}, ids.dataset, ids.source),
    (error: unknown) => error instanceof ServiceUnavailableException,
  );
});

void test('[DDA-052] ordinary original-view rejection keeps a content-safe body and non-200 status', async () => {
  const reply = replyRecorder();
  const controller = new SourceCatalogController(
    undefined,
    {
      resolveOriginalView: async () => ({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    } as unknown as OriginalViewService,
    {
      resolve: async () => controllerContext('rejection-status'),
    },
  );

  const result = await controller.resolveOriginalView({}, ids.dataset, ids.source, reply.reply);
  assert.deepEqual(result, { accepted: false, code: 'UNAVAILABLE' });
  assert.deepEqual(reply.statusCodes, [503]);
  assert.equal(/tenant|workspace|organization|path|secret/i.test(JSON.stringify(result)), false);
});

void test('[DDA-052] source-list controller rejects malformed and over-limit runtime paging values', async () => {
  const repository = new InMemorySourceCatalogRepositoryAdapter();
  repository.seed([]);
  const catalog = createTestSourceCatalogService(repository);
  const controller = new SourceCatalogController(catalog, undefined, {
    resolve: async () => controllerContext('invalid-paging'),
  });

  for (const limit of ['50', Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5, 51, [], {}]) {
    const reply = replyRecorder();
    const result = await controller.listSources(
      {},
      ids.dataset,
      { limit: limit as never },
      reply.reply,
    );
    assert.deepEqual(result, { accepted: false, code: 'INVALID_LIMIT' });
    assert.deepEqual(reply.statusCodes, [400]);
  }
});

void test('[IAM-009] source-list controller rejects authority fields in the parsed query object', async () => {
  let resolverCalls = 0;
  const controller = new SourceCatalogController(undefined, undefined, {
    resolve: async () => {
      resolverCalls += 1;
      return controllerContext('list-forged-query');
    },
  });

  await assert.rejects(
    controller.listSources({}, ids.dataset, { memberAuthorized: true } as never),
    (error: unknown) => error instanceof BadRequestException,
  );
  assert.equal(resolverCalls, 0);
});
