import {
  createMfaFactorV1,
  createRecoveryCodeV1,
  type MfaFactorV1,
  type MfaStateV1,
  type RecoveryCodeV1,
} from '@databreeze/domain/mfa/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  MfaRepositoryPortV1,
  MfaTransactionPortV1,
} from '../application/mfa-repository.port.js';

export interface MfaFactorDatabaseRowV1 {
  readonly id: string;
  readonly userId: string;
  readonly factorType: string;
  readonly secretReference: string;
  readonly status: string;
  readonly enrolledAt: Date;
  readonly verifiedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revision: number;
}

export interface MfaRecoveryCodeDatabaseRowV1 {
  readonly id: string;
  readonly userId: string;
  readonly digest: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly usedAt: Date | null;
  readonly revision: number;
}

interface MfaFactorDelegateV1 {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly MfaFactorDatabaseRowV1[]>;
  findUnique(input: {
    readonly where: { readonly id: string };
  }): Promise<MfaFactorDatabaseRowV1 | null>;
  create(input: { readonly data: MfaFactorDatabaseRowV1 }): Promise<MfaFactorDatabaseRowV1>;
  update(input: {
    readonly where: { readonly id: string };
    readonly data: Partial<MfaFactorDatabaseRowV1>;
  }): Promise<MfaFactorDatabaseRowV1>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Partial<MfaFactorDatabaseRowV1>;
  }): Promise<{ readonly count: number }>;
}

interface MfaRecoveryCodeDelegateV1 {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly MfaRecoveryCodeDatabaseRowV1[]>;
  findUnique(input: {
    readonly where: { readonly id: string };
  }): Promise<MfaRecoveryCodeDatabaseRowV1 | null>;
  create(input: {
    readonly data: MfaRecoveryCodeDatabaseRowV1;
  }): Promise<MfaRecoveryCodeDatabaseRowV1>;
  update(input: {
    readonly where: { readonly id: string };
    readonly data: Partial<MfaRecoveryCodeDatabaseRowV1>;
  }): Promise<MfaRecoveryCodeDatabaseRowV1>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Partial<MfaRecoveryCodeDatabaseRowV1>;
  }): Promise<{ readonly count: number }>;
}

export interface MfaDatabaseClientV1 {
  readonly mfaFactor: MfaFactorDelegateV1;
  readonly mfaRecoveryCode: MfaRecoveryCodeDelegateV1;
  readonly userIdentity?: {
    updateMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<{ readonly count: number }>;
  };
  $transaction<TValue>(
    work: (transaction: MfaDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function timestamp(input: Date | null | undefined): StrictUtcTimestampV1 | undefined {
  if (!input) return undefined;
  const parsed = parseStrictUtcTimestampV1(input.toISOString());
  return parsed.accepted ? parsed.value : undefined;
}

function stable(input: unknown): string | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function factorFromRow(row: MfaFactorDatabaseRowV1): MfaFactorV1 {
  const created = createMfaFactorV1({
    id: row.id,
    userId: row.userId,
    method: row.factorType,
    secretReference: row.secretReference,
    enrolledAt: timestamp(row.enrolledAt),
  });
  if (!created.accepted) throw new Error('IAM_PERSISTED_MFA_FACTOR_INVALID');
  if (
    (row.status !== 'PENDING' && row.status !== 'ACTIVE' && row.status !== 'REVOKED') ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  )
    throw new Error('IAM_PERSISTED_MFA_FACTOR_INVALID');
  const verifiedAt = timestamp(row.verifiedAt);
  const revokedAt = timestamp(row.revokedAt);
  if ((row.verifiedAt && !verifiedAt) || (row.revokedAt && !revokedAt))
    throw new Error('IAM_PERSISTED_MFA_FACTOR_INVALID');
  return Object.freeze({
    ...created.value,
    status: row.status,
    revision: row.revision,
    ...(verifiedAt ? { verifiedAt } : {}),
    ...(revokedAt ? { revokedAt } : {}),
  });
}

function recoveryCodeFromRow(row: MfaRecoveryCodeDatabaseRowV1): RecoveryCodeV1 {
  const created = createRecoveryCodeV1({
    id: row.id,
    userId: row.userId,
    digest: row.digest,
    createdAt: timestamp(row.createdAt),
  });
  if (!created.accepted) throw new Error('IAM_PERSISTED_RECOVERY_CODE_INVALID');
  if (
    (row.status !== 'AVAILABLE' && row.status !== 'USED' && row.status !== 'REVOKED') ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  )
    throw new Error('IAM_PERSISTED_RECOVERY_CODE_INVALID');
  const usedAt = timestamp(row.usedAt);
  if (row.usedAt && !usedAt) throw new Error('IAM_PERSISTED_RECOVERY_CODE_INVALID');
  return Object.freeze({
    ...created.value,
    status: row.status,
    revision: row.revision,
    ...(usedAt ? { usedAt } : {}),
  });
}

function freezeState(state: MfaStateV1): MfaStateV1 {
  return Object.freeze({
    factors: Object.freeze(state.factors.map((factor) => Object.freeze({ ...factor }))),
    recoveryCodes: Object.freeze(state.recoveryCodes.map((code) => Object.freeze({ ...code }))),
  });
}

function factorRow(factor: MfaFactorV1): MfaFactorDatabaseRowV1 {
  return {
    id: factor.id,
    userId: factor.userId,
    factorType: factor.method,
    secretReference: factor.secretReference,
    status: factor.status,
    enrolledAt: new Date(factor.enrolledAt),
    verifiedAt: factor.verifiedAt ? new Date(factor.verifiedAt) : null,
    revokedAt: factor.revokedAt ? new Date(factor.revokedAt) : null,
    revision: factor.revision,
  };
}

function recoveryRow(code: RecoveryCodeV1): MfaRecoveryCodeDatabaseRowV1 {
  return {
    id: code.id,
    userId: code.userId,
    digest: code.digest,
    status: code.status,
    createdAt: new Date(code.createdAt),
    usedAt: code.usedAt ? new Date(code.usedAt) : null,
    revision: code.revision,
  };
}

function immutableState(existing: MfaStateV1, next: MfaStateV1): boolean {
  if (
    new Set(next.factors.map((factor) => factor.id)).size !== next.factors.length ||
    new Set(next.recoveryCodes.map((code) => code.id)).size !== next.recoveryCodes.length
  )
    return false;
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

class PrismaMfaTransactionAdapter implements MfaTransactionPortV1 {
  public constructor(private readonly client: MfaDatabaseClientV1) {}

  public async findState(userId: string): Promise<MfaStateV1> {
    const [factors, recoveryCodes] = await Promise.all([
      this.client.mfaFactor.findMany({ where: { userId } }),
      this.client.mfaRecoveryCode.findMany({ where: { userId } }),
    ]);
    return freezeState({
      factors: factors.map(factorFromRow),
      recoveryCodes: recoveryCodes.map(recoveryCodeFromRow),
    });
  }

  public async saveState(userId: string, state: MfaStateV1): Promise<void> {
    if (!stable(userId)) throw new Error('MFA_INVALID_USER');
    if (
      !state.factors.every((factor) => factor.userId === userId) ||
      !state.recoveryCodes.every((code) => code.userId === userId)
    )
      throw new Error('MFA_SCOPE_MISMATCH');
    const existing = await this.findState(userId);
    if (!immutableState(existing, state)) throw new Error('IAM_MFA_REVISION_CONFLICT');
    for (const factor of state.factors) {
      const prior = existing.factors.find((candidate) => candidate.id === factor.id);
      if (!prior) {
        await this.client.mfaFactor.create({ data: factorRow(factor) });
        continue;
      }
      if (JSON.stringify(prior) === JSON.stringify(factor)) continue;
      const updated = await this.client.mfaFactor.updateMany({
        where: { id: factor.id, revision: prior.revision },
        data: {
          status: factor.status,
          verifiedAt: factor.verifiedAt ? new Date(factor.verifiedAt) : null,
          revokedAt: factor.revokedAt ? new Date(factor.revokedAt) : null,
          revision: factor.revision,
        },
      });
      if (updated.count !== 1) throw new Error('IAM_MFA_REVISION_CONFLICT');
    }
    for (const code of state.recoveryCodes) {
      const prior = existing.recoveryCodes.find((candidate) => candidate.id === code.id);
      if (!prior) {
        await this.client.mfaRecoveryCode.create({ data: recoveryRow(code) });
        continue;
      }
      if (JSON.stringify(prior) === JSON.stringify(code)) continue;
      const updated = await this.client.mfaRecoveryCode.updateMany({
        where: { id: code.id, revision: prior.revision },
        data: {
          status: code.status,
          usedAt: code.usedAt ? new Date(code.usedAt) : null,
          revision: code.revision,
        },
      });
      if (updated.count !== 1) throw new Error('IAM_MFA_REVISION_CONFLICT');
    }
  }

  public async clearRecoveryReenrollment(userId: string): Promise<boolean> {
    if (!this.client.userIdentity) return false;
    const updated = await this.client.userIdentity.updateMany({
      where: { id: userId, mfaReenrollmentRequired: true },
      data: { mfaReenrollmentRequired: false },
    });
    return updated.count === 1;
  }
}

export class PrismaMfaRepositoryAdapter implements MfaRepositoryPortV1 {
  public constructor(private readonly client: MfaDatabaseClientV1) {}

  public findState(userId: string) {
    return new PrismaMfaTransactionAdapter(this.client).findState(userId);
  }

  public saveState(userId: string, state: MfaStateV1) {
    return this.client.$transaction((transaction) =>
      new PrismaMfaTransactionAdapter(transaction).saveState(userId, state),
    );
  }

  public clearRecoveryReenrollment(userId: string): Promise<boolean> {
    return this.client.$transaction((transaction) =>
      new PrismaMfaTransactionAdapter(transaction).clearRecoveryReenrollment(userId),
    );
  }

  public withTransaction<TValue>(
    work: (transaction: MfaTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaMfaTransactionAdapter(transaction)),
    );
  }
}
