import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';
import {
  createDdaEtlPlanV1,
  DDA_SCHEMA_VERSION_V1,
  type DdaEtlPlanV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import { tenantScopesEqualV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  authorizeIamDdaMutationV1,
  parseExactStableIdentifierV1,
  parseExactTenantScopeV1,
  type IamDdaMutationAuthorizationSourceV1,
} from '../../adapter/iam-dda-mutation-authorization.source.js';
import type {
  EtlProposalAuthorityPortV1,
  EtlProposalAuthorityResolveResultV1,
  EtlProposalResourceResolverPortV1,
} from '../application/etl-proposal-authority.port.js';
import type { EtlReviewContextV1 } from '../application/etl-proposal-repository.port.js';

function unavailable(): EtlProposalAuthorityResolveResultV1 {
  return { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactReference(value: unknown): boolean {
  return parseExactStableIdentifierV1(value) !== undefined;
}

const PLAN_REFERENCE_KEYS = [
  'planId',
  'planVersionId',
  'inputArtifactVersionId',
  'schemaVersionId',
  'mappingVersionId',
  'ruleSetVersionId',
  'engineBindingId',
  'dataModePolicyVersionId',
  'retentionReferenceId',
  'evidenceReferenceId',
] as const;

function isCanonicalPlanInput(
  value: unknown,
  tenantScope: TenantScopeV1,
  expectedArtifactVersionId?: string,
): value is Record<string, unknown> {
  if (!isRecord(value) || value['schemaVersion'] !== DDA_SCHEMA_VERSION_V1) return false;
  const parsedScope = parseExactTenantScopeV1(value['tenantScope']);
  if (parsedScope === undefined || !tenantScopesEqualV1(parsedScope, tenantScope)) return false;
  if (!PLAN_REFERENCE_KEYS.every((key) => exactReference(value[key]))) return false;
  if (
    expectedArtifactVersionId !== undefined &&
    value['inputArtifactVersionId'] !== expectedArtifactVersionId
  ) {
    return false;
  }
  const created = createDdaEtlPlanV1({
    planId: value['planId'],
    planVersionId: value['planVersionId'],
    tenantScope: value['tenantScope'],
    inputArtifactVersionId: value['inputArtifactVersionId'],
    schemaVersionId: value['schemaVersionId'],
    mappingVersionId: value['mappingVersionId'],
    ruleSetVersionId: value['ruleSetVersionId'],
    engineBindingId: value['engineBindingId'],
    transformations: value['transformations'],
    contentHash: value['contentHash'],
    schemaHash: value['schemaHash'],
    dataClassification: value['dataClassification'],
    dataModePolicyVersionId: value['dataModePolicyVersionId'],
    retentionReferenceId: value['retentionReferenceId'],
    evidenceReferenceId: value['evidenceReferenceId'],
    createdAt: value['createdAt'],
  });
  if (!created.accepted) return false;
  return PLAN_REFERENCE_KEYS.every((key) => created.value[key] === value[key]);
}

function isCanonicalResolvedValue(
  value: unknown,
  tenantScope: TenantScopeV1,
  expectedArtifactVersionId: string,
): value is {
  readonly planInput: Record<string, unknown>;
  readonly reviewContext: EtlReviewContextV1;
} {
  if (!isRecord(value)) return false;
  const planInput = value['planInput'];
  const reviewContext = value['reviewContext'];
  if (!isRecord(planInput) || !isRecord(reviewContext)) return false;
  return isCanonicalPlanInput(planInput, tenantScope, expectedArtifactVersionId);
}

function mapAuthorizationFailure(
  result: Awaited<ReturnType<typeof authorizeIamDdaMutationV1>>,
): EtlProposalAuthorityResolveResultV1 | undefined {
  if (result.accepted) return undefined;
  return {
    accepted: false,
    code: result.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'AUTHORIZATION_UNAVAILABLE',
  };
}

/**
 * ETL_PROPOSE is a server action. The canonical IAM permission is derived-artifact
 * creation over the exact input artifact; IAE/DSM resolution then supplies every
 * immutable version and policy reference used by the proposal.
 */
export class IamEtlProposalAuthorityAdapter implements EtlProposalAuthorityPortV1 {
  public constructor(
    private readonly source: IamDdaMutationAuthorizationSourceV1,
    private readonly resolver: EtlProposalResourceResolverPortV1,
  ) {}

  public async authorizeAndResolve(input: {
    readonly context: Parameters<IamDdaMutationAuthorizationSourceV1['authorize']>[0]['context'];
    readonly action: 'ETL_PROPOSE';
    readonly planInput: Record<string, unknown>;
    readonly reviewContext: EtlReviewContextV1;
  }): Promise<EtlProposalAuthorityResolveResultV1> {
    if (input.action !== 'ETL_PROPOSE' || !isRecord(input.planInput)) return unavailable();
    const artifactVersionId = parseExactStableIdentifierV1(
      input.planInput['inputArtifactVersionId'],
    );
    if (artifactVersionId === undefined) return unavailable();
    const decision = await authorizeIamDdaMutationV1(
      this.source,
      input.context,
      PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE,
      [artifactVersionId],
    );
    const authorizationFailure = mapAuthorizationFailure(decision);
    if (authorizationFailure !== undefined) return authorizationFailure;

    let resolved: EtlProposalAuthorityResolveResultV1;
    try {
      resolved = await this.resolver.resolve({
        context: input.context,
        planInput: input.planInput,
        reviewContext: input.reviewContext,
      });
    } catch {
      return unavailable();
    }
    if (!resolved.accepted) return resolved;
    const canonicalScope = parseExactTenantScopeV1(resolved.value.planInput['tenantScope']);
    if (
      canonicalScope === undefined ||
      !tenantScopesEqualV1(canonicalScope, input.context.tenantScope) ||
      !isCanonicalResolvedValue(resolved.value, input.context.tenantScope, artifactVersionId)
    ) {
      return { accepted: false, code: 'RESOURCE_SCOPE_DENIED' };
    }
    return resolved;
  }

  public async reauthorize(input: {
    readonly context: Parameters<IamDdaMutationAuthorizationSourceV1['authorize']>[0]['context'];
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly plan: DdaEtlPlanV1;
  }) {
    if (
      parseExactStableIdentifierV1(input.proposalId) === undefined ||
      !Number.isSafeInteger(input.proposalRevision) ||
      input.proposalRevision <= 0 ||
      !isCanonicalPlanInput(input.plan, input.context.tenantScope)
    ) {
      return { accepted: false as const, code: 'RESOURCE_SCOPE_DENIED' as const };
    }
    const decision = await authorizeIamDdaMutationV1(
      this.source,
      input.context,
      PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE,
      [input.plan.inputArtifactVersionId],
    );
    const authorizationFailure = mapAuthorizationFailure(decision);
    if (authorizationFailure !== undefined) return authorizationFailure;
    try {
      const resolved = await this.resolver.reauthorize(input);
      return resolved;
    } catch {
      return { accepted: false as const, code: 'AUTHORIZATION_UNAVAILABLE' as const };
    }
  }
}
