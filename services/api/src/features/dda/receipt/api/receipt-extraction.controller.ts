import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ReceiptCorrectionRequestDto,
  ReceiptExtractionRequestDto,
} from './receipt-extraction.dto.js';
import { ReceiptExtractionService } from '../application/receipt-extraction.service.js';

/** Nest HTTP surface composed by plan 087; leaf service remains 086-owned. */
@ApiTags('dda-receipts')
@Controller('v1/dda/receipts')
export class ReceiptExtractionController {
  public constructor(private readonly service: ReceiptExtractionService) {}

  @Post('extract')
  public async extract(@Body() body: ReceiptExtractionRequestDto): Promise<{
    readonly statusCode: number;
    readonly body: Record<string, unknown>;
  }> {
    const scope = parseTenantScopeV1(body.tenantScope);
    if (!scope.accepted) {
      return { statusCode: 400, body: { code: 'INVALID_SCOPE' } };
    }
    const result = await this.service.extract({
      tenantScope: scope.value,
      artifactVersionId: body.artifactVersionId,
      profileVersionId: body.profileVersionId,
      profileKind: body.profileKind,
      correlationId: body.correlationId,
      ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
    });
    if (!result.accepted) {
      const statusCode = result.code === 'WRONG_SCOPE_ARTIFACT' ? 403 : 422;
      return { statusCode, body: { code: result.code } };
    }
    return { statusCode: 200, body: result.value as unknown as Record<string, unknown> };
  }

  @Post('correct')
  public async correct(@Body() body: ReceiptCorrectionRequestDto): Promise<{
    readonly statusCode: number;
    readonly body: Record<string, unknown>;
  }> {
    const scope = parseTenantScopeV1(body.tenantScope);
    if (!scope.accepted) {
      return { statusCode: 400, body: { code: 'INVALID_SCOPE' } };
    }
    const result = await this.service.correct({
      tenantScope: scope.value,
      priorCandidateId: body.priorCandidateId,
      correlationId: body.correlationId,
      fieldUpdates: body.fieldUpdates,
    });
    if (!result.accepted) {
      return { statusCode: 422, body: { code: result.code } };
    }
    return { statusCode: 200, body: result.value as unknown as Record<string, unknown> };
  }
}
