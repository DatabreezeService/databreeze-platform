import type { PersonalOrganizationBootstrapV1 } from '@databreeze/domain/identity/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  IdentityBootstrapRepositoryPortV1,
  IdentityBootstrapTransactionPortV1,
  IdentityBootstrapVisibleTreeV1,
} from '../application/identity-bootstrap-repository.port.js';

function cloneBootstrap(value: PersonalOrganizationBootstrapV1): PersonalOrganizationBootstrapV1 {
  return Object.freeze({
    user: Object.freeze({ ...value.user }),
    organization: Object.freeze({ ...value.organization }),
    workspace: Object.freeze({ ...value.workspace }),
    project: Object.freeze({ ...value.project }),
    membership: Object.freeze({
      ...value.membership,
      scope: Object.freeze({ ...value.membership.scope }),
    }),
  });
}

/** In-memory bootstrap adapter used by tests and private alpha composition. */
export class InMemoryIdentityBootstrapRepositoryAdapter
  implements IdentityBootstrapRepositoryPortV1
{
  private records = new Map<string, PersonalOrganizationBootstrapV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async findByUserId(
    userId: StableIdentifierV1,
  ): Promise<PersonalOrganizationBootstrapV1 | undefined> {
    await Promise.resolve();
    const value = this.records.get(userId);
    return value ? cloneBootstrap(value) : undefined;
  }

  public async listVisibleByUserId(
    userId: StableIdentifierV1,
  ): Promise<IdentityBootstrapVisibleTreeV1 | undefined> {
    const personal = await this.findByUserId(userId);
    if (personal === undefined) return undefined;
    return Object.freeze({
      user: Object.freeze({ ...personal.user }),
      organizations: Object.freeze([
        Object.freeze({
          ...personal.organization,
          workspaces: Object.freeze([
            Object.freeze({ ...personal.workspace, projects: Object.freeze([personal.project]) }),
          ]),
        }),
      ]),
    });
  }

  public async save(bootstrap: PersonalOrganizationBootstrapV1): Promise<void> {
    await Promise.resolve();
    const key = bootstrap.user.id;
    const existing = this.records.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(bootstrap))
      throw new Error('IAM_BOOTSTRAP_CONFLICT');
    this.records.set(key, cloneBootstrap(bootstrap));
  }

  public async withTransaction<TValue>(
    work: (transaction: IdentityBootstrapTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.records);
    try {
      return await work({
        findByUserId: this.findByUserId.bind(this),
        save: this.save.bind(this),
      });
    } catch (error) {
      this.records = before;
      throw error;
    } finally {
      release();
    }
  }
}
