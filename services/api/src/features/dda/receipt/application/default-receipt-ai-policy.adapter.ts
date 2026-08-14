import {
  createDdaAiEgressPolicyV1,
  evaluateDdaAiEgressV1,
  type DdaAiEgressPolicyV1,
} from '@databreeze/domain/data-to-dashboard/policy-v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { ReceiptAiPolicyPort, ReceiptAiPolicyResultV1 } from './receipt-ai-policy.port.js';

export interface ReceiptAiPolicyStoreV1 {
  getPolicy(tenantScope: TenantScopeV1): DdaAiEgressPolicyV1 | undefined;
  getDisclosureVersion(tenantScope: TenantScopeV1): string | undefined;
  isTenantRevoked(tenantScope: TenantScopeV1): boolean;
}

/** Fail-closed / injectable workspace AI policy for receipt extraction. */
export class DefaultReceiptAiPolicyAdapter implements ReceiptAiPolicyPort {
  public constructor(private readonly store?: ReceiptAiPolicyStoreV1) {}

  public async resolveReceiptExtractionPolicy(input: {
    readonly tenantScope: TenantScopeV1;
    readonly payloadBytes: number;
    readonly requiresCloudEgress: boolean;
  }): Promise<ReceiptAiPolicyResultV1> {
    await Promise.resolve();
    if (this.store?.isTenantRevoked(input.tenantScope)) {
      return Object.freeze({ accepted: false, code: 'TENANT_REVOKED' as const });
    }

    const policy =
      this.store?.getPolicy(input.tenantScope) ?? defaultDeniedPolicy(input.tenantScope);
    if (!input.requiresCloudEgress) {
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          policy,
          disclosureVersion: this.store?.getDisclosureVersion(input.tenantScope) ?? 'local-none',
          adapter: 'local-deterministic',
          cloudEgressAllowed: false,
        }),
      });
    }

    const disclosureVersion = this.store?.getDisclosureVersion(input.tenantScope);
    if (!disclosureVersion) {
      return Object.freeze({ accepted: false, code: 'DISCLOSURE_MISSING' as const });
    }
    if (!policy.purposeAllowlist.includes('RECEIPT_EXTRACTION')) {
      return Object.freeze({ accepted: false, code: 'PURPOSE_DENIED' as const });
    }
    if (!policy.allowEvidence) {
      return Object.freeze({ accepted: false, code: 'EVIDENCE_TRANSFER_DENIED' as const });
    }

    const evaluated = evaluateDdaAiEgressV1(policy, {
      adapter: 'openai-responses',
      purpose: 'RECEIPT_EXTRACTION',
      payloadBytes: input.payloadBytes,
      includesEvidence: true,
    });
    if (!evaluated.accepted) {
      return Object.freeze({ accepted: false, code: 'AI_EGRESS_DENIED' as const });
    }

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        policy,
        disclosureVersion,
        adapter: 'openai-responses',
        cloudEgressAllowed: true,
      }),
    });
  }
}

function defaultDeniedPolicy(tenantScope: TenantScopeV1): DdaAiEgressPolicyV1 {
  const created = createDdaAiEgressPolicyV1({
    policyId: '00000000-0000-4000-8000-0000000000aa',
    tenantScope,
    enabled: false,
    locality: 'DENIED',
    purposeAllowlist: ['DISABLED'],
    adapterAllowlist: [],
    maximumPayloadBytes: 0,
  });
  if (!created.accepted) {
    throw new Error(`INVALID_DEFAULT_RECEIPT_AI_POLICY:${created.code}`);
  }
  return created.value;
}
