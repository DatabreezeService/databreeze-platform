/** DDA-031: registered processors declare when incremental recomputation is safe. */

export type MaterializationChangeKindV1 =
  | 'APPEND_ROWS'
  | 'REPLACE_ROWS'
  | 'SCHEMA_BREAK'
  | 'PERMISSION_CHANGE'
  | 'DEFINITION_CHANGE'
  | 'PARAMETER_CHANGE';

export type RecomputeModeV1 = 'INCREMENTAL' | 'FULL';

export interface ProcessorRegistrationV1 {
  readonly processorId: string;
  readonly compatibleChangeKinds: readonly MaterializationChangeKindV1[];
  readonly requiresPriorStateProof: boolean;
}

export interface PriorStateProofV1 {
  readonly cacheIdentityHash: string;
  readonly verified: boolean;
}

export interface RecomputeDecisionV1 {
  readonly mode: RecomputeModeV1;
  readonly reason:
    | 'COMPATIBLE_CHANGE_WITH_PRIOR_STATE'
    | 'PRIOR_STATE_UNVERIFIED'
    | 'INCOMPATIBLE_CHANGE_SEMANTICS'
    | 'PROCESSOR_NOT_REGISTERED';
}

export class MaterializationProcessorCatalog {
  readonly #processors = new Map<string, ProcessorRegistrationV1>();

  public register(registration: ProcessorRegistrationV1): void {
    this.#processors.set(
      registration.processorId,
      Object.freeze({
        processorId: registration.processorId,
        compatibleChangeKinds: Object.freeze([...registration.compatibleChangeKinds]),
        requiresPriorStateProof: registration.requiresPriorStateProof,
      }),
    );
  }

  public decideRecompute(input: {
    readonly processorId: string;
    readonly changeKind: MaterializationChangeKindV1;
    readonly priorStateProof?: PriorStateProofV1;
  }): RecomputeDecisionV1 {
    const registration = this.#processors.get(input.processorId);
    if (!registration) {
      return Object.freeze({ mode: 'FULL', reason: 'PROCESSOR_NOT_REGISTERED' });
    }
    if (!registration.compatibleChangeKinds.includes(input.changeKind)) {
      return Object.freeze({ mode: 'FULL', reason: 'INCOMPATIBLE_CHANGE_SEMANTICS' });
    }
    if (registration.requiresPriorStateProof && input.priorStateProof?.verified !== true) {
      return Object.freeze({ mode: 'FULL', reason: 'PRIOR_STATE_UNVERIFIED' });
    }
    return Object.freeze({ mode: 'INCREMENTAL', reason: 'COMPATIBLE_CHANGE_WITH_PRIOR_STATE' });
  }
}
