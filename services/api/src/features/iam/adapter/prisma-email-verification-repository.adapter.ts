import type { EmailVerificationRepositoryPortV1 } from '../application/email-verification-repository.port.js';

/**
 * Prisma-backed email verification repository.
 * Maps to `IamEmailVerificationChallenge` and registration activation transactions.
 * Production wiring lands with live DATABASE_URL; unit tests use the in-memory adapter.
 */
export class PrismaEmailVerificationRepositoryAdapter implements EmailVerificationRepositoryPortV1 {
  public constructor(private readonly client: unknown) {
    void this.client;
  }

  public findActiveByAdmission(): Promise<never> {
    return Promise.reject(new Error('IAM_EMAIL_VERIFICATION_PRISMA_NOT_WIRED'));
  }

  public findById(): Promise<never> {
    return Promise.reject(new Error('IAM_EMAIL_VERIFICATION_PRISMA_NOT_WIRED'));
  }

  public save(): Promise<never> {
    return Promise.reject(new Error('IAM_EMAIL_VERIFICATION_PRISMA_NOT_WIRED'));
  }

  public revokeActive(): Promise<never> {
    return Promise.reject(new Error('IAM_EMAIL_VERIFICATION_PRISMA_NOT_WIRED'));
  }

  public consumeAndActivate(): Promise<never> {
    return Promise.reject(new Error('IAM_EMAIL_VERIFICATION_PRISMA_NOT_WIRED'));
  }
}
