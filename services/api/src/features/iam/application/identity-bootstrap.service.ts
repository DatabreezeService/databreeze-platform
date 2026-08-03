import { bootstrapPersonalOrganizationV1 } from '@databreeze/domain/identity/v1';

import type {
  IdentityBootstrapRepositoryPortV1,
  IdentityBootstrapResultV1,
} from './identity-bootstrap-repository.port.js';

export const IDENTITY_BOOTSTRAP_SERVICE = Symbol('IDENTITY_BOOTSTRAP_SERVICE');

function conflict(): IdentityBootstrapResultV1 {
  return Object.freeze({ accepted: false, code: 'BOOTSTRAP_CONFLICT' });
}

/** Atomically creates the personal tenant hierarchy used by solo users. */
export class IdentityBootstrapService {
  public constructor(private readonly repository: IdentityBootstrapRepositoryPortV1) {}

  public async create(
    input: Parameters<typeof bootstrapPersonalOrganizationV1>[0],
  ): Promise<IdentityBootstrapResultV1 | ReturnType<typeof bootstrapPersonalOrganizationV1>> {
    const validated = bootstrapPersonalOrganizationV1(input);
    if (!validated.accepted) return validated;
    return this.repository.withTransaction(async (transaction) => {
      const existing = await transaction.findByUserId(validated.value.user.id);
      if (existing) {
        return JSON.stringify(existing) === JSON.stringify(validated.value)
          ? Object.freeze({ accepted: true, value: existing })
          : conflict();
      }
      await transaction.save(validated.value);
      return Object.freeze({ accepted: true, value: validated.value });
    });
  }
}
