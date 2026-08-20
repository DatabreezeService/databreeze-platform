import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

export const IAM_PROFILE_MUTATION_SERVICE = Symbol('IAM_PROFILE_MUTATION_SERVICE');

export type ProfileLocaleV1 = 'vi-VN' | 'en';

export interface ProfileMutationInputV1 {
  readonly actorId: StableIdentifierV1;
  readonly displayName: string;
  readonly locale: ProfileLocaleV1;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
}

export interface ProfileMutationAcceptedV1 {
  readonly accepted: true;
  readonly value: {
    readonly userId: StableIdentifierV1;
    readonly displayName: string;
    readonly locale: ProfileLocaleV1;
    readonly revision: number;
  };
  readonly replayed?: boolean;
}

export type ProfileMutationResultV1 =
  | ProfileMutationAcceptedV1
  | {
      readonly accepted: false;
      readonly code:
        | 'INVALID_INPUT'
        | 'UNAUTHORIZED'
        | 'NOT_FOUND'
        | 'REVISION_CONFLICT'
        | 'IDEMPOTENCY_CONFLICT'
        | 'UNAVAILABLE';
    };

export interface ProfileMutationPortV1 {
  update(input: ProfileMutationInputV1): Promise<ProfileMutationResultV1>;
}
