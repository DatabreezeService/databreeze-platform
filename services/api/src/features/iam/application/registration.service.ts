import {
  bootstrapPersonalOrganizationV1,
  isBoundedTextV1,
  normalizeEmailAddressV1,
  type LocaleV1,
} from '@databreeze/domain/identity/v1';

import type { PasswordCredentialService } from './password-credential.service.js';
import {
  RegistrationConflictError,
  type RegistrationRepositoryPortV1,
  type RegistrationResultV1,
} from './registration-repository.port.js';

export const IAM_REGISTRATION_SERVICE = Symbol('IAM_REGISTRATION_SERVICE');

export interface RegistrationInputV1 {
  readonly email: unknown;
  readonly displayName: unknown;
  readonly password: unknown;
  readonly locale?: unknown;
}

export interface RegistrationClockV1 {
  now(): Date;
}

export interface RegistrationIdGeneratorV1 {
  next(): string;
}

export interface RegistrationServicePortsV1 {
  readonly repository: RegistrationRepositoryPortV1;
  readonly passwordCredentials: PasswordCredentialService;
  readonly ids: RegistrationIdGeneratorV1;
  readonly clock?: RegistrationClockV1;
}

function now(clock: RegistrationClockV1 | undefined): Date {
  return clock?.now() ?? new Date();
}

function locale(input: unknown): LocaleV1 | undefined {
  return input === undefined ? 'vi-VN' : input === 'vi-VN' || input === 'en' ? input : undefined;
}

/** Creates a user, password credential, and personal owner hierarchy atomically. */
export class RegistrationService {
  public constructor(private readonly ports: RegistrationServicePortsV1) {}

  public async register(input: RegistrationInputV1): Promise<RegistrationResultV1> {
    const email = normalizeEmailAddressV1(input.email);
    const selectedLocale = locale(input.locale);
    if (!email.accepted || !isBoundedTextV1(input.displayName, 200) || !selectedLocale)
      return Object.freeze({ accepted: false, code: 'INVALID_INPUT' as const });

    // Password hashing intentionally occurs before the uniqueness check so an existing account
    // cannot be distinguished by a cheap fast path. The raw password never enters a repository.
    const credential = await this.ports.passwordCredentials.create(input.password);
    if (!credential.accepted) {
      return Object.freeze({
        accepted: false,
        code:
          credential.code === 'INVALID_PASSWORD'
            ? ('INVALID_INPUT' as const)
            : ('REGISTRATION_UNAVAILABLE' as const),
      });
    }

    const createdAt = now(this.ports.clock).toISOString();
    const bootstrap = bootstrapPersonalOrganizationV1({
      user: {
        id: this.ports.ids.next(),
        displayName: input.displayName,
        locale: selectedLocale,
        createdAt,
      },
      organizationId: this.ports.ids.next(),
      workspaceId: this.ports.ids.next(),
      projectId: this.ports.ids.next(),
      membershipId: this.ports.ids.next(),
      createdAt,
    });
    if (!bootstrap.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_INPUT' as const });

    try {
      return await this.ports.repository.withTransaction(async (transaction) => {
        if (await transaction.findByEmail(email.value))
          return Object.freeze({ accepted: false, code: 'REGISTRATION_REJECTED' as const });
        await transaction.save({
          email: email.value,
          credentialId: this.ports.ids.next(),
          credential: credential.value,
          bootstrap: bootstrap.value,
        });
        return Object.freeze({
          accepted: true as const,
          value: Object.freeze({ bootstrap: bootstrap.value, email: email.value }),
        });
      });
    } catch (error) {
      if (error instanceof RegistrationConflictError)
        return Object.freeze({ accepted: false, code: 'REGISTRATION_REJECTED' as const });
      return Object.freeze({ accepted: false, code: 'REGISTRATION_UNAVAILABLE' as const });
    }
  }
}
