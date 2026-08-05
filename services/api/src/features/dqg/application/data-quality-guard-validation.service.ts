import { Inject, Injectable } from '@nestjs/common';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import {
  DATA_QUALITY_GUARD_VALIDATION_PORT,
  type DataQualityGuardValidationInputV1,
  type DataQualityGuardValidationPortResultV1,
  type DataQualityGuardValidationPortV1,
} from './data-quality-guard-validation.port.js';

export type DataQualityGuardValidationServiceResultV1 =
  | DataQualityGuardValidationPortResultV1
  | { readonly accepted: false; readonly code: 'WORKSPACE_SCOPE_REQUIRED' };

/**
 * Coordinates a tenant-bound, read-only quality calculation. The data-bearing
 * request has no repository and is discarded after the response is produced.
 */
@Injectable()
export class DataQualityGuardValidationService {
  public constructor(
    @Inject(DATA_QUALITY_GUARD_VALIDATION_PORT)
    private readonly validationPort: DataQualityGuardValidationPortV1,
  ) {}

  public validate(
    context: IamTenantContextV1,
    input: DataQualityGuardValidationInputV1,
  ): Promise<DataQualityGuardValidationServiceResultV1> {
    if (context.tenantScope.scopeType !== 'workspace')
      return Promise.resolve(
        Object.freeze({ accepted: false, code: 'WORKSPACE_SCOPE_REQUIRED' as const }),
      );
    return this.validationPort.validate(context, input);
  }
}
