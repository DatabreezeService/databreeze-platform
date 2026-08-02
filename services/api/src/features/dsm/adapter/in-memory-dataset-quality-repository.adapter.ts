import { tenantScopeContainsV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { DatasetQualityResultV1 } from '@databreeze/domain/dataset-quality/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DatasetQualityRepositoryPortV1,
  DatasetQualityTransactionPortV1,
} from '../application/dataset-quality-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function clone(result: DatasetQualityResultV1): DatasetQualityResultV1 {
  return Object.freeze({
    ...result,
    tenantScope: Object.freeze({ ...result.tenantScope }),
    findings: Object.freeze(
      result.findings.map((finding) =>
        Object.freeze({ ...finding, evidenceIds: Object.freeze([...finding.evidenceIds]) }),
      ),
    ),
  });
}

export class InMemoryDatasetQualityRepositoryAdapter implements DatasetQualityRepositoryPortV1 {
  private results = new Map<string, DatasetQualityResultV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, result: DatasetQualityResultV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, result.tenantScope))
      throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = this.results.get(result.resultId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(result))
      throw new Error('DSM_IMMUTABLE_QUALITY_RESULT');
    this.results.set(result.resultId, clone(result));
  }

  public async find(
    context: IamTenantContextV1,
    resultId: DatasetQualityResultV1['resultId'],
  ): Promise<DatasetQualityResultV1 | undefined> {
    await Promise.resolve();
    const result = this.results.get(resultId);
    return result && visible(context.tenantScope, result.tenantScope) ? clone(result) : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    datasetVersionId: DatasetQualityResultV1['datasetVersionId'],
  ): Promise<readonly DatasetQualityResultV1[]> {
    await Promise.resolve();
    return [...this.results.values()]
      .filter(
        (result) =>
          result.datasetVersionId === datasetVersionId &&
          visible(context.tenantScope, result.tenantScope),
      )
      .sort((left, right) => left.resultId.localeCompare(right.resultId))
      .map(clone);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DatasetQualityTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.results);
    try {
      return await work({
        save: this.save.bind(this),
        find: this.find.bind(this),
        list: this.list.bind(this),
      });
    } catch (error) {
      this.results = before;
      throw error;
    } finally {
      release();
    }
  }
}
