import type {
  RegistrationPersistenceInputV1,
  RegistrationRepositoryPortV1,
  RegistrationTransactionPortV1,
} from '../application/registration-repository.port.js';
import { RegistrationConflictError } from '../application/registration-repository.port.js';

function clone<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

/** Deterministic transactional registration store for tests and private-alpha composition. */
export class InMemoryRegistrationRepositoryAdapter implements RegistrationRepositoryPortV1 {
  private records = new Map<string, RegistrationPersistenceInputV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async withTransaction<TValue>(
    work: (transaction: RegistrationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.records);
    const transaction: RegistrationTransactionPortV1 = {
      findByEmail: async (email) => {
        await Promise.resolve();
        return this.records.has(email);
      },
      save: async (input) => {
        await Promise.resolve();
        if (this.records.has(input.email)) throw new RegistrationConflictError();
        this.records.set(input.email, clone(input));
      },
    };
    try {
      return await work(transaction);
    } catch (error) {
      this.records = before;
      throw error;
    } finally {
      release();
    }
  }

  public has(email: string): boolean {
    return this.records.has(email);
  }

  public get(email: string): RegistrationPersistenceInputV1 | undefined {
    const value = this.records.get(email);
    return value ? clone(value) : undefined;
  }
}
