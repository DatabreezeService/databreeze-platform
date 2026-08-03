import type { MfaStateV1 } from '@databreeze/domain/mfa/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  MfaRepositoryPortV1,
  MfaTransactionPortV1,
} from '../application/mfa-repository.port.js';

function cloneState(state: MfaStateV1): MfaStateV1 {
  return Object.freeze({
    factors: Object.freeze(state.factors.map((factor) => Object.freeze({ ...factor }))),
    recoveryCodes: Object.freeze(state.recoveryCodes.map((code) => Object.freeze({ ...code }))),
  });
}

function immutableState(existing: MfaStateV1, next: MfaStateV1): boolean {
  const existingFactors = new Map(existing.factors.map((factor) => [factor.id, factor]));
  const existingCodes = new Map(existing.recoveryCodes.map((code) => [code.id, code]));
  if (
    existing.factors.some((factor) => !next.factors.some((candidate) => candidate.id === factor.id))
  )
    return false;
  if (
    existing.recoveryCodes.some(
      (code) => !next.recoveryCodes.some((candidate) => candidate.id === code.id),
    )
  )
    return false;
  for (const factor of next.factors) {
    const prior = existingFactors.get(factor.id);
    if (
      prior &&
      (prior.userId !== factor.userId || prior.secretReference !== factor.secretReference)
    )
      return false;
    if (
      prior &&
      JSON.stringify(prior) !== JSON.stringify(factor) &&
      factor.revision !== prior.revision + 1
    )
      return false;
    if (!prior && factor.revision !== 1) return false;
  }
  for (const code of next.recoveryCodes) {
    const prior = existingCodes.get(code.id);
    if (prior && (prior.userId !== code.userId || prior.digest !== code.digest)) return false;
    if (
      prior &&
      JSON.stringify(prior) !== JSON.stringify(code) &&
      code.revision !== prior.revision + 1
    )
      return false;
    if (!prior && code.revision !== 1) return false;
  }
  return true;
}

/** In-memory MFA state adapter; secrets remain opaque references and codes remain digests. */
export class InMemoryMfaRepositoryAdapter implements MfaRepositoryPortV1 {
  private states = new Map<string, MfaStateV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async findState(userId: StableIdentifierV1): Promise<MfaStateV1> {
    await Promise.resolve();
    return cloneState(this.states.get(userId) ?? { factors: [], recoveryCodes: [] });
  }

  public async saveState(userId: StableIdentifierV1, state: MfaStateV1): Promise<void> {
    await Promise.resolve();
    const existing = this.states.get(userId);
    if (
      !state.factors.every((factor) => factor.userId === userId) ||
      !state.recoveryCodes.every((code) => code.userId === userId)
    )
      throw new Error('IAM_MFA_SCOPE_MISMATCH');
    if (existing && !immutableState(existing, state)) throw new Error('IAM_MFA_REVISION_CONFLICT');
    this.states.set(userId, cloneState(state));
  }

  public async withTransaction<TValue>(
    work: (transaction: MfaTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.states);
    try {
      return await work({
        findState: this.findState.bind(this),
        saveState: this.saveState.bind(this),
      });
    } catch (error) {
      this.states = before;
      throw error;
    } finally {
      release();
    }
  }
}
