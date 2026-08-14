import {
  createDdaAiEgressPolicyV1,
  evaluateDdaAiEgressV1,
  brandUntrustedSourceContentV1,
  authorizeUntrustedContentV1,
  deterministicCapabilitiesWhenAiUnavailableV1,
  type DdaAiEgressPolicyV1,
} from '@databreeze/domain/data-to-dashboard/policy-v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { DdaAudComposePortV1, DdaBuaPortV1 } from '../../application/foundation-ports.js';
import { ALLOWED_MAPPING_TRANSFORM_KINDS } from '../adapter/openai-mapping-output.schema.js';
import type {
  MappingAssistanceErrorCodeV1,
  MappingAssistancePortV1,
  MappingAssistanceRequestV1,
  MappingAssistanceResultV1,
  MappingAssistanceSuggestionV1,
} from './mapping-assistance.port.js';

const ALLOWED_KINDS = new Set<string>(ALLOWED_MAPPING_TRANSFORM_KINDS);

export interface MappingAssistancePolicyStoreV1 {
  getPolicy(tenantScope: TenantScopeV1): DdaAiEgressPolicyV1 | undefined;
  isTenantRevoked(tenantScope: TenantScopeV1): boolean;
}

function rejected(code: MappingAssistanceErrorCodeV1): MappingAssistanceResultV1 {
  return Object.freeze({ accepted: false, code });
}

function isHostileToken(value: string): boolean {
  return /ignore previous|publish_dashboard|DROP TABLE|SELECT \*|eval\(|<\/?script/iu.test(value);
}

function validateSuggestion(
  raw: MappingAssistanceSuggestionV1,
  request: MappingAssistanceRequestV1,
): MappingAssistanceSuggestionV1 | undefined {
  if (!ALLOWED_KINDS.has(raw.transformKind)) return undefined;
  if (!request.headers.includes(raw.sourceField)) return undefined;
  if (!request.targetFields.includes(raw.targetField)) return undefined;
  if (isHostileToken(raw.label) || isHostileToken(raw.summary) || isHostileToken(raw.rationale)) {
    return undefined;
  }
  return Object.freeze({
    ...raw,
    authoritative: false as const,
  });
}

/** DDA-005/006/008/010/011/036/043-045: governed mapping suggestions, never accepted plans. */
export class MappingAssistanceServiceV1 {
  public constructor(
    private readonly adapter: MappingAssistancePortV1,
    private readonly options: {
      readonly policyStore?: MappingAssistancePolicyStoreV1;
      readonly bua?: DdaBuaPortV1;
      readonly aud?: DdaAudComposePortV1;
      readonly killSwitchEnv?: () => string | undefined;
      readonly maxPayloadBytes?: number;
    } = {},
  ) {}

  public fallbackCapabilities(): readonly string[] {
    return deterministicCapabilitiesWhenAiUnavailableV1();
  }

  public async suggest(request: MappingAssistanceRequestV1): Promise<MappingAssistanceResultV1> {
    if (this.options.policyStore?.isTenantRevoked(request.tenantScope)) {
      return rejected('AI_EGRESS_DENIED');
    }
    if (!request.samplePermissionGranted) return rejected('SAMPLE_PERMISSION_DENIED');
    const maxBytes = this.options.maxPayloadBytes ?? 32_768;
    if (request.payloadBytes > maxBytes) return rejected('PAYLOAD_TOO_LARGE');

    for (const header of request.headers) {
      const branded = brandUntrustedSourceContentV1(header);
      if (!branded) return rejected('HOSTILE_CONTENT_REJECTED');
      // Untrusted headers/cells cannot elevate into system/tool/plan boundaries.
      const elevation = authorizeUntrustedContentV1(branded, 'SYSTEM_INSTRUCTION');
      if (elevation.accepted) return rejected('HOSTILE_CONTENT_REJECTED');
      if (isHostileToken(header)) {
        // Hostile headers remain usable for manual mapping; AI path fails closed.
        return rejected('HOSTILE_CONTENT_REJECTED');
      }
    }

    const kill = (
      this.options.killSwitchEnv ?? (() => process.env['DATABREEZE_OPENAI_MAPPING_ENABLED'])
    )();
    if (kill === 'false') return rejected('ADAPTER_DISABLED');

    const policy =
      this.options.policyStore?.getPolicy(request.tenantScope) ??
      defaultDeniedPolicy(request.tenantScope);
    if (!policy.purposeAllowlist.includes('MAPPING_SUGGESTION')) {
      return rejected('PURPOSE_DENIED');
    }
    if (!policy.allowSamples || !policy.allowMetadata) return rejected('AI_EGRESS_DENIED');
    const evaluated = evaluateDdaAiEgressV1(policy, {
      adapter: 'openai-responses',
      purpose: 'MAPPING_SUGGESTION',
      payloadBytes: request.payloadBytes,
      includesSamples: true,
    });
    if (!evaluated.accepted) return rejected('AI_EGRESS_DENIED');

    let reservationId: string | undefined;
    if (this.options.bua) {
      try {
        const reservation = await this.options.bua.reserveCapacity({
          reference: {
            id: request.schemaVersionId,
            tenantScope: request.tenantScope,
          },
          usageClass: 'MAPPING_SUGGESTION',
          requestUnits: 1,
          imageBytes: 0,
          textTokensEstimate: Math.ceil(request.payloadBytes / 4),
          retryBudget: 0,
          costUnitsEstimate: 1,
        });
        reservationId = reservation.reservationId;
      } catch {
        return rejected('BUDGET_DENIED');
      }
    }

    const available = await this.adapter.isAvailable();
    if (!available) {
      if (reservationId && this.options.bua) {
        await this.options.bua.finalizeReservation({
          reservationId,
          reference: { id: request.schemaVersionId, tenantScope: request.tenantScope },
          outcome: 'DENIED',
        });
      }
      return rejected('ADAPTER_UNAVAILABLE');
    }

    const proposed = await this.adapter.suggestMappings(request);
    if (proposed.status !== 'PROPOSED') {
      if (reservationId && this.options.bua) {
        await this.options.bua.finalizeReservation({
          reservationId,
          reference: { id: request.schemaVersionId, tenantScope: request.tenantScope },
          outcome: 'FAILED',
        });
      }
      await this.options.aud?.emitContentSafeSummary({
        tenantScope: request.tenantScope,
        action: 'DDA_MAPPING_ASSISTANCE',
        outcome: 'FAILED',
        correlationId: request.schemaVersionId,
        references: [request.schemaVersionId, request.profileVersionId],
      });
      return rejected(proposed.code);
    }

    const suggestions: MappingAssistanceSuggestionV1[] = [];
    for (const item of proposed.suggestions) {
      const validated = validateSuggestion(item, request);
      if (validated) suggestions.push(validated);
    }
    if (suggestions.length === 0 && proposed.suggestions.length > 0) {
      return rejected('INVALID_SUGGESTION');
    }

    if (reservationId && this.options.bua) {
      await this.options.bua.finalizeReservation({
        reservationId,
        reference: { id: request.schemaVersionId, tenantScope: request.tenantScope },
        outcome: 'SUCCEEDED',
      });
    }
    await this.options.aud?.emitContentSafeSummary({
      tenantScope: request.tenantScope,
      action: 'DDA_MAPPING_ASSISTANCE',
      outcome: 'SUCCEEDED',
      correlationId: request.schemaVersionId,
      references: [request.schemaVersionId, request.profileVersionId],
    });

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        suggestions: Object.freeze(suggestions),
        adapterUsed: true,
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
  if (!created.accepted) throw new Error(`INVALID_DEFAULT_MAPPING_POLICY:${created.code}`);
  return created.value;
}
