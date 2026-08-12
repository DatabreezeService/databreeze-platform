import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';

import type { OidcIdentityPortV1, OidcVerifiedIdentityV1 } from './oidc-identity.port.js';

export const IAM_IDENTITY_LINKING_SERVICE = Symbol('IAM_IDENTITY_LINKING_SERVICE');

export type IdentityLinkFailureCodeV1 =
  | 'INVALID_INPUT'
  | 'SILENT_MERGE_DENIED'
  | 'LINK_UNAVAILABLE'
  | 'OIDC_REJECTED';

export interface IdentityLinkRecordV1 {
  readonly userId: string;
  readonly issuer: string;
  readonly subjectDigest: string;
  readonly emailDigest: string;
}

export interface IdentityLinkingRepositoryPortV1 {
  findPasswordUserByEmail(email: string): Promise<{ readonly userId: string } | undefined>;
  findLink(issuer: string, subjectDigest: string): Promise<IdentityLinkRecordV1 | undefined>;
  createLink(input: IdentityLinkRecordV1): Promise<void>;
}

export interface IdentityLinkingServicePortsV1 {
  readonly oidc: OidcIdentityPortV1;
  readonly repository: IdentityLinkingRepositoryPortV1;
  readonly digestSubject: (subject: string) => string;
  readonly digestEmail: (email: string) => string;
}

/** IAM-023: OIDC linking never silently merges an existing password identity. */
export class IdentityLinkingService {
  public constructor(private readonly ports: IdentityLinkingServicePortsV1) {}

  public async linkFromAuthorizationCode(input: {
    readonly code: unknown;
    readonly codeVerifier: unknown;
    readonly redirectUri: unknown;
    readonly nonce: unknown;
    readonly authenticatedUserId?: unknown;
    readonly passwordConfirmed?: boolean;
    readonly emailOtpConfirmed?: boolean;
  }): Promise<
    | {
        readonly accepted: true;
        readonly value: {
          readonly userId: string;
          readonly email: string;
          readonly linked: true;
        };
      }
    | { readonly accepted: false; readonly code: IdentityLinkFailureCodeV1 }
  > {
    const verified = await this.ports.oidc.verifyAuthorizationCode(input);
    if (!verified.accepted) return { accepted: false, code: 'OIDC_REJECTED' };
    return this.linkVerifiedIdentity(verified.value, {
      authenticatedUserId: input.authenticatedUserId,
      passwordConfirmed: input.passwordConfirmed === true,
      emailOtpConfirmed: input.emailOtpConfirmed === true,
    });
  }

  public async linkVerifiedIdentity(
    identity: OidcVerifiedIdentityV1,
    proof: {
      readonly authenticatedUserId?: unknown;
      readonly passwordConfirmed?: boolean;
      readonly emailOtpConfirmed?: boolean;
    },
  ): Promise<
    | {
        readonly accepted: true;
        readonly value: {
          readonly userId: string;
          readonly email: string;
          readonly linked: true;
        };
      }
    | { readonly accepted: false; readonly code: IdentityLinkFailureCodeV1 }
  > {
    const email = normalizeEmailAddressV1(identity.email);
    if (!email.accepted || !identity.emailVerified) {
      return { accepted: false, code: 'INVALID_INPUT' };
    }
    const digestSubject = this.ports.digestSubject;
    const digestEmail = this.ports.digestEmail;
    const subjectDigest = digestSubject(identity.subject);
    const existingLink = await this.ports.repository.findLink(identity.issuer, subjectDigest);
    if (existingLink) {
      return {
        accepted: true,
        value: {
          userId: existingLink.userId,
          email: email.value,
          linked: true,
        },
      };
    }
    const passwordUser = await this.ports.repository.findPasswordUserByEmail(email.value);
    if (passwordUser) {
      const sessionMatches =
        typeof proof.authenticatedUserId === 'string' &&
        proof.authenticatedUserId === passwordUser.userId;
      if (!sessionMatches && !proof.passwordConfirmed && !proof.emailOtpConfirmed) {
        return { accepted: false, code: 'SILENT_MERGE_DENIED' };
      }
      await this.ports.repository.createLink({
        userId: passwordUser.userId,
        issuer: identity.issuer,
        subjectDigest,
        emailDigest: digestEmail(email.value),
      });
      return {
        accepted: true,
        value: {
          userId: passwordUser.userId,
          email: email.value,
          linked: true,
        },
      };
    }
    return { accepted: false, code: 'LINK_UNAVAILABLE' };
  }
}
