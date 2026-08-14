import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  AnalysisCatalogAuthorityPortV1,
  AnalysisCatalogAuthorityRequestV1,
  AnalysisCatalogAuthorityResultV1,
  AnalysisCatalogAuthoritySnapshotV1,
  AnalysisCatalogRequestV1,
  AnalysisCatalogResolutionResultV1,
  AnalysisCatalogResolverV1,
  AnalysisCatalogV1,
  AnalysisNonAnswerReasonV1,
} from './analysis-catalog.port.js';

function rejected(code: AnalysisNonAnswerReasonV1): AnalysisCatalogResolutionResultV1 {
  return Object.freeze({ accepted: false, code });
}

function parseId(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function isNonAnswerReason(input: unknown): input is AnalysisNonAnswerReasonV1 {
  return (
    input === 'AMBIGUOUS_REQUEST' ||
    input === 'INSUFFICIENT_DATA' ||
    input === 'UNAUTHORIZED_DATA' ||
    input === 'STALE_INPUT' ||
    input === 'QUALITY_BLOCKED' ||
    input === 'SOURCE_UNAVAILABLE' ||
    input === 'UNSUPPORTED_PLAN' ||
    input === 'BUDGET_DENIED' ||
    input === 'ADAPTER_UNAVAILABLE'
  );
}

function validTextList(input: unknown, maximum: number): input is readonly string[] {
  if (!Array.isArray(input) || input.length > maximum) return false;
  const seen = new Set<string>();
  for (const item of input) {
    if (
      typeof item !== 'string' ||
      item.length === 0 ||
      item.length > 128 ||
      /\p{Cc}/u.test(item)
    ) {
      return false;
    }
    if (seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

function validUnits(
  input: unknown,
  authorizedFields: readonly string[],
): input is Readonly<Record<string, string>> {
  if (!isRecord(input)) return false;
  const fields = new Set(authorizedFields);
  for (const [field, unit] of Object.entries(input)) {
    if (!fields.has(field) || typeof unit !== 'string' || unit.length === 0 || unit.length > 64) {
      return false;
    }
  }
  return true;
}

function canonicalRequest(
  context: IamTenantContextV1,
  input: AnalysisCatalogRequestV1,
):
  | { readonly accepted: true; readonly value: AnalysisCatalogAuthorityRequestV1 }
  | { readonly accepted: false; readonly code: 'INSUFFICIENT_DATA' | 'UNAUTHORIZED_DATA' } {
  const datasetVersionId = parseId(input.datasetVersionId);
  const semanticVersionId = parseId(input.semanticVersionId);
  const metricVersionId = parseId(input.metricVersionId);
  const permissionProjectionVersionId = parseId(input.permissionProjectionVersionId);
  if (
    !datasetVersionId ||
    !semanticVersionId ||
    !metricVersionId ||
    !permissionProjectionVersionId
  ) {
    return Object.freeze({ accepted: false, code: 'INSUFFICIENT_DATA' as const });
  }
  if (input.memberId !== undefined) {
    const memberId = parseId(input.memberId);
    if (!memberId || memberId !== context.actorId) {
      return Object.freeze({ accepted: false, code: 'UNAUTHORIZED_DATA' as const });
    }
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      datasetVersionId,
      semanticVersionId,
      metricVersionId,
      permissionProjectionVersionId,
      memberId: context.actorId,
    }),
  });
}

function mapAuthorityStatus(
  result: AnalysisCatalogAuthorityResultV1,
): AnalysisCatalogResolutionResultV1 | undefined {
  if (result.status === 'UNAVAILABLE') return rejected('SOURCE_UNAVAILABLE');
  if (result.status === 'STALE') return rejected('STALE_INPUT');
  if (result.status === 'RESTRICTED' || result.status === 'NOT_FOUND') {
    return rejected('UNAUTHORIZED_DATA');
  }
  return undefined;
}

function validateSnapshot(
  context: IamTenantContextV1,
  request: AnalysisCatalogAuthorityRequestV1,
  snapshot: AnalysisCatalogAuthoritySnapshotV1,
): AnalysisCatalogResolutionResultV1 {
  const parsedScope = parseTenantScopeV1(snapshot.tenantScope);
  const memberId = parseId(snapshot.memberId);
  if (!parsedScope.accepted || !memberId) return rejected('SOURCE_UNAVAILABLE');
  if (
    !tenantScopesEqualV1(context.tenantScope, parsedScope.value) ||
    memberId !== context.actorId
  ) {
    return rejected('UNAUTHORIZED_DATA');
  }
  if (
    !Number.isSafeInteger(snapshot.authorizationEpoch) ||
    snapshot.authorizationEpoch !== context.authorizationEpoch
  ) {
    return rejected('STALE_INPUT');
  }
  if (snapshot.versionState !== 'CURRENT') return rejected('STALE_INPUT');

  const catalogIds = [
    snapshot.datasetVersionId,
    snapshot.semanticVersionId,
    snapshot.metricVersionId,
    snapshot.permissionProjectionVersionId,
  ].map(parseId);
  if (catalogIds.some((value) => value === undefined)) return rejected('SOURCE_UNAVAILABLE');
  if (
    catalogIds[0] !== request.datasetVersionId ||
    catalogIds[1] !== request.semanticVersionId ||
    catalogIds[2] !== request.metricVersionId ||
    catalogIds[3] !== request.permissionProjectionVersionId
  ) {
    return rejected('STALE_INPUT');
  }
  if (!validTextList(snapshot.authorizedFields, 256)) return rejected('SOURCE_UNAVAILABLE');
  if (!validTextList(snapshot.authorizedJoins, 64)) return rejected('SOURCE_UNAVAILABLE');
  if (!validTextList(snapshot.grains, 16)) return rejected('SOURCE_UNAVAILABLE');
  if (!validUnits(snapshot.units, snapshot.authorizedFields)) return rejected('SOURCE_UNAVAILABLE');
  if (snapshot.blockedReason !== undefined && !isNonAnswerReason(snapshot.blockedReason)) {
    return rejected('SOURCE_UNAVAILABLE');
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      ...snapshot,
      tenantScope: parsedScope.value,
      memberId,
      authorizedFields: Object.freeze([...snapshot.authorizedFields]),
      authorizedJoins: Object.freeze([...snapshot.authorizedJoins]),
      grains: Object.freeze([...snapshot.grains]),
      units: Object.freeze({ ...snapshot.units }),
    }),
  });
}

/** Resolves fresh IAM/DSM/permission state before every analysis proposal. */
export class AnalysisCatalogResolverServiceV1 implements AnalysisCatalogResolverV1 {
  public constructor(private readonly authority: AnalysisCatalogAuthorityPortV1) {}

  public async resolve(
    context: IamTenantContextV1,
    input: AnalysisCatalogRequestV1,
  ): Promise<AnalysisCatalogResolutionResultV1> {
    const parsed = canonicalRequest(context, input);
    if (!parsed.accepted) return rejected(parsed.code);
    let result: AnalysisCatalogAuthorityResultV1;
    try {
      result = await this.authority.load(context, parsed.value);
    } catch {
      return rejected('SOURCE_UNAVAILABLE');
    }
    const mapped = mapAuthorityStatus(result);
    if (mapped) return mapped;
    if (result.status !== 'AUTHORIZED') return rejected('SOURCE_UNAVAILABLE');
    return validateSnapshot(context, parsed.value, result.catalog);
  }
}

/** Compatibility only for existing callers awaiting module rewiring; production uses the resolver above. */
export class StaticAnalysisCatalogCompatibilityResolverV1 implements AnalysisCatalogResolverV1 {
  public constructor(private readonly catalog: AnalysisCatalogV1) {}

  public resolve(
    context: IamTenantContextV1,
    input: AnalysisCatalogRequestV1,
  ): Promise<AnalysisCatalogResolutionResultV1> {
    if (
      typeof input.datasetVersionId !== 'string' ||
      typeof input.semanticVersionId !== 'string' ||
      typeof input.metricVersionId !== 'string' ||
      typeof input.permissionProjectionVersionId !== 'string'
    ) {
      return Promise.resolve(rejected('INSUFFICIENT_DATA'));
    }
    if (
      input.datasetVersionId !== this.catalog.datasetVersionId ||
      input.semanticVersionId !== this.catalog.semanticVersionId ||
      input.metricVersionId !== this.catalog.metricVersionId ||
      input.permissionProjectionVersionId !== this.catalog.permissionProjectionVersionId
    ) {
      return Promise.resolve(rejected('STALE_INPUT'));
    }
    return Promise.resolve(
      Object.freeze({
        accepted: true,
        value: Object.freeze({
          ...this.catalog,
          tenantScope: context.tenantScope,
          memberId: context.actorId,
          authorizationEpoch: context.authorizationEpoch,
          versionState: 'CURRENT' as const,
          authorizedFields: Object.freeze([...this.catalog.authorizedFields]),
          authorizedJoins: Object.freeze([...this.catalog.authorizedJoins]),
          grains: Object.freeze([...this.catalog.grains]),
          units: Object.freeze({ ...this.catalog.units }),
        }),
      } satisfies AnalysisCatalogResolutionResultV1),
    );
  }
}

export function asAnalysisCatalogResolverV1(
  source: AnalysisCatalogResolverV1 | AnalysisCatalogAuthorityPortV1 | AnalysisCatalogV1,
): AnalysisCatalogResolverV1 {
  if (typeof source === 'object' && source !== null && 'resolve' in source) {
    return source;
  }
  if (typeof source === 'object' && source !== null && 'load' in source) {
    return new AnalysisCatalogResolverServiceV1(source);
  }
  return new StaticAnalysisCatalogCompatibilityResolverV1(source);
}
