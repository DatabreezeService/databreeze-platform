import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';

import {
  PrismaIdentityBootstrapTransactionAdapter,
  type IdentityBootstrapDatabaseClientV1,
  type IdentityBootstrapPolicyProvisionerFactoryV1,
  type UserIdentityDatabaseRowV1,
} from './prisma-identity-bootstrap-repository.adapter.js';
import {
  RegistrationConflictError,
  type RegistrationPersistenceInputV1,
  type RegistrationRepositoryPortV1,
  type RegistrationTransactionPortV1,
} from '../application/registration-repository.port.js';

interface RegistrationUserDelegateV1 {
  findUnique(input: {
    readonly where: Readonly<{ readonly id?: string; readonly email?: string }>;
  }): Promise<UserIdentityDatabaseRowV1 | null>;
  create(input: {
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<UserIdentityDatabaseRowV1>;
}

interface RegistrationCredentialDelegateV1 {
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
}

export interface RegistrationDatabaseClientV1
  extends Omit<IdentityBootstrapDatabaseClientV1, 'userIdentity'> {
  readonly userIdentity: RegistrationUserDelegateV1;
  readonly passwordCredential: RegistrationCredentialDelegateV1;
  $transaction<TValue>(
    work: (transaction: RegistrationDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function uniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('code' in error ? error.code === 'P2002' : error instanceof RegistrationConflictError)
  );
}

class PrismaRegistrationTransactionAdapter implements RegistrationTransactionPortV1 {
  public constructor(
    private readonly client: RegistrationDatabaseClientV1,
    private readonly policyProvisionerFactory?: IdentityBootstrapPolicyProvisionerFactoryV1,
  ) {}

  public async findByEmail(emailInput: string): Promise<boolean> {
    const email = normalizeEmailAddressV1(emailInput);
    if (!email.accepted) return false;
    const row = await this.client.userIdentity.findUnique({ where: { email: email.value } });
    return row?.email === email.value;
  }

  public async save(input: RegistrationPersistenceInputV1): Promise<void> {
    const email = normalizeEmailAddressV1(input.email);
    if (!email.accepted || email.value !== input.email)
      throw new Error('IAM_REGISTRATION_INPUT_INVALID');
    try {
      await this.client.userIdentity.create({
        data: {
          id: input.bootstrap.user.id,
          email: input.email,
          displayName: input.bootstrap.user.displayName,
          locale: input.bootstrap.user.locale,
          status: input.bootstrap.user.status,
          securityEpoch: input.bootstrap.user.securityEpoch,
          createdAt: new Date(input.bootstrap.user.createdAt),
        },
      });
      await this.client.passwordCredential.create({
        data: {
          id: input.credentialId,
          userId: input.bootstrap.user.id,
          algorithm: input.credential.algorithm,
          encodedHash: input.credential.encodedHash,
          createdAt: new Date(input.bootstrap.user.createdAt),
        },
      });
      await new PrismaIdentityBootstrapTransactionAdapter(
        this.client,
        this.policyProvisionerFactory?.(this.client),
      ).save(input.bootstrap);
    } catch (error) {
      if (uniqueConflict(error)) throw new RegistrationConflictError();
      throw error;
    }
  }
}

/** PostgreSQL adapter for the atomic account and personal-tenant registration unit. */
export class PrismaRegistrationRepositoryAdapter implements RegistrationRepositoryPortV1 {
  public constructor(
    private readonly client: RegistrationDatabaseClientV1,
    private readonly policyProvisionerFactory?: IdentityBootstrapPolicyProvisionerFactoryV1,
  ) {}

  public withTransaction<TValue>(
    work: (transaction: RegistrationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaRegistrationTransactionAdapter(transaction, this.policyProvisionerFactory)),
    );
  }
}
