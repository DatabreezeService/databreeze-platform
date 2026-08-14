import { createHmac } from 'node:crypto';

import type {
  EmailVerificationChallengeRecordV1,
  EmailVerificationDigestPortV1,
  EmailVerificationRepositoryPortV1,
} from '../application/email-verification-repository.port.js';

/** Deterministic in-memory OTP repository for unit tests and explicit local composition. */
export class InMemoryEmailVerificationRepositoryAdapter
  implements EmailVerificationRepositoryPortV1
{
  private readonly challenges = new Map<string, EmailVerificationChallengeRecordV1>();
  private readonly activationKeys = new Map<string, string>();

  public async findActiveByAdmission(admissionDigest: string, purpose: string) {
    await Promise.resolve();
    return [...this.challenges.values()].find(
      (challenge) => challenge.admissionDigest === admissionDigest && challenge.purpose === purpose && challenge.status === 'ACTIVE',
    );
  }

  public async findById(challengeId: string) {
    await Promise.resolve();
    return this.challenges.get(challengeId);
  }

  public async save(challenge: EmailVerificationChallengeRecordV1): Promise<void> {
    await Promise.resolve();
    const existing = this.challenges.get(challenge.id);
    if (existing && challenge.revision !== existing.revision + 1)
      throw new Error('IAM_EMAIL_VERIFICATION_REVISION_CONFLICT');
    if (!existing && challenge.revision !== 1)
      throw new Error('IAM_EMAIL_VERIFICATION_REVISION_CONFLICT');
    this.challenges.set(challenge.id, Object.freeze({ ...challenge }));
  }

  public async revokeActive(admissionDigest: string, purpose: string): Promise<void> {
    await Promise.resolve();
    for (const [id, challenge] of this.challenges.entries()) {
      if (challenge.admissionDigest === admissionDigest && challenge.purpose === purpose && challenge.status === 'ACTIVE') {
        this.challenges.set(id, Object.freeze({ ...challenge, status: 'REVOKED', revision: challenge.revision + 1 }));
      }
    }
  }

  public async consumeAndActivate(
    input: Parameters<EmailVerificationRepositoryPortV1['consumeAndActivate']>[0],
  ): Promise<boolean> {
    await Promise.resolve();
    const activationOwner = this.activationKeys.get(input.idempotencyKey);
    if (activationOwner !== undefined) return false;
    const challenge = this.challenges.get(input.challengeId);
    if (!challenge || challenge.revision !== input.expectedRevision || challenge.status !== 'ACTIVE') return false;
    this.challenges.set(input.challengeId, Object.freeze({
      ...challenge,
      status: 'CONSUMED',
      consumedAt: input.consumedAt,
      activationIdempotencyKey: input.idempotencyKey,
      activationRequestHash: input.requestHash,
      activationResultEnvelope: input.activationResultEnvelope,
      activatedSessionId: input.activation.session.sessionId,
      revision: challenge.revision + 1,
    }));
    this.activationKeys.set(input.idempotencyKey, input.challengeId);
    return true;
  }

  public allChallenges(): readonly EmailVerificationChallengeRecordV1[] {
    return [...this.challenges.values()];
  }
}

export class HmacSha256EmailVerificationDigestAdapter implements EmailVerificationDigestPortV1 {
  public constructor(private readonly key: string | Uint8Array) {
    if ((typeof key === 'string' && key.length < 16) || (key instanceof Uint8Array && key.byteLength < 16))
      throw new Error('IAM_EMAIL_VERIFICATION_DIGEST_KEY_REQUIRED');
  }

  public digestAdmission(email: string): string {
    return createHmac('sha256', this.key)
      .update(`databreeze:iam:email-verification:admission:v1\u0000${email}`, 'utf8')
      .digest('hex');
  }

  public digestCode(challengeId: string, code: string): string {
    return createHmac('sha256', this.key)
      .update(`databreeze:iam:email-verification:code:v1\u0000${challengeId}\u0000${code}`, 'utf8')
      .digest('hex');
  }
}
