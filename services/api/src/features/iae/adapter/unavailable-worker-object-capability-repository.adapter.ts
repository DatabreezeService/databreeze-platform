import type {
  IaeWorkerCapabilityRecordV1,
  IaeWorkerCapabilityRepositoryPortV1,
  IaeWorkerCapabilityTransactionPortV1,
  IaeWorkerObjectTransferReceiptV1,
} from '../application/worker-object-capability.port.js';
import type {
  StableIdentifierV1,
  StrictUtcTimestampV1,
  TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

/** Production fail-closed adapter when durable capability receipts are not provisioned. */
export class UnavailableWorkerObjectCapabilityRepositoryAdapter
  implements IaeWorkerCapabilityRepositoryPortV1
{
  public findInput(
    _tenantScope: TenantScopeV1,
    _attemptId: StableIdentifierV1,
  ): Promise<IaeWorkerCapabilityRecordV1 | undefined> {
    void _tenantScope;
    void _attemptId;
    return Promise.resolve(undefined);
  }

  public findOutput(
    _tenantScope: TenantScopeV1,
    _attemptId: StableIdentifierV1,
    _objectId: string,
  ): Promise<IaeWorkerCapabilityRecordV1 | undefined> {
    void _tenantScope;
    void _attemptId;
    void _objectId;
    return Promise.resolve(undefined);
  }

  public save(_record: IaeWorkerCapabilityRecordV1): Promise<void> {
    void _record;
    return Promise.reject(new Error('IAE_WORKER_CAPABILITY_REPOSITORY_UNAVAILABLE'));
  }

  public findByCapability(
    _tenantScope: TenantScopeV1,
    _capabilityId: StableIdentifierV1,
  ): Promise<IaeWorkerCapabilityRecordV1 | undefined> {
    void _tenantScope;
    void _capabilityId;
    return Promise.resolve(undefined);
  }

  public recordTransferReceipt(
    _tenantScope: TenantScopeV1,
    _capabilityId: StableIdentifierV1,
    _receipt: IaeWorkerObjectTransferReceiptV1,
  ): Promise<'RECORDED' | 'REPLAYED' | 'CONFLICT' | 'NOT_FOUND'> {
    void _tenantScope;
    void _capabilityId;
    void _receipt;
    return Promise.reject(new Error('IAE_WORKER_CAPABILITY_REPOSITORY_UNAVAILABLE'));
  }

  public withTransaction<TValue>(
    _tenantScope: TenantScopeV1,
    _work: (transaction: IaeWorkerCapabilityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    void _tenantScope;
    void _work;
    return Promise.reject(new Error('IAE_WORKER_CAPABILITY_REPOSITORY_UNAVAILABLE'));
  }

  public revokeForAttempt(
    _tenantScope: TenantScopeV1,
    _attemptId: StableIdentifierV1,
    _revokedAt: StrictUtcTimestampV1,
  ): Promise<void> {
    void _tenantScope;
    void _attemptId;
    void _revokedAt;
    return Promise.reject(new Error('IAE_WORKER_CAPABILITY_REPOSITORY_UNAVAILABLE'));
  }
}
