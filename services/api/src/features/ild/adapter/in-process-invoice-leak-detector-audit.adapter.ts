import { createHash } from 'node:crypto';

import {
  auditInvoiceLeakV1,
  type InvoiceEvidenceV1,
  type InvoiceLeakAuditResultV1,
  type InvoiceLeakFindingV1,
  type InvoiceLeakMatchedLineV1,
} from '@databreeze/domain/invoice-leak-detector/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  InvoiceLeakDetectorAuditInputV1,
  InvoiceLeakDetectorAuditOutputV1,
  InvoiceLeakDetectorAuditPortResultV1,
  InvoiceLeakDetectorAuditPortV1,
  InvoiceLeakDetectorEvidenceReferenceV1,
  InvoiceLeakDetectorFindingOutputV1,
  InvoiceLeakDetectorMatchedLineOutputV1,
} from '../application/invoice-leak-detector-audit.port.js';

function fingerprint(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function safeEvidence(
  evidence: readonly InvoiceEvidenceV1[],
): readonly InvoiceLeakDetectorEvidenceReferenceV1[] {
  return Object.freeze(
    evidence.map((entry) =>
      Object.freeze({
        sourceId: entry.sourceId,
        locatorFingerprint: fingerprint({ sourceId: entry.sourceId, locator: entry.locator }),
      }),
    ),
  );
}

function safeFinding(finding: InvoiceLeakFindingV1): InvoiceLeakDetectorFindingOutputV1 {
  return Object.freeze({
    type: finding.type,
    severity: finding.severity,
    ...(finding.lineId === undefined ? {} : { lineId: finding.lineId }),
    estimatedExposure: finding.estimatedExposure,
    evidence: safeEvidence(finding.evidence),
    findingFingerprint: fingerprint(finding.stableFingerprint),
    disposition: finding.disposition,
  });
}

function safeMatchedLine(line: InvoiceLeakMatchedLineV1): InvoiceLeakDetectorMatchedLineOutputV1 {
  return Object.freeze({
    invoiceLineId: line.invoiceLineId,
    ...(line.governingLineId === undefined ? {} : { governingLineId: line.governingLineId }),
    ...(line.expectedQuantity === undefined ? {} : { expectedQuantity: line.expectedQuantity }),
    ...(line.expectedUnitPrice === undefined ? {} : { expectedUnitPrice: line.expectedUnitPrice }),
    ...(line.expectedAmount === undefined ? {} : { expectedAmount: line.expectedAmount }),
    billedAmount: line.billedAmount,
    evidence: safeEvidence(line.evidence),
  });
}

function safeOutput(
  context: IamTenantContextV1,
  result: InvoiceLeakAuditResultV1,
): InvoiceLeakDetectorAuditOutputV1 {
  return Object.freeze({
    schemaVersion: result.schemaVersion,
    invoiceId: result.invoiceId,
    artifactVersionId: result.artifactVersionId,
    inputFingerprint: fingerprint({
      tenantScope: context.tenantScope,
      inputHash: result.inputHash,
    }),
    calculationFingerprint: fingerprint(result.calculationVersion),
    billedTotal: result.billedTotal,
    expectedTotal: result.expectedTotal,
    variance: result.variance,
    status: result.status,
    findings: Object.freeze(result.findings.map(safeFinding)),
    matchedLines: Object.freeze(result.matchedLines.map(safeMatchedLine)),
  });
}

function isRejectedInput(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('INVALID_');
}

/**
 * Executes public domain diagnostics in memory only. The adapter owns no
 * persistence or artifact access and strips source values from every response.
 */
export class InProcessInvoiceLeakDetectorAuditAdapter implements InvoiceLeakDetectorAuditPortV1 {
  public audit(
    context: IamTenantContextV1,
    input: InvoiceLeakDetectorAuditInputV1,
  ): Promise<InvoiceLeakDetectorAuditPortResultV1> {
    try {
      return Promise.resolve(
        Object.freeze({ accepted: true, value: safeOutput(context, auditInvoiceLeakV1(input)) }),
      );
    } catch (error) {
      return Promise.resolve(
        Object.freeze({
          accepted: false,
          code: isRejectedInput(error)
            ? ('AUDIT_REJECTED' as const)
            : ('AUDIT_UNAVAILABLE' as const),
        }),
      );
    }
  }
}
