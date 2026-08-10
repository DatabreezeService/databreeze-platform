import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ReceiptCorrectionRequestDto,
  ReceiptExtractionRequestDto,
} from './receipt-extraction.dto.js';
import type { ReceiptExtractionService } from '../application/receipt-extraction.service.js';

/** Leaf controller — root composition is owned by plan 087. */
export class ReceiptExtractionController {
  public constructor(private readonly service: ReceiptExtractionService) {}

  public async extract(body: ReceiptExtractionRequestDto): Promise<{
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

  public async correct(body: ReceiptCorrectionRequestDto): Promise<{
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
