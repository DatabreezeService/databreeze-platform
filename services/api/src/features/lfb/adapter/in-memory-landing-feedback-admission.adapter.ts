import type { LandingFeedbackAdmissionPortV1 } from '../application/landing-feedback-intake.port.js';

export interface InMemoryLandingFeedbackAdmissionOptionsV1 {
  readonly maxSubmissions?: number;
  readonly windowSeconds?: number;
}

/** Deterministic bounded admission store for local/dev; production supplies a shared adapter. */
export class InMemoryLandingFeedbackAdmissionAdapter implements LandingFeedbackAdmissionPortV1 {
  private readonly maxSubmissions: number;
  private readonly windowMs: number;
  private readonly submissions = new Map<string, number[]>();

  public constructor(options: InMemoryLandingFeedbackAdmissionOptionsV1 = {}) {
    this.maxSubmissions = options.maxSubmissions ?? 5;
    this.windowMs = (options.windowSeconds ?? 3600) * 1_000;
    if (
      !Number.isSafeInteger(this.maxSubmissions) ||
      this.maxSubmissions < 1 ||
      this.maxSubmissions > 100
    )
      throw new Error('LFB_FEEDBACK_ADMISSION_INVALID');
    if (!Number.isSafeInteger(this.windowMs) || this.windowMs < 1_000 || this.windowMs > 86_400_000)
      throw new Error('LFB_FEEDBACK_ADMISSION_INVALID');
  }

  public async allow(keyDigest: string, issuedAt: string): Promise<boolean> {
    await Promise.resolve();
    const at = Date.parse(issuedAt);
    if (!/^[a-f0-9]{64}$/u.test(keyDigest) || !Number.isFinite(at)) return false;
    const current = this.submissions.get(keyDigest) ?? [];
    const kept = current.filter((timestamp) => at - timestamp < this.windowMs);
    if (kept.length >= this.maxSubmissions) {
      this.submissions.set(keyDigest, kept);
      return false;
    }
    kept.push(at);
    this.submissions.set(keyDigest, kept);
    return true;
  }
}
