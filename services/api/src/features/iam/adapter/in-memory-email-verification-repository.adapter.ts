import { createHmac } from 'node:crypto';

import type {
  EmailVerificationChallengeRecordV1,
  EmailVerificationDigestPortV1,
  EmailVerificationRepositoryPortV1,
  EmailVerificationVerifyResultV1,
} from '../application/email-verification-repository.port.js';

/** Deterministic in-memory OTP repository for unit tests and local composition. */
export class InMemoryEmailVerificationRepositoryAdapter
  implements EmailVerificationRepositoryPortV1
{
  private readonly challenges = new Map<string, EmailVerificationChallengeRecordV1>();
  private readonly activations = new Map<
    string,
    {
      readonly userId: string;
      readonly organizationId: string;
      readonly workspaceId: string;
    }
  >();

  public async findActiveByAdmission(
    admissionDigest: string,
    purpose: string,
  ): Promise<EmailVerificationChallengeRecordV1 | undefined> {
    await Promise.resolve();
    for (const challenge of this.challenges.values()) {
      if (
        challenge.admissionDigest === admissionDigest &&
        challenge.purpose === purpose &&
        challenge.status === 'ACTIVE'
      ) {
        return challenge;
      }
    }
    return undefined;
  }

  public async findById(
    challengeId: string,
  ): Promise<EmailVerificationChallengeRecordV1 | undefined> {
    await Promise.resolve();
    return this.challenges.get(challengeId);
  }

  public async save(challenge: EmailVerificationChallengeRecordV1): Promise<void> {
    await Promise.resolve();
    this.challenges.set(challenge.id, challenge);
  }

  public async revokeActive(admissionDigest: string, purpose: string): Promise<void> {
    await Promise.resolve();
    for (const [id, challenge] of this.challenges.entries()) {
      if (
        challenge.admissionDigest === admissionDigest &&
        challenge.purpose === purpose &&
        challenge.status === 'ACTIVE'
      ) {
        this.challenges.set(id, {
          ...challenge,
          status: 'REVOKED',
          revision: challenge.revision + 1,
        });
      }
    }
  }

  public async consumeAndActivate(input: {
    readonly challengeId: string;
    readonly expectedRevision: number;
    readonly email: string;
    readonly idempotencyKey: string;
  }): Promise<EmailVerificationVerifyResultV1> {
    await Promise.resolve();
    const existing = this.activations.get(input.idempotencyKey);
    if (existing) {
      return {
        accepted: true,
        value: { ...existing, alreadyCompleted: true },
      };
    }
    const challenge = this.challenges.get(input.challengeId);
    if (
      !challenge ||
      challenge.revision !== input.expectedRevision ||
      challenge.status !== 'ACTIVE'
    ) {
      return { accepted: false, code: 'INVALID_CODE' };
    }
    const activated = Object.freeze({
      userId: '00000000-0000-4000-8000-000000000101',
      organizationId: '00000000-0000-4000-8000-000000000102',
      workspaceId: '00000000-0000-4000-8000-000000000103',
    });
    this.challenges.set(input.challengeId, {
      ...challenge,
      status: 'CONSUMED',
      revision: challenge.revision + 1,
    });
    this.activations.set(input.idempotencyKey, activated);
    return { accepted: true, value: { ...activated, alreadyCompleted: false } };
  }

  public allChallenges(): readonly EmailVerificationChallengeRecordV1[] {
    return [...this.challenges.values()];
  }
}

export class HmacSha256EmailVerificationDigestAdapter implements EmailVerificationDigestPortV1 {
  public constructor(private readonly key: string) {
    if (!key || key.length < 16) throw new Error('IAM_EMAIL_VERIFICATION_DIGEST_KEY_REQUIRED');
  }

  public digestAdmission(email: string): string {
    return createHmac('sha256', this.key)
      .update(`databreeze:iam:email-verification:admission:v1\u0000${email}`, 'utf8')
      .digest('hex');
  }

  public digestCode(code: string): string {
    return createHmac('sha256', this.key)
      .update(`databreeze:iam:email-verification:code:v1\u0000${code}`, 'utf8')
      .digest('hex');
  }
}
