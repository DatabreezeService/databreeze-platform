import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { DdaEtlPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type { EtlProposalRepositoryPortV1 } from './etl-proposal-repository.port.js';
import type {
  EtlAudPortV1,
  EtlBuaPortV1,
  EtlDsmPortV1,
  EtlIaePortV1,
  EtlJraPortV1,
  EtlPolicyPortV1,
} from './etl-foundation-ports.js';

export type EtlAcceptanceProblemCodeV1 =
  | 'DDA_ETL_NOT_FOUND'
  | 'DDA_ETL_REVISION_CONFLICT'
  | 'DDA_ETL_STALE_PROPOSAL'
  | 'DDA_ETL_PARTIAL_OUTPUT'
  | 'DDA_ETL_COUNT_MISMATCH'
  | 'DDA_ETL_HASH_MISMATCH'
  | 'DDA_ETL_SCHEMA_MISMATCH'
  | 'DDA_ETL_MISSING_REJECT_BUNDLE'
  | 'DDA_ETL_POLICY_CHANGED'
  | 'DDA_ETL_JRA_RETRY'
  | 'DDA_ETL_JRA_FAILED'
  | 'DDA_ETL_DSM_FAILED'
  | 'DDA_ETL_IAE_FAILED'
  | 'DDA_ETL_BUA_DENIED'
  | 'DDA_ETL_AUD_FAILED'
  | 'DDA_ETL_LINEAGE_MISMATCH';

export type EtlAcceptanceResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: EtlAcceptanceProblemCodeV1 };

export interface EtlAcceptanceValueV1 {
  readonly proposalId: string;
  readonly jobId: string;
  readonly artifactVersionId: string;
  readonly datasetVersionId: string;
  readonly rowCount: number;
  readonly contentHash: string;
  readonly schemaHash: string;
  readonly lineageIds: readonly string[];
  readonly replayed: boolean;
}

function rejected(code: EtlAcceptanceProblemCodeV1): EtlAcceptanceResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

/** DDA-004/007: accept ETL through JRA and register immutable DatasetVersion via public ports. */
export class EtlAcceptanceServiceV1 {
  private readonly acceptedByIdempotency = new Map<string, EtlAcceptanceValueV1>();

  public constructor(
    private readonly proposals: EtlProposalRepositoryPortV1,
    private readonly ports: {
      readonly iae: EtlIaePortV1;
      readonly dsm: EtlDsmPortV1;
      readonly jra: EtlJraPortV1;
      readonly bua: EtlBuaPortV1;
      readonly aud: EtlAudPortV1;
      readonly policy: EtlPolicyPortV1;
    },
  ) {}

  public async accept(input: {
    readonly tenantScope: TenantScopeV1;
    readonly proposalId: string;
    readonly expectedRevision: number;
    readonly idempotencyKey: string;
    readonly correlationId: string;
    readonly expected: {
      readonly rowCount: number;
      readonly rejectedCount: number;
      readonly contentHash: string;
      readonly schemaHash: string;
      readonly lineageIds: readonly string[];
    };
  }): Promise<EtlAcceptanceResultV1<EtlAcceptanceValueV1>> {
    const replayed = this.acceptedByIdempotency.get(input.idempotencyKey);
    if (replayed) {
      return Object.freeze({
        accepted: true,
        value: Object.freeze({ ...replayed, replayed: true }),
      });
    }

    const proposal = await this.proposals.findById(input.proposalId);
    if (!proposal) return rejected('DDA_ETL_NOT_FOUND');
    if (proposal.revision !== input.expectedRevision) return rejected('DDA_ETL_REVISION_CONFLICT');
    if (proposal.state !== 'READY_FOR_ACCEPTANCE' || proposal.blockingReasons.length > 0) {
      return rejected('DDA_ETL_STALE_PROPOSAL');
    }

    const plan = proposal.plan as DdaEtlPlanV1;
    const policyVersion = await this.ports.policy.currentPolicyVersionId(input.tenantScope);
    if (policyVersion !== plan.dataModePolicyVersionId) return rejected('DDA_ETL_POLICY_CHANGED');

    const admission = await this.ports.bua.admit({
      tenantScope: input.tenantScope,
      usageClass: 'DETERMINISTIC_ETL',
    });
    if (!admission.accepted) return rejected('DDA_ETL_BUA_DENIED');

    const job = await this.ports.jra.createTypedJob({
      tenantScope: input.tenantScope,
      proposalId: proposal.proposalId,
      idempotencyKey: input.idempotencyKey,
      engineBindingId: plan.engineBindingId,
    });
    if (!job.accepted) return rejected('DDA_ETL_JRA_FAILED');

    const manifestResult = await this.ports.jra.awaitResultManifest({
      tenantScope: input.tenantScope,
      jobId: job.jobId,
    });
    if (!manifestResult.accepted) {
      return rejected(manifestResult.code === 'JRA_RETRY' ? 'DDA_ETL_JRA_RETRY' : 'DDA_ETL_JRA_FAILED');
    }
    const manifest = manifestResult.manifest;
    if (manifest.partial) return rejected('DDA_ETL_PARTIAL_OUTPUT');
    if (manifest.rowCount !== input.expected.rowCount) return rejected('DDA_ETL_COUNT_MISMATCH');
    if (manifest.contentHash !== input.expected.contentHash) return rejected('DDA_ETL_HASH_MISMATCH');
    if (manifest.schemaHash !== input.expected.schemaHash) return rejected('DDA_ETL_SCHEMA_MISMATCH');
    if (input.expected.rejectedCount > 0 && !manifest.rejectBundleId) {
      return rejected('DDA_ETL_MISSING_REJECT_BUNDLE');
    }
    if (
      manifest.lineageIds.length !== input.expected.lineageIds.length ||
      manifest.lineageIds.some((id, index) => id !== input.expected.lineageIds[index])
    ) {
      return rejected('DDA_ETL_LINEAGE_MISMATCH');
    }

    const derivative = await this.ports.iae.registerDerivative({
      tenantScope: input.tenantScope,
      parentArtifactVersionId: plan.inputArtifactVersionId,
      contentHash: manifest.contentHash,
      schemaHash: manifest.schemaHash,
      ...(manifest.rejectBundleId ? { rejectBundleId: manifest.rejectBundleId } : {}),
    });
    if (!derivative.accepted) return rejected('DDA_ETL_IAE_FAILED');

    const dataset = await this.ports.dsm.registerDatasetVersion({
      tenantScope: input.tenantScope,
      artifactVersionId: derivative.artifactVersionId,
      schemaHash: manifest.schemaHash,
      contentHash: manifest.contentHash,
      lineageParentIds: manifest.lineageIds,
    });
    if (!dataset.accepted) {
      if (dataset.code === 'DSM_ORIGINAL_MUTATION') return rejected('DDA_ETL_DSM_FAILED');
      return rejected('DDA_ETL_DSM_FAILED');
    }

    const audit = await this.ports.aud.emit({
      tenantScope: input.tenantScope,
      action: 'ETL_ACCEPT',
      outcome: 'SUCCEEDED',
      correlationId: input.correlationId,
      references: [proposal.proposalId, dataset.datasetVersionId, job.jobId],
    });
    if (!audit.accepted) return rejected('DDA_ETL_AUD_FAILED');

    await this.proposals.update({
      ...proposal,
      state: 'ACCEPTED',
      revision: proposal.revision + 1,
    });

    const value: EtlAcceptanceValueV1 = Object.freeze({
      proposalId: proposal.proposalId,
      jobId: job.jobId,
      artifactVersionId: derivative.artifactVersionId,
      datasetVersionId: dataset.datasetVersionId,
      rowCount: manifest.rowCount,
      contentHash: manifest.contentHash,
      schemaHash: manifest.schemaHash,
      lineageIds: Object.freeze([...manifest.lineageIds]),
      replayed: job.replayed,
    });
    this.acceptedByIdempotency.set(input.idempotencyKey, value);
    return Object.freeze({ accepted: true, value });
  }
}
