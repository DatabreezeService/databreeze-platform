import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export type FolderProjectionConsentProblemCodeV1 =
  | 'LOCAL_MODE_DENIED'
  | 'CONSENT_REQUIRED'
  | 'PROJECTION_CANCELLED'
  | 'UNAUTHORIZED';

export interface FolderProjectionConsentDtoV1 {
  readonly tenantScope: TenantScopeV1;
  readonly bindingId: string;
  readonly sourceId: string;
  readonly dataMode: 'LOCAL' | 'CLOUD' | 'HYBRID';
  readonly consentGranted: boolean;
  readonly projectionCancelled?: boolean;
  readonly contentAllowed: boolean;
}

export type FolderProjectionConsentResultV1 =
  | {
      readonly accepted: true;
      readonly bindingId: string;
      readonly sourceId: string;
      readonly transferAllowed: true;
    }
  | {
      readonly accepted: false;
      readonly code: FolderProjectionConsentProblemCodeV1;
    };

/** DSO-015/021: cloud receives only consented metadata/content; LOCAL never uploads originals. */
export function evaluateFolderProjectionConsent(
  input: FolderProjectionConsentDtoV1,
): FolderProjectionConsentResultV1 {
  if (input.projectionCancelled === true) {
    return Object.freeze({ accepted: false, code: 'PROJECTION_CANCELLED' });
  }
  if (input.dataMode === 'LOCAL') {
    return Object.freeze({ accepted: false, code: 'LOCAL_MODE_DENIED' });
  }
  if (!input.consentGranted || !input.contentAllowed) {
    return Object.freeze({ accepted: false, code: 'CONSENT_REQUIRED' });
  }
  return Object.freeze({
    accepted: true,
    bindingId: input.bindingId,
    sourceId: input.sourceId,
    transferAllowed: true as const,
  });
}

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/folder-projections')
export class FolderProjectionController {
  @Post('consent')
  public consent(@Body() dto: FolderProjectionConsentDtoV1): FolderProjectionConsentResultV1 {
    return evaluateFolderProjectionConsent(dto);
  }
}
