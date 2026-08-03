import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  AUDIT_ATTESTATION_SERVICE,
  type AuditAttestationApplicationResultV1,
  type AuditAttestationService,
} from '../application/audit-attestation.service.js';
import { AuditProblemError } from '../application/audit-problem.error.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import { CreateAuditAttestationDto } from './audit-attestation.dto.js';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('v1/audit')
export class AuditAttestationController {
  public constructor(
    @Inject(AUDIT_ATTESTATION_SERVICE)
    private readonly attestations: AuditAttestationService,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {}

  private async execute<TValue>(
    work: () => Promise<AuditAttestationApplicationResultV1<TValue>>,
  ): Promise<TValue> {
    let result: AuditAttestationApplicationResultV1<TValue>;
    try {
      result = await work();
    } catch {
      throw new AuditProblemError('AUDIT_ATTESTATION_UNAVAILABLE');
    }
    if (result.accepted) return result.value;
    if (result.code === 'NOT_FOUND') throw new AuditProblemError('AUDIT_ATTESTATION_NOT_FOUND');
    if (result.code === 'UNAVAILABLE') throw new AuditProblemError('AUDIT_ATTESTATION_UNAVAILABLE');
    throw new AuditProblemError('AUDIT_ATTESTATION_REQUEST_INVALID');
  }

  @Post('attestations')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create an independent signature for an exact audit seal' })
  @ApiBody({ type: CreateAuditAttestationDto })
  @ApiCreatedResponse({ schema: { type: 'object', additionalProperties: true } })
  @ApiNotFoundResponse({ description: 'The requested seal is not visible.' })
  @ApiServiceUnavailableResponse({
    description: 'Audit attestation signing or persistence is unavailable.',
  })
  async create(
    @Req() request: unknown,
    @Body() input: CreateAuditAttestationDto,
  ): Promise<unknown> {
    const context = await this.requestContext.resolve(request);
    return this.execute(() => this.attestations.create(context, input));
  }

  @Get('attestations/:attestationId/verify')
  @ApiOperation({ summary: 'Verify an independent audit seal attestation' })
  @ApiOkResponse({
    schema: { type: 'object', required: ['valid'], properties: { valid: { type: 'boolean' } } },
  })
  @ApiNotFoundResponse({ description: 'The attestation or its referenced seal is not visible.' })
  @ApiServiceUnavailableResponse({ description: 'Audit attestation verification is unavailable.' })
  async verify(
    @Req() request: unknown,
    @Param('attestationId') attestationId: string,
  ): Promise<{ readonly valid: true }> {
    const context = await this.requestContext.resolve(request);
    await this.execute(() => this.attestations.verify(context, { attestationId }));
    return Object.freeze({ valid: true });
  }
}
