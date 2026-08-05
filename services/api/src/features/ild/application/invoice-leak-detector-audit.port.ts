import {
  auditInvoiceLeakV1,
  type InvoiceLeakAuditResultV1,
  type InvoiceLeakFindingV1,
  type InvoiceLeakMatchedLineV1,
  type InvoiceEvidenceV1,
} from '@databreeze/domain/invoice-leak-detector/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const INVOICE_LEAK_DETECTOR_AUDIT_PORT = Symbol('INVOICE_LEAK_DETECTOR_AUDIT_PORT');

export type InvoiceLeakDetectorAuditInputV1 = Parameters<typeof auditInvoiceLeakV1>[0];

export interface InvoiceLeakDetectorEvidenceReferenceV1 {
  readonly sourceId: string;
  readonly locatorFingerprint: string;
}

export interface InvoiceLeakDetectorFindingOutputV1 {
  readonly type: InvoiceLeakFindingV1['type'];
  readonly severity: InvoiceLeakFindingV1['severity'];
  readonly lineId?: string;
  readonly estimatedExposure: number;
  readonly evidence: readonly InvoiceLeakDetectorEvidenceReferenceV1[];
  readonly findingFingerprint: string;
  readonly disposition: InvoiceLeakFindingV1['disposition'];
}

export interface InvoiceLeakDetectorMatchedLineOutputV1 {
  readonly invoiceLineId: string;
  readonly governingLineId?: string;
  readonly expectedQuantity?: number;
  readonly expectedUnitPrice?: number;
  readonly expectedAmount?: number;
  readonly billedAmount: number;
  readonly evidence: readonly InvoiceLeakDetectorEvidenceReferenceV1[];
}

export interface InvoiceLeakDetectorAuditOutputV1 {
  readonly schemaVersion: 1;
  readonly invoiceId: string;
  readonly artifactVersionId: string;
  readonly inputFingerprint: string;
  readonly calculationFingerprint: string;
  readonly billedTotal: number;
  readonly expectedTotal: number | null;
  readonly variance: number | null;
  readonly status: InvoiceLeakAuditResultV1['status'];
  readonly findings: readonly InvoiceLeakDetectorFindingOutputV1[];
  readonly matchedLines: readonly InvoiceLeakDetectorMatchedLineOutputV1[];
}

export type InvoiceLeakDetectorAuditPortResultV1 =
  | { readonly accepted: true; readonly value: InvoiceLeakDetectorAuditOutputV1 }
  | { readonly accepted: false; readonly code: 'AUDIT_REJECTED' | 'AUDIT_UNAVAILABLE' };

/** Runs bounded invoice diagnostics without a repository or durable job. */
export interface InvoiceLeakDetectorAuditPortV1 {
  audit(
    context: IamTenantContextV1,
    input: InvoiceLeakDetectorAuditInputV1,
  ): Promise<InvoiceLeakDetectorAuditPortResultV1>;
}

export type InvoiceLeakDetectorDomainProjectionInputV1 = {
  readonly result: InvoiceLeakAuditResultV1;
  readonly finding: InvoiceLeakFindingV1;
  readonly matchedLine: InvoiceLeakMatchedLineV1;
  readonly evidence: readonly InvoiceEvidenceV1[];
};
