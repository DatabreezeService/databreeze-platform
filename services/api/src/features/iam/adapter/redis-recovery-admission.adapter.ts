import type { RecoveryAdmissionPortV1 } from '../application/recovery-repository.port.js';

/** Narrow adapter boundary for an atomic Redis INCR/PEXPIRE operation. */
export interface RecoveryAdmissionCounterPortV1 {
  incrementWindow(input: { readonly key: string; readonly ttlMs: number }): Promise<number>;
}

export interface RedisRecoveryAdmissionOptionsV1 {
  readonly maxAttempts?: number;
  readonly windowSeconds?: number;
  readonly keyPrefix?: string;
}

/**
 * Shared admission policy for horizontally scaled API instances.
 * The injected counter must increment and apply the TTL atomically (for example,
 * with one Redis Lua script); this class never stores raw email addresses.
 */
export class RedisRecoveryAdmissionAdapter implements RecoveryAdmissionPortV1 {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly keyPrefix: string;

  public constructor(
    private readonly counter: RecoveryAdmissionCounterPortV1,
    options: RedisRecoveryAdmissionOptionsV1 = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.windowMs = (options.windowSeconds ?? 15 * 60) * 1_000;
    this.keyPrefix = options.keyPrefix ?? 'databreeze:iam:recovery:admission:v1:';
    if (
      !Number.isSafeInteger(this.maxAttempts) ||
      this.maxAttempts < 1 ||
      this.maxAttempts > 100 ||
      !Number.isSafeInteger(this.windowMs) ||
      this.windowMs < 1_000 ||
      this.windowMs > 86_400_000 ||
      !/^[\w:-]{1,120}$/u.test(this.keyPrefix)
    ) {
      throw new Error('IAM_RECOVERY_ADMISSION_INVALID');
    }
  }

  public async allow(keyDigest: string, issuedAt: string): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/u.test(keyDigest) || !Number.isFinite(Date.parse(issuedAt))) return false;
    try {
      const count = await this.counter.incrementWindow({
        key: `${this.keyPrefix}${keyDigest}`,
        ttlMs: this.windowMs,
      });
      return Number.isSafeInteger(count) && count >= 1 && count <= this.maxAttempts;
    } catch {
      return false;
    }
  }
}
