import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamPrincipalEmailLookupPortV1 } from '../application/invitation.service.js';

export interface IamPrincipalEmailDatabaseRowV1 {
  readonly id: string;
  readonly email: string;
  readonly status: string;
}

export interface IamPrincipalEmailDatabaseClientV1 {
  readonly userIdentity: {
    findUnique(input: {
      readonly where: Readonly<Record<string, unknown>>;
    }): Promise<IamPrincipalEmailDatabaseRowV1 | null>;
  };
}

/** Reads only the active, normalized email needed by the invitation use case. */
export class PrismaIamPrincipalEmailLookupAdapter implements IamPrincipalEmailLookupPortV1 {
  public constructor(private readonly client: IamPrincipalEmailDatabaseClientV1) {}

  public async findEmail(principalId: StableIdentifierV1): Promise<string | undefined> {
    const row = await this.client.userIdentity.findUnique({ where: { id: principalId } });
    if (!row || row.status !== 'ACTIVE') return undefined;
    const persistedId = parseStableIdentifierV1(row.id);
    if (!persistedId.accepted || persistedId.value !== principalId) return undefined;
    const email = normalizeEmailAddressV1(row.email);
    return email.accepted ? email.value : undefined;
  }

  public async findPrincipalIdByEmail(
    normalizedEmail: string,
  ): Promise<StableIdentifierV1 | undefined> {
    const email = normalizeEmailAddressV1(normalizedEmail);
    if (!email.accepted) return undefined;
    const row = await this.client.userIdentity.findUnique({ where: { email: email.value } });
    if (!row || row.status !== 'ACTIVE') return undefined;
    const persistedEmail = normalizeEmailAddressV1(row.email);
    const persistedId = parseStableIdentifierV1(row.id);
    if (!persistedEmail.accepted || persistedEmail.value !== email.value || !persistedId.accepted)
      return undefined;
    return persistedId.value;
  }
}
