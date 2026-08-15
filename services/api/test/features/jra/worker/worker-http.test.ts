/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Catch,
  type ArgumentsHost,
  type DynamicModule,
  type ExceptionFilter,
  Module,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import {
  JraWorkerModule,
  type JraWorkerModuleOptions,
} from '../../../../src/features/jra/worker/worker.module.js';
import { InputValidationException } from '../../../../src/platform/http/input-validation.exception.js';
import { createProblem } from '../../../../src/platform/http/problem-details.js';
import { createValidationPipe } from '../../../../src/platform/http/validation.js';
import { WorkerProblemError } from '../../../../src/features/jra/worker/worker-boundary.js';

const testCorrelationId = '00000000-0000-4000-8000-000000000099';

@Catch(InputValidationException)
class WorkerValidationFilter implements ExceptionFilter<InputValidationException> {
  public catch(exception: InputValidationException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    response
      .code(400)
      .type('application/problem+json')
      .send(
        createProblem({
          code: 'VALIDATION_FAILED',
          correlationId: testCorrelationId,
          fieldErrors: exception.fieldErrors,
          messageKey: 'api.error.validation_failed',
          retryable: false,
          status: 400,
        }),
      );
  }
}

const attemptId = '00000000-0000-4000-8000-000000000005';
const jobId = '00000000-0000-4000-8000-000000000004';
const expiry = '2026-08-13T00:05:00.000Z';
const descriptorId = '00000000-0000-4000-8000-000000000011';
const descriptorHash = 'a'.repeat(64);
const attemptBindingHash = 'b'.repeat(64);

function claimPayload() {
  return {
    attemptId,
    leaseToken: 'lease-token',
    expectedRevision: 1,
    descriptorId,
    descriptorHash,
    attemptBindingHash,
  };
}

@Module({})
class WorkerTestModule {
  public static register(options: JraWorkerModuleOptions = {}): DynamicModule {
    return {
      module: WorkerTestModule,
      imports: [JraWorkerModule.register(options)],
    };
  }
}

async function withApp(
  options: JraWorkerModuleOptions,
  run: (app: NestFastifyApplication) => Promise<void>,
): Promise<void> {
  const adapter = new FastifyAdapter({ bodyLimit: 65_536, logger: false });
  const app = await NestFactory.create<NestFastifyApplication>(
    WorkerTestModule.register(options),
    adapter,
    { abortOnError: true, logger: false },
  );
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new WorkerValidationFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

void test('composes worker routes but fails closed when durable worker dependencies are absent', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/internal/worker/claim',
      headers: { authorization: 'Bearer worker-token' },
      payload: claimPayload(),
    });

    assert.equal(response.statusCode, 503);
    assert.equal(
      response.headers['content-type']?.toString().startsWith('application/problem+json'),
      true,
    );
    assert.equal(response.json().code, 'WORKER_BOUNDARY_UNAVAILABLE');
    assert.doesNotMatch(response.body, /worker-token|lease-token/);
  });
});

void test('validates worker request DTOs strictly and preserves worker problem codes', async () => {
  const boundary = {
    claim: async () => {
      throw new WorkerProblemError('WORKER_ATTEMPT_REJECTED', 409);
    },
    heartbeat: async () => ({ revision: 2, leaseExpiresAt: expiry }),
    complete: async () => ({
      attemptId,
      revision: 2,
      outcome: 'SUCCEEDED' as const,
      resultReferences: [],
    }),
  };
  const options = { workerBoundary: boundary } as unknown as JraWorkerModuleOptions;

  await withApp(options, async (app) => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/internal/worker/claim',
      headers: { authorization: 'Bearer worker-token' },
      payload: {
        attemptId,
        leaseToken: 'lease-token',
        expectedRevision: 1,
        secret: 'must-not-be-accepted',
      },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().code, 'VALIDATION_FAILED');
    assert.doesNotMatch(invalid.body, /must-not-be-accepted/);

    const rejected = await app.inject({
      method: 'POST',
      url: '/internal/worker/claim',
      headers: { authorization: 'Bearer worker-token' },
      payload: claimPayload(),
    });
    assert.equal(rejected.statusCode, 409);
    assert.equal(rejected.json().code, 'WORKER_ATTEMPT_REJECTED');
    assert.doesNotMatch(rejected.body, /worker-token|lease-token/);
  });
});

void test('exposes assignment plus all attempt-scoped authenticated worker endpoints', async () => {
  const boundary = {
    assignment: async () => ({
      attemptId,
      jobId,
      leaseToken: 'lease-token',
      leaseExpiresAt: expiry,
      expectedRevision: 1,
      descriptorId,
      descriptorHash,
      attemptBindingHash,
      action: {
        type: 'foundation.metadata-digest',
        version: 1,
        handlerDigest: `sha256:${'a'.repeat(64)}`,
        inputSchemaId: 'foundation.metadata-fixture.v1',
        outputSchemaId: 'foundation.metadata-digest-result.v1',
        requiredCapabilities: ['metadata.read'],
        sideEffectClass: 'NONE' as const,
        riskClass: 'READ_ONLY' as const,
      },
    }),
    claim: async () => ({
      attemptId,
      jobId,
      leaseExpiresAt: expiry,
      revision: 2,
      inputGrant: {
        grantType: 'JOB_INPUT' as const,
        attemptId,
        jobId,
        workerId: '00000000-0000-4000-8000-000000000003',
        securityEpoch: 4,
        tenantScope: {
          scopeType: 'workspace' as const,
          organizationId: '00000000-0000-4000-8000-000000000001',
          workspaceId: '00000000-0000-4000-8000-000000000002',
        },
        objectIds: ['00000000-0000-4000-8000-000000000007'],
        expiresAt: expiry,
      },
    }),
    heartbeat: async () => ({ revision: 3, leaseExpiresAt: '2026-08-13T00:10:00.000Z' }),
    complete: async () => ({
      attemptId,
      revision: 4,
      outcome: 'SUCCEEDED' as const,
      resultReferences: [],
    }),
  };
  const options = { workerBoundary: boundary } as unknown as JraWorkerModuleOptions;

  await withApp(options, async (app) => {
    const headers = { authorization: 'Bearer worker-token' };
    const assignment = await app.inject({
      method: 'POST',
      url: '/internal/worker/assignment',
      headers,
      payload: {},
    });
    const claim = await app.inject({
      method: 'POST',
      url: '/internal/worker/claim',
      headers,
      payload: claimPayload(),
    });
    const heartbeat = await app.inject({
      method: 'POST',
      url: '/internal/worker/heartbeat',
      headers,
      payload: {
        attemptId,
        leaseToken: 'lease-token',
        expectedRevision: 2,
        nextLeaseExpiresAt: '2026-08-13T00:10:00.000Z',
      },
    });
    const complete = await app.inject({
      method: 'POST',
      url: '/internal/worker/complete',
      headers,
      payload: {
        attemptId,
        leaseToken: 'lease-token',
        expectedRevision: 3,
        outcome: 'SUCCEEDED',
        resultReferences: [],
      },
    });

    assert.equal(assignment.statusCode, 200);
    assert.equal(assignment.json().assignment.attemptId, attemptId);
    assert.equal(claim.statusCode, 200);
    assert.equal(heartbeat.statusCode, 200);
    assert.equal(complete.statusCode, 200);
  });
});

void test('[JRA-031] OpenAPI publishes exact generated-v4 accepted result schemas', async () => {
  await withApp({}, async (app) => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('worker-test').setVersion('4').build(),
    );
    const prepare = document.paths['/internal/worker/results/prepare']?.post?.responses?.['200'] as
      | { content?: Record<string, { schema?: { $ref?: string } }> }
      | undefined;
    const finalize = document.paths['/internal/worker/results/finalize']?.post?.responses?.[
      '200'
    ] as { content?: Record<string, { schema?: { $ref?: string } }> } | undefined;
    assert.equal(
      (prepare?.content?.['application/json']?.schema as { $ref?: string })?.$ref,
      '#/components/schemas/WorkerPrepareResultAcceptedDto',
    );
    assert.equal(
      (finalize?.content?.['application/json']?.schema as { $ref?: string })?.$ref,
      '#/components/schemas/WorkerFinalizeResultAcceptedDto',
    );
    const outputSchema = document.components?.schemas?.['WorkerPreparedOutputDto'] as {
      properties?: Record<string, unknown>;
      required?: readonly string[];
    };
    assert.equal(outputSchema.required?.includes('capabilityId'), true);
    assert.equal(
      Object.hasOwn(outputSchema.properties ?? {}, 'resultUsageSettlementBindingId'),
      false,
    );
    assert.equal(Object.hasOwn(outputSchema.properties ?? {}, 'sourceArtifactVersionIds'), false);
  });
});
