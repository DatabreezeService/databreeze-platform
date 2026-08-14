import type { StableIdentifierV1, TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  AutomaticPreparationExpectedV1,
  AutomaticPreparationProfileV1,
} from './automatic-preparation-policy.js';

export const AUTOMATIC_PREPARATION_PROFILE_AUTHORITY_PORT = Symbol(
  'AUTOMATIC_PREPARATION_PROFILE_AUTHORITY_PORT',
);
export const AUTOMATIC_PREPARATION_POLICY_AUTHORITY_PORT = Symbol(
  'AUTOMATIC_PREPARATION_POLICY_AUTHORITY_PORT',
);
export const AUTOMATIC_PREPARATION_DATASET_AUTHORITY_PORT = Symbol(
  'AUTOMATIC_PREPARATION_DATASET_AUTHORITY_PORT',
);

export type AutomaticPreparationAuthorityProblemCodeV1 =
  | 'DDA_ETL_PROFILE_UNAVAILABLE'
  | 'DDA_ETL_PROFILE_INVALID'
  | 'DDA_ETL_POLICY_UNAVAILABLE'
  | 'DDA_ETL_UNAUTHORIZED'
  | 'DDA_ETL_DATASET_UNAVAILABLE'
  | 'DDA_ETL_SCOPE_MISMATCH';

export type AutomaticPreparationAuthorityResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: AutomaticPreparationAuthorityProblemCodeV1 };

export interface AutomaticPreparationProfileAuthorityValueV1 {
  readonly tenantScope: TenantScopeV1;
  readonly proposalId: StableIdentifierV1;
  readonly proposalRevision: number;
  readonly planVersionId: StableIdentifierV1;
  readonly inputArtifactVersionId: StableIdentifierV1;
  readonly profileId: StableIdentifierV1;
  readonly profileVersionId: StableIdentifierV1;
  readonly engineProduced: true;
  readonly immutable: true;
  readonly profile: AutomaticPreparationProfileV1;
  readonly expected: AutomaticPreparationExpectedV1;
}

export interface AutomaticPreparationProfileAuthorityPortV1 {
  resolve(input: {
    readonly tenantScope: TenantScopeV1;
    readonly actorId: StableIdentifierV1;
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly planVersionId: string;
    readonly inputArtifactVersionId: string;
  }): Promise<AutomaticPreparationAuthorityResultV1<AutomaticPreparationProfileAuthorityValueV1>>;
}

export interface AutomaticPreparationPolicyAuthorityValueV1 {
  readonly tenantScope: TenantScopeV1;
  readonly authorized: true;
  readonly policyVersionId: StableIdentifierV1;
  readonly automaticPolicy: 'SAFE_NON_LOSSY' | 'NONE';
  readonly authorizationEpoch: number;
}

export interface AutomaticPreparationPolicyAuthorityPortV1 {
  resolve(input: {
    readonly tenantScope: TenantScopeV1;
    readonly actorId: StableIdentifierV1;
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly inputArtifactVersionId: string;
    readonly policyVersionId: string;
  }): Promise<AutomaticPreparationAuthorityResultV1<AutomaticPreparationPolicyAuthorityValueV1>>;
  recheck(input: {
    readonly tenantScope: TenantScopeV1;
    readonly actorId: StableIdentifierV1;
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly inputArtifactVersionId: string;
    readonly policyVersionId: string;
    readonly authorizationEpoch: number;
  }): Promise<AutomaticPreparationAuthorityResultV1<AutomaticPreparationPolicyAuthorityValueV1>>;
}

export interface AutomaticPreparationDatasetAuthorityValueV1 {
  readonly tenantScope: TenantScopeV1;
  readonly datasetId: StableIdentifierV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly inputArtifactVersionId: StableIdentifierV1;
  readonly sourceColumns: readonly string[];
  readonly contentHash: string;
  readonly schemaHash: string;
  readonly lineageIds: readonly StableIdentifierV1[];
  readonly immutableOriginal: true;
}

export interface AutomaticPreparationDatasetAuthorityPortV1 {
  resolve(input: {
    readonly tenantScope: TenantScopeV1;
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly inputArtifactVersionId: string;
  }): Promise<AutomaticPreparationAuthorityResultV1<AutomaticPreparationDatasetAuthorityValueV1>>;
}

export class UnavailableAutomaticPreparationProfileAuthorityAdapter
  implements AutomaticPreparationProfileAuthorityPortV1
{
  public resolve(input: Parameters<AutomaticPreparationProfileAuthorityPortV1['resolve']>[0]) {
    void input;
    return Promise.resolve({
      accepted: false as const,
      code: 'DDA_ETL_PROFILE_UNAVAILABLE' as const,
    });
  }
}

export class UnavailableAutomaticPreparationPolicyAuthorityAdapter
  implements AutomaticPreparationPolicyAuthorityPortV1
{
  public resolve(input: Parameters<AutomaticPreparationPolicyAuthorityPortV1['resolve']>[0]) {
    void input;
    return Promise.resolve({
      accepted: false as const,
      code: 'DDA_ETL_POLICY_UNAVAILABLE' as const,
    });
  }

  public recheck(input: Parameters<AutomaticPreparationPolicyAuthorityPortV1['recheck']>[0]) {
    void input;
    return Promise.resolve({
      accepted: false as const,
      code: 'DDA_ETL_POLICY_UNAVAILABLE' as const,
    });
  }
}

export class UnavailableAutomaticPreparationDatasetAuthorityAdapter
  implements AutomaticPreparationDatasetAuthorityPortV1
{
  public resolve(input: Parameters<AutomaticPreparationDatasetAuthorityPortV1['resolve']>[0]) {
    void input;
    return Promise.resolve({
      accepted: false as const,
      code: 'DDA_ETL_DATASET_UNAVAILABLE' as const,
    });
  }
}
