import {
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  IaeWorkerCapabilityRecordV1,
  IaeWorkerCapabilityRepositoryPortV1,
  IaeWorkerCapabilityTransactionPortV1,
  IaeWorkerObjectTransferReceiptV1,
} from '../application/worker-object-capability.port.js';

function clone(record: IaeWorkerCapabilityRecordV1): IaeWorkerCapabilityRecordV1 {
  return Object.freeze({
    ...record,
    tenantScope: Object.freeze({ ...record.tenantScope }),
    objectIds: Object.freeze([...record.objectIds]),
    objectBindings: Object.freeze(
      record.objectBindings.map((binding) => Object.freeze({ ...binding })),
    ),
    ...(record.transferReceipt === undefined
      ? {}
      : { transferReceipt: Object.freeze({ ...record.transferReceipt }) }),
  });
}

/** Deterministic contract adapter; production uses the IAE Prisma adapter behind the same port. */
export class InMemoryWorkerObjectCapabilityRepositoryAdapter
  implements IaeWorkerCapabilityRepositoryPortV1
{
  private records = new Map<string, IaeWorkerCapabilityRecordV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async findInput(
    tenantScope: TenantScopeV1,
    attemptId: StableIdentifierV1,
  ): Promise<IaeWorkerCapabilityRecordV1 | undefined> {
    await Promise.resolve();
    const record = [...this.records.values()].find(
      (candidate) =>
        candidate.grantType === 'JOB_INPUT' &&
        candidate.attemptId === attemptId &&
        tenantScopesEqualV1(candidate.tenantScope, tenantScope),
    );
    return record ? clone(record) : undefined;
  }

  public async findOutput(
    tenantScope: TenantScopeV1,
    attemptId: StableIdentifierV1,
    objectId: string,
  ): Promise<IaeWorkerCapabilityRecordV1 | undefined> {
    await Promise.resolve();
    const record = [...this.records.values()].find(
      (candidate) =>
        candidate.grantType === 'JOB_OUTPUT' &&
        candidate.attemptId === attemptId &&
        candidate.objectIds.includes(objectId) &&
        tenantScopesEqualV1(candidate.tenantScope, tenantScope),
    );
    return record ? clone(record) : undefined;
  }

  public async findByCapability(
    tenantScope: TenantScopeV1,
    capabilityId: StableIdentifierV1,
  ): Promise<IaeWorkerCapabilityRecordV1 | undefined> {
    await Promise.resolve();
    const record = this.records.get(capabilityId);
    return record && tenantScopesEqualV1(record.tenantScope, tenantScope)
      ? clone(record)
      : undefined;
  }

  public async save(record: IaeWorkerCapabilityRecordV1): Promise<void> {
    await Promise.resolve();
    const existing = this.records.get(record.capabilityId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(record))
      throw new Error('IAE_CAPABILITY_IMMUTABLE');
    this.records.set(record.capabilityId, clone(record));
  }

  public async recordTransferReceipt(
    tenantScope: TenantScopeV1,
    capabilityId: StableIdentifierV1,
    receipt: IaeWorkerObjectTransferReceiptV1,
  ): Promise<'RECORDED' | 'REPLAYED' | 'CONFLICT' | 'NOT_FOUND'> {
    await Promise.resolve();
    const current = this.records.get(capabilityId);
    if (!current || !tenantScopesEqualV1(current.tenantScope, tenantScope)) return 'NOT_FOUND';
    if (current.transferReceipt !== undefined)
      return JSON.stringify(current.transferReceipt) === JSON.stringify(receipt)
        ? 'REPLAYED'
        : 'CONFLICT';
    this.records.set(capabilityId, clone({ ...current, transferReceipt: receipt }));
    return 'RECORDED';
  }

  public async revokeForAttempt(
    tenantScope: TenantScopeV1,
    attemptId: StableIdentifierV1,
    revokedAt: StrictUtcTimestampV1,
  ): Promise<void> {
    await Promise.resolve();
    this.records = new Map(
      [...this.records.entries()].map(([key, record]) =>
        record.attemptId === attemptId && tenantScopesEqualV1(record.tenantScope, tenantScope)
          ? [key, clone({ ...record, revokedAt })]
          : [key, record],
      ),
    );
  }

  public async withTransaction<TValue>(
    tenantScope: TenantScopeV1,
    work: (transaction: IaeWorkerCapabilityTransactionPortV1) => Promise<TValue>,
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
        findInput: this.findInput.bind(this),
        findOutput: this.findOutput.bind(this),
        findByCapability: this.findByCapability.bind(this),
        save: this.save.bind(this),
        recordTransferReceipt: this.recordTransferReceipt.bind(this),
      });
    } catch (error) {
      this.records = before;
      throw error;
    } finally {
      release();
    }
  }
}
