import type { RecoveryAdmissionPortV1 } from '../application/recovery-repository.port.js';

export interface InMemoryRecoveryAdmissionOptionsV1 {
  readonly maxAttempts?: number;
  readonly windowSeconds?: number;
}

/** Deterministic bounded admission store for alpha/tests; production supplies a shared rate-limit adapter. */
export class InMemoryRecoveryAdmissionAdapter implements RecoveryAdmissionPortV1 {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly attempts = new Map<string, number[]>();

  public constructor(options: InMemoryRecoveryAdmissionOptionsV1 = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.windowMs = (options.windowSeconds ?? 15 * 60) * 1_000;
    if (!Number.isSafeInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 100)
      throw new Error('IAM_RECOVERY_ADMISSION_INVALID');
    if (!Number.isSafeInteger(this.windowMs) || this.windowMs < 1_000 || this.windowMs > 86_400_000)
      throw new Error('IAM_RECOVERY_ADMISSION_INVALID');
  }

  public async allow(keyDigest: string, issuedAt: string): Promise<boolean> {
    await Promise.resolve();
    const at = Date.parse(issuedAt);
    if (!/^[a-f0-9]{64}$/u.test(keyDigest) || !Number.isFinite(at)) return false;
    const current = this.attempts.get(keyDigest) ?? [];
    const kept = current.filter((timestamp) => at - timestamp < this.windowMs);
    if (kept.length >= this.maxAttempts) {
      this.attempts.set(keyDigest, kept);
      return false;
    }
    kept.push(at);
    this.attempts.set(keyDigest, kept);
    return true;
  }
}
