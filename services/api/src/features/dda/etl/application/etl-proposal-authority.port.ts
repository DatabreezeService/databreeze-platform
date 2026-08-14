import type { DdaEtlPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { EtlReviewContextV1 } from './etl-proposal-repository.port.js';

export const ETL_PROPOSAL_AUTHORITY_PORT = Symbol('ETL_PROPOSAL_AUTHORITY_PORT');

export type EtlProposalAuthorityFailureCodeV1 =
  | 'FORBIDDEN'
  | 'AUTHORIZATION_UNAVAILABLE'
  | 'RESOURCE_UNAVAILABLE'
  | 'RESOURCE_SCOPE_DENIED';

export interface EtlProposalAuthorityValueV1 {
  /** Complete server-resolved plan input. Client references must never be merged into it. */
  readonly planInput: Record<string, unknown>;
  /** Server-produced review evidence; client review is treated as a request only. */
  readonly reviewContext: EtlReviewContextV1;
}

export type EtlProposalAuthorityResolveResultV1 =
  | { readonly accepted: true; readonly value: EtlProposalAuthorityValueV1 }
  | { readonly accepted: false; readonly code: EtlProposalAuthorityFailureCodeV1 };

/** IAE/DSM-owned resolution of every versioned ETL input and policy reference. */
export interface EtlProposalResourceResolverPortV1 {
  resolve(input: {
    readonly context: IamTenantContextV1;
    readonly planInput: Record<string, unknown>;
    readonly reviewContext: EtlReviewContextV1;
  }): Promise<EtlProposalAuthorityResolveResultV1>;
  reauthorize(input: {
    readonly context: IamTenantContextV1;
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly plan: DdaEtlPlanV1;
  }): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly code: EtlProposalAuthorityFailureCodeV1 }
  >;
}

export interface EtlProposalAuthorityPortV1 {
  authorizeAndResolve(input: {
    readonly context: IamTenantContextV1;
    readonly action: 'ETL_PROPOSE';
    readonly planInput: Record<string, unknown>;
    readonly reviewContext: EtlReviewContextV1;
  }): Promise<EtlProposalAuthorityResolveResultV1>;
  reauthorize(input: {
    readonly context: IamTenantContextV1;
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly plan: DdaEtlPlanV1;
  }): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly code: EtlProposalAuthorityFailureCodeV1 }
  >;
}

/** Missing IAE/DSM resolution is an unavailable foundation, never an implicit allow. */
export class UnavailableEtlProposalAuthorityAdapter implements EtlProposalAuthorityPortV1 {
  public authorizeAndResolve(input: {
    readonly context: IamTenantContextV1;
    readonly action: 'ETL_PROPOSE';
    readonly planInput: Record<string, unknown>;
    readonly reviewContext: EtlReviewContextV1;
  }): Promise<EtlProposalAuthorityResolveResultV1> {
    void input;
    return Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
  }

  public reauthorize(input: {
    readonly context: IamTenantContextV1;
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly plan: DdaEtlPlanV1;
  }): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly code: EtlProposalAuthorityFailureCodeV1 }
  > {
    void input;
    return Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
  }
}
