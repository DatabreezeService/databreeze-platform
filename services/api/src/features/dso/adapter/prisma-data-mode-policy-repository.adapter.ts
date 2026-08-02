import {
  createDataModePolicyVersionV1,
  type DataModePolicyVersionV1,
} from '@databreeze/domain/data-mode/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  DataModePolicyRepositoryPortV1,
  DataModePolicyTransactionPortV1,
} from '../application/data-mode-policy-repository.port.js';

export interface DataModePolicyDatabaseRowV1 {
  readonly id: string;
  readonly policyId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly revision: number;
  readonly mode: string;
  readonly allowedPayloadClasses: unknown;
  readonly allowedPlacementKinds: unknown;
  readonly allowedExecutorClasses: unknown;
  readonly allowedDestinationClasses: unknown;
  readonly canonicalHash: string;
  readonly publishedAt: Date;
}

interface DelegateV1<TRow> {
  create(input: { readonly data: Record<string, unknown> }): Promise<TRow>;
  findUnique(input: { readonly where: { readonly id: string } }): Promise<TRow | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<readonly TRow[]>;
}

export interface DataModePolicyDatabaseClientV1 {
  readonly deviceDataModePolicyRecord: DelegateV1<DataModePolicyDatabaseRowV1>;
  $transaction<TValue>(
    work: (transaction: DataModePolicyDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function scopeMatches(context: IamTenantContextV1, policy: DataModePolicyVersionV1): boolean {
  return (
    context.tenantScope.organizationId === policy.organizationId &&
    (context.tenantScope.scopeType === 'organization' ||
      ('workspaceId' in context.tenantScope &&
        context.tenantScope.workspaceId === policy.workspaceId))
  );
}

function fromRow(row: DataModePolicyDatabaseRowV1): DataModePolicyVersionV1 {
  const result = createDataModePolicyVersionV1({
    policyId: row.policyId,
    policyVersionId: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    revision: row.revision,
    mode: row.mode,
    allowedPayloadClasses: row.allowedPayloadClasses,
    allowedPlacementKinds: row.allowedPlacementKinds,
    allowedExecutorClasses: row.allowedExecutorClasses,
    allowedDestinationClasses: row.allowedDestinationClasses,
    canonicalHash: row.canonicalHash,
    publishedAt: row.publishedAt.toISOString(),
  });
  if (!result.accepted) throw new Error('DSO_PERSISTED_POLICY_INVALID');
  return result.value;
}

function createData(policy: DataModePolicyVersionV1): Record<string, unknown> {
  return {
    id: policy.policyVersionId,
    policyId: policy.policyId,
    organizationId: policy.organizationId,
    workspaceId: policy.workspaceId,
    revision: policy.revision,
    mode: policy.mode,
    allowedPayloadClasses: policy.allowedPayloadClasses,
    allowedPlacementKinds: policy.allowedPlacementKinds,
    allowedExecutorClasses: policy.allowedExecutorClasses,
    allowedDestinationClasses: policy.allowedDestinationClasses,
    canonicalHash: policy.canonicalHash,
    publishedAt: new Date(policy.publishedAt),
  };
}

class PrismaDataModePolicyTransactionAdapter implements DataModePolicyTransactionPortV1 {
  public constructor(private readonly client: DataModePolicyDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, policy: DataModePolicyVersionV1): Promise<void> {
    if (!scopeMatches(context, policy) || context.tenantScope.scopeType !== 'workspace')
      throw new Error('DSO_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.deviceDataModePolicyRecord.findUnique({
      where: { id: policy.policyVersionId },
    });
    if (existing !== null) {
      if (JSON.stringify(fromRow(existing)) !== JSON.stringify(policy))
        throw new Error('DSO_IMMUTABLE_POLICY');
      return;
    }
    await this.client.deviceDataModePolicyRecord.create({ data: createData(policy) });
  }

  public async find(
    context: IamTenantContextV1,
    policyVersionId: DataModePolicyVersionV1['policyVersionId'],
  ): Promise<DataModePolicyVersionV1 | undefined> {
    const row = await this.client.deviceDataModePolicyRecord.findUnique({
      where: { id: policyVersionId },
    });
    if (row === null) return undefined;
    const policy = fromRow(row);
    return scopeMatches(context, policy) ? policy : undefined;
  }

  public async list(
    context: IamTenantContextV1,
    policyId: DataModePolicyVersionV1['policyId'],
  ): Promise<readonly DataModePolicyVersionV1[]> {
    const rows = await this.client.deviceDataModePolicyRecord.findMany({
      where: { organizationId: context.tenantScope.organizationId, policyId },
      orderBy: { revision: 'asc' },
    });
    return rows.map(fromRow).filter((policy) => scopeMatches(context, policy));
  }
}

export class PrismaDataModePolicyRepositoryAdapter implements DataModePolicyRepositoryPortV1 {
  public constructor(private readonly client: DataModePolicyDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: DataModePolicyTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaDataModePolicyTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, policy: DataModePolicyVersionV1): Promise<void> {
    return new PrismaDataModePolicyTransactionAdapter(this.client).save(context, policy);
  }

  public find(
    context: IamTenantContextV1,
    policyVersionId: DataModePolicyVersionV1['policyVersionId'],
  ): Promise<DataModePolicyVersionV1 | undefined> {
    return new PrismaDataModePolicyTransactionAdapter(this.client).find(context, policyVersionId);
  }

  public list(
    context: IamTenantContextV1,
    policyId: DataModePolicyVersionV1['policyId'],
  ): Promise<readonly DataModePolicyVersionV1[]> {
    return new PrismaDataModePolicyTransactionAdapter(this.client).list(context, policyId);
  }
}
