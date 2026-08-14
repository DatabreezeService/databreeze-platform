import { createHash } from 'node:crypto';

import { tenantScopesEqualV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { DdaEtlPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

import type { EtlProposalRepositoryPortV1 } from './etl-proposal-repository.port.js';
import {
  UnavailableEtlAcceptanceAuthorizationAdapter,
  type EtlAcceptanceAuthorizationPortV1,
} from './etl-acceptance-authorization.port.js';
import type { EtlAcceptanceValueV1 as EtlAcceptanceCommandValueV1 } from './etl-acceptance-idempotency.port.js';
import type {
  EtlAudPortV1,
  EtlBuaPortV1,
  EtlDsmPortV1,
  EtlIaePortV1,
  EtlJraPortV1,
  EtlPolicyPortV1,
} from './etl-foundation-ports.js';
import {
  UnavailableEtlProposalAuthorityAdapter,
  type EtlProposalAuthorityPortV1,
} from './etl-proposal-authority.port.js';

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
  | 'DDA_ETL_LINEAGE_MISMATCH'
  | 'DDA_ETL_AUTHORIZATION_DENIED'
  | 'DDA_ETL_AUTHORIZATION_UNAVAILABLE'
  | 'DDA_ETL_COMMAND_CONFLICT'
  | 'DDA_ETL_COMMAND_UNAVAILABLE';

export type EtlAcceptanceResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: EtlAcceptanceProblemCodeV1 };

export type EtlAcceptanceValueV1 = EtlAcceptanceCommandValueV1;

function rejected(code: EtlAcceptanceProblemCodeV1): EtlAcceptanceResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function payloadFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

/** DDA-004/007: accept ETL through JRA and register immutable DatasetVersion via public ports. */
export class EtlAcceptanceServiceV1 {
  private readonly authorization: EtlAcceptanceAuthorizationPortV1;
  private readonly proposalAuthority: EtlProposalAuthorityPortV1;

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
    dependencies?: {
      readonly authorization?: EtlAcceptanceAuthorizationPortV1;
      readonly proposalAuthority?: EtlProposalAuthorityPortV1;
    },
  ) {
    this.authorization =
      dependencies?.authorization ?? new UnavailableEtlAcceptanceAuthorizationAdapter();
    this.proposalAuthority =
      dependencies?.proposalAuthority ?? new UnavailableEtlProposalAuthorityAdapter();
  }

  public async accept(input: {
    readonly tenantScope: TenantScopeV1;
    readonly context?: IamTenantContextV1;
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
    if (!input.context || !tenantScopesEqualV1(input.context.tenantScope, input.tenantScope)) {
      return rejected('DDA_ETL_AUTHORIZATION_UNAVAILABLE');
    }
    let authorization: Awaited<ReturnType<EtlAcceptanceAuthorizationPortV1['authorize']>>;
    try {
      authorization = await this.authorization.authorize({
        context: input.context,
        action: 'ETL_ACCEPT',
        proposalId: input.proposalId,
      });
    } catch {
      return rejected('DDA_ETL_AUTHORIZATION_UNAVAILABLE');
    }
    if (!authorization.accepted) {
      return rejected(
        authorization.code === 'FORBIDDEN'
          ? 'DDA_ETL_AUTHORIZATION_DENIED'
          : 'DDA_ETL_AUTHORIZATION_UNAVAILABLE',
      );
    }
    const tenantScope = input.context.tenantScope;

    const proposal = await this.proposals.findById(input.proposalId, tenantScope);
    if (!proposal) return rejected('DDA_ETL_NOT_FOUND');

    const plan = proposal.plan as DdaEtlPlanV1;
    let reauthorization: Awaited<ReturnType<EtlProposalAuthorityPortV1['reauthorize']>>;
    try {
      reauthorization = await this.proposalAuthority.reauthorize({
        context: input.context,
        proposalId: proposal.proposalId,
        proposalRevision: proposal.revision,
        plan,
      });
    } catch {
      return rejected('DDA_ETL_AUTHORIZATION_UNAVAILABLE');
    }
    if (!reauthorization.accepted) {
      return rejected(
        reauthorization.code === 'RESOURCE_SCOPE_DENIED' || reauthorization.code === 'FORBIDDEN'
          ? 'DDA_ETL_AUTHORIZATION_DENIED'
          : 'DDA_ETL_AUTHORIZATION_UNAVAILABLE',
      );
    }
    const policyVersion = await this.ports.policy.currentPolicyVersionId(tenantScope);
    if (policyVersion !== plan.dataModePolicyVersionId) return rejected('DDA_ETL_POLICY_CHANGED');

    const reservation = await this.proposals.reserveAcceptance({
      tenantScope,
      proposalId: input.proposalId,
      expectedRevision: input.expectedRevision,
      commandKey: input.idempotencyKey,
      payloadFingerprint: payloadFingerprint({
        proposalId: input.proposalId,
        expectedRevision: input.expectedRevision,
        expected: input.expected,
      }),
    });
    if (!reservation.accepted) return rejected(reservation.code);
    if (reservation.value.kind === 'REPLAY') {
      return Object.freeze({
        accepted: true,
        value: Object.freeze({ ...reservation.value.acceptance, replayed: true }),
      });
    }
    const reservationId = reservation.value.reservationId;
    const rejectAfterReservation = async (
      code: EtlAcceptanceProblemCodeV1,
    ): Promise<EtlAcceptanceResultV1<never>> => {
      await this.proposals.releaseAcceptance(reservationId);
      return rejected(code);
    };

    const admission = await this.ports.bua.admit({
      tenantScope,
      usageClass: 'DETERMINISTIC_ETL',
    });
    if (!admission.accepted) return rejectAfterReservation('DDA_ETL_BUA_DENIED');

    const job = await this.ports.jra.createTypedJob({
      tenantScope,
      proposalId: proposal.proposalId,
      idempotencyKey: input.idempotencyKey,
      engineBindingId: plan.engineBindingId,
    });
    if (!job.accepted) return rejectAfterReservation('DDA_ETL_JRA_FAILED');

    const manifestResult = await this.ports.jra.awaitResultManifest({
      tenantScope,
      jobId: job.jobId,
    });
    if (!manifestResult.accepted) {
      return rejectAfterReservation(
        manifestResult.code === 'JRA_RETRY' ? 'DDA_ETL_JRA_RETRY' : 'DDA_ETL_JRA_FAILED',
      );
    }
    const manifest = manifestResult.manifest;
    if (manifest.partial) return rejectAfterReservation('DDA_ETL_PARTIAL_OUTPUT');
    if (manifest.rowCount !== input.expected.rowCount)
      return rejectAfterReservation('DDA_ETL_COUNT_MISMATCH');
    if (manifest.contentHash !== input.expected.contentHash)
      return rejectAfterReservation('DDA_ETL_HASH_MISMATCH');
    if (manifest.schemaHash !== input.expected.schemaHash)
      return rejectAfterReservation('DDA_ETL_SCHEMA_MISMATCH');
    if (input.expected.rejectedCount > 0 && !manifest.rejectBundleId) {
      return rejectAfterReservation('DDA_ETL_MISSING_REJECT_BUNDLE');
    }
    if (
      manifest.lineageIds.length !== input.expected.lineageIds.length ||
      manifest.lineageIds.some((id, index) => id !== input.expected.lineageIds[index])
    ) {
      return rejectAfterReservation('DDA_ETL_LINEAGE_MISMATCH');
    }

    const derivative = await this.ports.iae.registerDerivative({
      tenantScope,
      parentArtifactVersionId: plan.inputArtifactVersionId,
      contentHash: manifest.contentHash,
      schemaHash: manifest.schemaHash,
      ...(manifest.rejectBundleId ? { rejectBundleId: manifest.rejectBundleId } : {}),
    });
    if (!derivative.accepted) return rejectAfterReservation('DDA_ETL_IAE_FAILED');

    const dataset = await this.ports.dsm.registerDatasetVersion({
      tenantScope,
      artifactVersionId: derivative.artifactVersionId,
      schemaHash: manifest.schemaHash,
      contentHash: manifest.contentHash,
      lineageParentIds: manifest.lineageIds,
    });
    if (!dataset.accepted) {
      if (dataset.code === 'DSM_ORIGINAL_MUTATION')
        return rejectAfterReservation('DDA_ETL_DSM_FAILED');
      return rejectAfterReservation('DDA_ETL_DSM_FAILED');
    }

    const audit = await this.ports.aud.emit({
      tenantScope,
      action: 'ETL_ACCEPT',
      outcome: 'SUCCEEDED',
      correlationId: input.correlationId,
      references: [proposal.proposalId, dataset.datasetVersionId, job.jobId],
    });
    if (!audit.accepted) return rejectAfterReservation('DDA_ETL_AUD_FAILED');

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
    const completed = await this.proposals.completeAcceptance(reservationId, value);
    if (!completed.accepted) return rejected('DDA_ETL_COMMAND_UNAVAILABLE');
    return Object.freeze({ accepted: true, value });
  }
}
