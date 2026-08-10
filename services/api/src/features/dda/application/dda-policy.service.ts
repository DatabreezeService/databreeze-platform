import {
  createDdaAiEgressPolicyV1,
  createDdaAuditSummaryV1,
  createDdaRetentionConstraintV1,
  deterministicCapabilitiesWhenAiUnavailableV1,
  evaluateDdaAiEgressV1,
  type DdaAiEgressPolicyV1,
  type DdaAiPurposeV1,
  type DdaAuditSummaryV1,
  type DdaPolicyResultV1,
  type DdaRetentionConstraintV1,
} from '@databreeze/domain/data-to-dashboard/policy-v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { DdaAuditPortV1 } from './dda-audit.port.js';
import type { DdaIaePortV1 } from './foundation-ports.js';

/** DDA-043..DDA-046: AI egress, audit, and retention policy composition. */
export class DdaPolicyServiceV1 {
  public constructor(
    private readonly audit: DdaAuditPortV1,
    private readonly iae?: DdaIaePortV1,
  ) {}

  public defaultAiEgressPolicy(tenantScope: TenantScopeV1): DdaAiEgressPolicyV1 {
    const created = createDdaAiEgressPolicyV1({
      policyId: '00000000-0000-4000-8000-0000000000aa',
      tenantScope,
      enabled: false,
      locality: 'DENIED',
      purposeAllowlist: ['DISABLED'],
      adapterAllowlist: [],
      allowMetadata: false,
      allowSamples: false,
      allowResultRows: false,
      allowEvidence: false,
      retentionDays: 0,
      maximumPayloadBytes: 0,
    });
    if (!created.accepted) {
      throw new Error(`INVALID_DEFAULT_AI_POLICY:${created.code}`);
    }
    return created.value;
  }

  public evaluateAiEgress(
    policy: DdaAiEgressPolicyV1,
    request: {
      readonly adapter: string;
      readonly purpose: DdaAiPurposeV1;
      readonly payloadBytes: number;
      readonly includesSamples?: boolean;
      readonly includesResultRows?: boolean;
      readonly includesEvidence?: boolean;
    },
  ): DdaPolicyResultV1<{ readonly allowed: true }> {
    return evaluateDdaAiEgressV1(policy, request);
  }

  public deterministicCapabilities(): readonly string[] {
    return deterministicCapabilitiesWhenAiUnavailableV1();
  }

  public async recordMutation(input: {
    readonly action: unknown;
    readonly outcome: unknown;
    readonly correlationId: unknown;
    readonly referenceIds: unknown;
    readonly tenantScope: unknown;
    readonly forbiddenContent?: unknown;
  }): Promise<DdaPolicyResultV1<DdaAuditSummaryV1>> {
    const summary = createDdaAuditSummaryV1(input);
    if (!summary.accepted) return summary;
    await this.audit.emitContentSafeSummary(summary.value);
    return summary;
  }

  public async requestRetentionHold(input: {
    readonly artifactVersionId: unknown;
    readonly tenantScope: unknown;
    readonly holdReason: unknown;
    readonly requestedBy: unknown;
    readonly deleteDirectly?: unknown;
  }): Promise<DdaPolicyResultV1<DdaRetentionConstraintV1>> {
    const constraint = createDdaRetentionConstraintV1(input);
    if (!constraint.accepted) return constraint;
    if (!this.iae) {
      return Object.freeze({ accepted: false, code: 'RETENTION_OWNERSHIP' as const });
    }
    await this.iae.addRetentionConstraint(
      {
        id: constraint.value.artifactVersionId,
        tenantScope: constraint.value.tenantScope,
      },
      constraint.value.holdReason,
    );
    return constraint;
  }
}
