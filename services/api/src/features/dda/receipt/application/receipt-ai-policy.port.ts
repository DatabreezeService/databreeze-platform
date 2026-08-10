import type {
  DdaAiEgressPolicyV1,
} from '@databreeze/domain/data-to-dashboard/policy-v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export type ReceiptAiPolicyErrorCodeV1 =
  | 'AI_EGRESS_DENIED'
  | 'PURPOSE_DENIED'
  | 'EVIDENCE_TRANSFER_DENIED'
  | 'DISCLOSURE_MISSING'
  | 'TENANT_REVOKED';

export interface ReceiptAiPolicyDecisionV1 {
  readonly policy: DdaAiEgressPolicyV1;
  readonly disclosureVersion: string;
  readonly adapter: string;
  readonly cloudEgressAllowed: boolean;
}

export type ReceiptAiPolicyResultV1 =
  | { readonly accepted: true; readonly value: ReceiptAiPolicyDecisionV1 }
  | { readonly accepted: false; readonly code: ReceiptAiPolicyErrorCodeV1 };

/** Workspace egress policy + disclosure for RECEIPT_EXTRACTION (DDA-043/044). */
export interface ReceiptAiPolicyPort {
  resolveReceiptExtractionPolicy(input: {
    readonly tenantScope: TenantScopeV1;
    readonly payloadBytes: number;
    readonly requiresCloudEgress: boolean;
  }): Promise<ReceiptAiPolicyResultV1>;
}
