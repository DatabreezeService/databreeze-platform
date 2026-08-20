import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { createProblem } from '../../../platform/http/problem-details.js';
import { getRequestContext } from '../../../platform/http/request-context.js';
import { WorkerProblemError, type WorkerBoundaryPortV1 } from './worker-boundary.js';
import { WORKER_BOUNDARY } from './worker-ports.js';
import {
  WorkerClaimDto,
  WorkerCompleteDto,
  WorkerFinalizeResultAcceptedDto,
  WorkerFinalizeResultDto,
  WorkerHeartbeatDto,
  WorkerPrepareResultDto,
  WorkerPrepareResultAcceptedDto,
  WorkerWorkloadDto,
} from './worker.dto.js';

function correlationId(request: FastifyRequest): string {
  try {
    return getRequestContext(request).correlationId;
  } catch {
    return '00000000-0000-4000-8000-000000000000';
  }
}

@ApiTags('internal-worker')
@ApiBearerAuth()
@Controller('internal/worker')
export class WorkerController {
  public constructor(@Inject(WORKER_BOUNDARY) private readonly boundary: WorkerBoundaryPortV1) {}

  @Post('assignment')
  @HttpCode(200)
  @ApiOperation({ summary: 'Claim the next authenticated, identity-scoped worker assignment' })
  public async assignment(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.respond(reply, request, async () => ({
      assignment: (await this.boundary.assignment(request)) ?? null,
    }));
  }

  @Post('claim')
  @HttpCode(200)
  @ApiOperation({ summary: 'Claim an authenticated, attempt-scoped worker lease' })
  @ApiBody({ type: WorkerClaimDto })
  public async claim(
    @Req() request: FastifyRequest,
    @Body() input: WorkerClaimDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.respond(reply, request, () => this.boundary.claim(request, input));
  }

  @Post('workload')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resolve the exact server-authored workload for a leased attempt' })
  @ApiBody({ type: WorkerWorkloadDto })
  public async workload(
    @Req() request: FastifyRequest,
    @Body() input: WorkerWorkloadDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.respond(reply, request, () => this.boundary.workload(request, input));
  }

  @Post('heartbeat')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renew an authenticated, attempt-scoped worker lease' })
  @ApiBody({ type: WorkerHeartbeatDto })
  public async heartbeat(
    @Req() request: FastifyRequest,
    @Body() input: WorkerHeartbeatDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.respond(reply, request, () => this.boundary.heartbeat(request, input));
  }

  @Post('results/prepare')
  @HttpCode(200)
  @ApiOperation({ summary: 'Prepare stable descriptor-bound result write capabilities' })
  @ApiBody({ type: WorkerPrepareResultDto })
  @ApiOkResponse({ type: WorkerPrepareResultAcceptedDto })
  public async prepareResult(
    @Req() request: FastifyRequest,
    @Body() input: WorkerPrepareResultDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.respond(reply, request, () => this.boundary.prepareResult(request, input));
  }

  @Post('results/finalize')
  @HttpCode(200)
  @ApiOperation({ summary: 'Finalize verified attestations into one canonical result manifest' })
  @ApiBody({ type: WorkerFinalizeResultDto })
  @ApiOkResponse({ type: WorkerFinalizeResultAcceptedDto })
  public async finalizeResult(
    @Req() request: FastifyRequest,
    @Body() input: WorkerFinalizeResultDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.respond(reply, request, () => this.boundary.finalizeResult(request, input));
  }

  @Post('complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Commit one authenticated, attempt-scoped worker completion' })
  @ApiBody({ type: WorkerCompleteDto })
  public async complete(
    @Req() request: FastifyRequest,
    @Body() input: WorkerCompleteDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.respond(reply, request, () => this.boundary.complete(request, input));
  }

  private async respond<TValue>(
    reply: FastifyReply,
    request: FastifyRequest,
    operation: () => Promise<TValue>,
  ): Promise<void> {
    try {
      const value = await operation();
      reply.code(200).type('application/json').send(value);
    } catch (error: unknown) {
      const problem =
        error instanceof WorkerProblemError
          ? {
              code: error.code,
              status: error.status,
              retryable: error.status === 503,
            }
          : {
              code: 'WORKER_UNAVAILABLE',
              status: 503,
              retryable: true,
            };
      const id = correlationId(request);
      reply
        .code(problem.status)
        .type('application/problem+json')
        .send(
          createProblem({
            code: problem.code,
            correlationId: id,
            messageKey: 'api.error.worker_request_rejected',
            retryable: problem.retryable,
            status: problem.status,
          }),
        );
    }
  }
}
