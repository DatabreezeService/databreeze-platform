import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { RouteConfig } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { createProblem } from '../../../../platform/http/problem-details.js';
import type {
  IaeWorkerCapabilityReferenceResolverPortV1,
  IaeWorkerIdentityV1,
} from '../../application/worker-object-capability.port.js';
import {
  IAE_WORKER_RESULT_FINALIZATION_PORT,
  type IaeWorkerResultFinalizationPortV1,
} from '../../application/worker-result-finalization.port.js';
import { IaeWorkerObjectTransferService } from '../../application/worker-object-transfer.service.js';

export const IAE_WORKER_HTTP_MAX_RESULT_BYTES_V1 = 64 * 1024 * 1024;

export const IAE_WORKER_REQUEST_AUTHENTICATOR_PORT = Symbol(
  'IAE_WORKER_REQUEST_AUTHENTICATOR_PORT',
);
export interface IaeWorkerRequestAuthenticatorPortV1 {
  authenticate(request: unknown): Promise<IaeWorkerIdentityV1 | undefined>;
}

export const IAE_WORKER_CAPABILITY_REFERENCE_RESOLVER_PORT = Symbol(
  'IAE_WORKER_CAPABILITY_REFERENCE_RESOLVER_PORT',
);

export class UnavailableIaeWorkerRequestAuthenticatorAdapter
  implements IaeWorkerRequestAuthenticatorPortV1
{
  public authenticate(_request: unknown): Promise<undefined> {
    void _request;
    return Promise.resolve(undefined);
  }
}

export class UnavailableIaeWorkerCapabilityReferenceResolverAdapter
  implements IaeWorkerCapabilityReferenceResolverPortV1
{
  public resolveCapabilityId(_signedCapability: string): Promise<undefined> {
    void _signedCapability;
    return Promise.resolve(undefined);
  }
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return JSON.stringify(keys) === JSON.stringify([...expected].sort());
}

/** Internal IAE-024 boundary. Identity is always derived from the bearer request. */
@Controller('internal/iae/worker')
export class WorkerObjectTransferController {
  public constructor(
    @Inject(IAE_WORKER_REQUEST_AUTHENTICATOR_PORT)
    private readonly authenticator: IaeWorkerRequestAuthenticatorPortV1,
    @Inject(IAE_WORKER_CAPABILITY_REFERENCE_RESOLVER_PORT)
    private readonly references: IaeWorkerCapabilityReferenceResolverPortV1,
    private readonly transfers: IaeWorkerObjectTransferService,
    @Inject(IAE_WORKER_RESULT_FINALIZATION_PORT)
    private readonly finalization: IaeWorkerResultFinalizationPortV1,
  ) {}

  @Get('objects/:objectId')
  public async read(
    @Req() request: FastifyRequest,
    @Param('objectId') objectId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const authorized = await this.authorize(request, reply);
    if (authorized === undefined) return;
    const signedCapability = header(request, 'x-databreeze-signed-capability');
    const attemptId = header(request, 'x-databreeze-attempt-id');
    const capabilityId = signedCapability
      ? await this.references.resolveCapabilityId(signedCapability)
      : undefined;
    if (!signedCapability || !attemptId || !capabilityId)
      return this.problem(reply, 403, 'TRANSFER_DENIED', authorized.correlationId);
    const result = await this.transfers.read(authorized, {
      capabilityId,
      signedCapability,
      attemptId,
      objectId,
    });
    if (!result.accepted)
      return this.problem(
        reply,
        result.code === 'OBJECT_UNAVAILABLE' ? 503 : 403,
        result.code,
        authorized.correlationId,
      );
    reply
      .code(200)
      .header('x-content-sha256', result.value.contentSha256)
      .header('content-length', result.value.contentLength)
      .type('application/octet-stream')
      .send(Buffer.from(result.value.bytes));
  }

  @Put('objects/:objectId')
  @HttpCode(200)
  @RouteConfig({ bodyLimit: IAE_WORKER_HTTP_MAX_RESULT_BYTES_V1 })
  public async write(
    @Req() request: FastifyRequest,
    @Param('objectId') objectId: string,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const authorized = await this.authorize(request, reply);
    if (authorized === undefined) return;
    const signedCapability = header(request, 'x-databreeze-signed-capability');
    const attemptId = header(request, 'x-databreeze-attempt-id');
    const contentSha256 = header(request, 'x-content-sha256');
    const contentLengthValue = header(request, 'content-length');
    const contentLength = contentLengthValue ? Number(contentLengthValue) : Number.NaN;
    const capabilityId = signedCapability
      ? await this.references.resolveCapabilityId(signedCapability)
      : undefined;
    if (
      !signedCapability ||
      !attemptId ||
      !contentSha256 ||
      !capabilityId ||
      !(body instanceof Uint8Array)
    )
      return this.problem(reply, 400, 'INVALID_TRANSFER', authorized.correlationId);
    const result = await this.transfers.write(authorized, {
      capabilityId,
      signedCapability,
      attemptId,
      objectId,
      bytes: body,
      contentSha256,
      contentLength,
    });
    if (!result.accepted) {
      const status =
        result.code === 'OBJECT_UNAVAILABLE' ? 503 : result.code === 'TRANSFER_REPLAY' ? 409 : 400;
      return this.problem(reply, status, result.code, authorized.correlationId);
    }
    reply.code(200).type('application/json').send({
      schemaVersion: 1,
      accepted: true,
      receipt: result.value,
    });
  }

  @Post('results/finalize')
  @HttpCode(200)
  public async finalize(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const authorized = await this.authorize(request, reply);
    if (authorized === undefined) return;
    const keys = [
      'submissionId',
      'signedCapability',
      'attemptId',
      'executionDescriptorId',
      'objectId',
      'contentSha256',
      'contentLength',
      'mediaType',
    ] as const;
    if (!exactKeys(body, keys) || typeof body['signedCapability'] !== 'string')
      return this.problem(reply, 400, 'INVALID_FINALIZATION', authorized.correlationId);
    const capabilityId = await this.references.resolveCapabilityId(body['signedCapability']);
    if (!capabilityId)
      return this.problem(reply, 403, 'SIGNED_CAPABILITY_INVALID', authorized.correlationId);
    const result = await this.finalization.finalize(authorized, {
      submissionId: body['submissionId'] as never,
      capabilityId,
      signedCapability: body['signedCapability'],
      attemptId: body['attemptId'] as never,
      executionDescriptorId: body['executionDescriptorId'] as never,
      objectId: body['objectId'] as never,
      contentSha256: body['contentSha256'] as never,
      contentLength: body['contentLength'] as never,
      mediaType: body['mediaType'] as never,
    });
    if (!result.accepted) {
      const status =
        result.code === 'PERSISTENCE_UNAVAILABLE'
          ? 503
          : result.code === 'IDEMPOTENCY_CONFLICT'
            ? 409
            : 403;
      return this.problem(reply, status, result.code, authorized.correlationId);
    }
    reply.code(200).type('application/json').send({
      schemaVersion: 1,
      accepted: true,
      attestation: result.value,
    });
  }

  private async authorize(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<IaeWorkerIdentityV1 | undefined> {
    try {
      const identity = await this.authenticator.authenticate(request);
      if (identity !== undefined) return identity;
    } catch {
      // Authentication deliberately collapses to the same non-enumerating response.
    }
    this.problem(reply, 401, 'WORKER_AUTHENTICATION_REQUIRED');
    return undefined;
  }

  private problem(
    reply: FastifyReply,
    status: number,
    code: string,
    correlationId: string = '00000000-0000-4000-8000-000000000000',
  ): void {
    reply
      .code(status)
      .type('application/problem+json')
      .send(
        createProblem({
          code,
          correlationId,
          messageKey: 'api.error.worker_request_rejected',
          retryable: status === 503,
          status,
        }),
      );
  }
}
