import {
  createMfaFactorV1,
  redeemRecoveryCodeV1,
  requiresStepUpV1,
  transitionMfaFactorV1,
  type MfaResultV1,
  type MfaStateV1,
} from '@databreeze/domain/mfa/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { MfaRepositoryPortV1 } from './mfa-repository.port.js';

export const MFA_SERVICE = Symbol('MFA_SERVICE');

function invalidState(): MfaResultV1<never> {
  return Object.freeze({ accepted: false, code: 'INVALID_STATE' });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const result = parseStableIdentifierV1(input);
  return result.accepted ? result.value : undefined;
}

export interface MfaStateViewV1 {
  readonly factors: readonly Readonly<
    Pick<
      MfaStateV1['factors'][number],
      'id' | 'userId' | 'method' | 'status' | 'enrolledAt' | 'verifiedAt' | 'revokedAt' | 'revision'
    >
  >[];
  readonly recoveryCodesRemaining: number;
}

function view(state: MfaStateV1): MfaStateViewV1 {
  return Object.freeze({
    factors: Object.freeze(
      state.factors.map(
        ({ id, userId, method, status, enrolledAt, verifiedAt, revokedAt, revision }) =>
          Object.freeze({
            id,
            userId,
            method,
            status,
            enrolledAt,
            ...(verifiedAt ? { verifiedAt } : {}),
            ...(revokedAt ? { revokedAt } : {}),
            revision,
          }),
      ),
    ),
    recoveryCodesRemaining: state.recoveryCodes.filter((code) => code.status === 'AVAILABLE')
      .length,
  });
}

/** Application boundary for MFA enrollment, recovery redemption, and step-up policy. */
export class MfaService {
  public constructor(
    private readonly repository: MfaRepositoryPortV1,
    private readonly recoveryMatcher: {
      matches(presentedDigest: string, storedDigest: string): boolean;
    },
  ) {}

  public async enroll(
    input: Parameters<typeof createMfaFactorV1>[0],
  ): Promise<MfaResultV1<MfaStateViewV1>> {
    const factor = createMfaFactorV1(input);
    if (!factor.accepted) return Object.freeze({ accepted: false, code: factor.code });
    return this.repository.withTransaction(async (transaction) => {
      const state = await transaction.findState(factor.value.userId);
      await transaction.saveState(factor.value.userId, {
        factors: [...state.factors, factor.value],
        recoveryCodes: state.recoveryCodes,
      });
      return Object.freeze({
        accepted: true,
        value: view({
          factors: [...state.factors, factor.value],
          recoveryCodes: state.recoveryCodes,
        }),
      });
    });
  }

  public async verifyFactor(
    userIdInput: unknown,
    factorIdInput: unknown,
    at: unknown,
  ): Promise<MfaResultV1<MfaStateViewV1>> {
    const userId = stable(userIdInput);
    const factorId = stable(factorIdInput);
    if (!userId || !factorId) return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' });
    return this.repository.withTransaction(async (transaction) => {
      const state = await transaction.findState(userId);
      const factor = state.factors.find((item) => item.id === factorId);
      if (!factor) return invalidState();
      const transitioned = transitionMfaFactorV1(factor, 'VERIFY', at);
      if (!transitioned.accepted)
        return Object.freeze({ accepted: false, code: transitioned.code });
      const next = Object.freeze({
        factors: state.factors.map((item) => (item.id === factorId ? transitioned.value : item)),
        recoveryCodes: state.recoveryCodes,
      });
      await transaction.saveState(userId, next);
      return Object.freeze({ accepted: true, value: view(next) });
    });
  }

  public async redeemRecovery(
    userIdInput: unknown,
    presentedDigest: unknown,
    at: unknown,
  ): Promise<MfaResultV1<MfaStateViewV1>> {
    const userId = stable(userIdInput);
    if (!userId) return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' });
    return this.repository.withTransaction(async (transaction) => {
      const state = await transaction.findState(userId);
      const redeemed = redeemRecoveryCodeV1(
        state,
        { userId, presentedDigest, at },
        this.recoveryMatcher,
      );
      if (!redeemed.accepted) return Object.freeze({ accepted: false, code: redeemed.code });
      await transaction.saveState(userId, redeemed.value);
      return Object.freeze({ accepted: true, value: view(redeemed.value) });
    });
  }

  public requireStepUp(
    risk: unknown,
    assertion: Parameters<typeof requiresStepUpV1>[1],
    principalId: StableIdentifierV1,
    now: unknown,
  ): MfaResultV1<true> {
    return requiresStepUpV1(risk, assertion, principalId, now);
  }
}
