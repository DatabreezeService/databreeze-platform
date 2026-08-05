import { Inject, Injectable } from '@nestjs/common';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import {
  INVOICE_LEAK_DETECTOR_AUDIT_PORT,
  type InvoiceLeakDetectorAuditInputV1,
  type InvoiceLeakDetectorAuditPortResultV1,
  type InvoiceLeakDetectorAuditPortV1,
} from './invoice-leak-detector-audit.port.js';

export type InvoiceLeakDetectorAuditServiceResultV1 =
  | InvoiceLeakDetectorAuditPortResultV1
  | { readonly accepted: false; readonly code: 'WORKSPACE_SCOPE_REQUIRED' };

/** Enforces server-derived workspace scope before transient invoice diagnostics. */
@Injectable()
export class InvoiceLeakDetectorAuditService {
  public constructor(
    @Inject(INVOICE_LEAK_DETECTOR_AUDIT_PORT)
    private readonly auditPort: InvoiceLeakDetectorAuditPortV1,
  ) {}

  public audit(
    context: IamTenantContextV1,
    input: InvoiceLeakDetectorAuditInputV1,
  ): Promise<InvoiceLeakDetectorAuditServiceResultV1> {
    if (context.tenantScope.scopeType !== 'workspace')
      return Promise.resolve(
        Object.freeze({ accepted: false, code: 'WORKSPACE_SCOPE_REQUIRED' as const }),
      );
    return this.auditPort.audit(context, input);
  }
}
