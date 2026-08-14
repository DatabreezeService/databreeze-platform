import {
  brandUntrustedSourceContentV1,
  authorizeUntrustedContentV1,
  createDdaAiEgressPolicyV1,
  evaluateDdaAiEgressV1,
  deterministicCapabilitiesWhenAiUnavailableV1,
  type DdaAiEgressPolicyV1,
} from '@databreeze/domain/data-to-dashboard/policy-v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { DdaAudComposePortV1, DdaBuaPortV1 } from '../../application/foundation-ports.js';
import type {
  NarrativeAdapterPortV1,
  NarrativeAdapterRequestV1,
  NarrativeClaimV1,
} from './narrative-adapter.port.js';

export type AnalysisNarrativeErrorCodeV1 =
  | 'AI_EGRESS_DENIED'
  | 'PURPOSE_DENIED'
  | 'ADAPTER_DISABLED'
  | 'ADAPTER_UNAVAILABLE'
  | 'INVALID_CLAIM'
  | 'BUDGET_DENIED'
  | 'HOSTILE_CONTENT_REJECTED';

export type AnalysisNarrativeResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly claims: readonly NarrativeClaimV1[];
        readonly locale: 'vi' | 'en';
        readonly adapterUsed: boolean;
        readonly rationale?: string;
      };
    }
  | { readonly accepted: false; readonly code: AnalysisNarrativeErrorCodeV1 };

export interface AnalysisNarrativePolicyStoreV1 {
  getPolicy(tenantScope: TenantScopeV1): DdaAiEgressPolicyV1 | undefined;
}

/** DDA-018/019/043-045: narrative claims must cite authorized result cells only. */
export class AnalysisNarrativeServiceV1 {
  public constructor(
    private readonly adapter: NarrativeAdapterPortV1,
    private readonly options: {
      readonly policyStore?: AnalysisNarrativePolicyStoreV1;
      readonly bua?: DdaBuaPortV1;
      readonly aud?: DdaAudComposePortV1;
      readonly killSwitchEnv?: () => string | undefined;
    } = {},
  ) {}

  public fallbackCapabilities(): readonly string[] {
    return deterministicCapabilitiesWhenAiUnavailableV1();
  }

  public async propose(
    tenantScope: TenantScopeV1,
    request: Omit<NarrativeAdapterRequestV1, 'tenantScope'>,
  ): Promise<AnalysisNarrativeResultV1> {
    for (const cell of request.resultPackage.cells) {
      const branded = brandUntrustedSourceContentV1(cell.label);
      if (!branded) return Object.freeze({ accepted: false, code: 'HOSTILE_CONTENT_REJECTED' });
      const elevation = authorizeUntrustedContentV1(branded, 'PUBLICATION');
      if (elevation.accepted) {
        return Object.freeze({ accepted: false, code: 'HOSTILE_CONTENT_REJECTED' });
      }
    }

    const kill = (
      this.options.killSwitchEnv ?? (() => process.env['DATABREEZE_OPENAI_NARRATIVE_ENABLED'])
    )();
    if (kill === 'false') return Object.freeze({ accepted: false, code: 'ADAPTER_DISABLED' });

    const policy =
      this.options.policyStore?.getPolicy(tenantScope) ?? defaultDeniedPolicy(tenantScope);
    if (!policy.purposeAllowlist.includes('NARRATIVE')) {
      return Object.freeze({ accepted: false, code: 'PURPOSE_DENIED' });
    }
    if (!policy.allowResultRows) {
      return Object.freeze({ accepted: false, code: 'AI_EGRESS_DENIED' });
    }
    const payloadBytes = JSON.stringify(request.resultPackage).length;
    const evaluated = evaluateDdaAiEgressV1(policy, {
      adapter: 'openai-responses',
      purpose: 'NARRATIVE',
      payloadBytes,
      includesResultRows: true,
    });
    if (!evaluated.accepted) return Object.freeze({ accepted: false, code: 'AI_EGRESS_DENIED' });

    if (!(await this.adapter.isAvailable())) {
      return Object.freeze({ accepted: false, code: 'ADAPTER_UNAVAILABLE' });
    }

    let reservationId: string | undefined;
    if (this.options.bua) {
      try {
        const reservation = await this.options.bua.reserveCapacity({
          reference: { id: request.resultPackage.resultManifestId, tenantScope },
          usageClass: 'NARRATIVE',
          requestUnits: 1,
          imageBytes: 0,
          textTokensEstimate: Math.ceil(payloadBytes / 4),
          retryBudget: 0,
          costUnitsEstimate: 1,
        });
        reservationId = reservation.reservationId;
      } catch {
        return Object.freeze({ accepted: false, code: 'BUDGET_DENIED' });
      }
    }

    const proposed = await this.adapter.proposeNarrative({ ...request, tenantScope });
    if (proposed.status !== 'PROPOSED') {
      if (reservationId && this.options.bua) {
        await this.options.bua.finalizeReservation({
          reservationId,
          reference: { id: request.resultPackage.resultManifestId, tenantScope },
          outcome: 'FAILED',
        });
      }
      return Object.freeze({
        accepted: false,
        code: (proposed.code as AnalysisNarrativeErrorCodeV1) ?? 'ADAPTER_UNAVAILABLE',
      });
    }

    const authorizedCells = new Set(request.resultPackage.cells.map((cell) => cell.cellId));
    for (const claim of proposed.claims) {
      if (claim.resultCellIds.length === 0) {
        return Object.freeze({ accepted: false, code: 'INVALID_CLAIM' });
      }
      if (claim.resultCellIds.some((id) => !authorizedCells.has(id))) {
        return Object.freeze({ accepted: false, code: 'INVALID_CLAIM' });
      }
    }

    if (reservationId && this.options.bua) {
      await this.options.bua.finalizeReservation({
        reservationId,
        reference: { id: request.resultPackage.resultManifestId, tenantScope },
        outcome: 'SUCCEEDED',
      });
    }
    await this.options.aud?.emitContentSafeSummary({
      tenantScope,
      action: 'DDA_NARRATIVE_ASSISTANCE',
      outcome: 'SUCCEEDED',
      correlationId: request.resultPackage.resultManifestId,
      references: [request.resultPackage.resultManifestId],
    });

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        claims: Object.freeze(proposed.claims),
        locale: proposed.locale,
        adapterUsed: true,
        ...(proposed.rationale === undefined ? {} : { rationale: proposed.rationale }),
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
  if (!created.accepted) throw new Error(`INVALID_DEFAULT_NARRATIVE_POLICY:${created.code}`);
  return created.value;
}
