import type {
  EvidenceAccessGrantV1,
  EvidenceGrantActionV1,
} from '@databreeze/domain/evidence-grant/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  EvidenceGrantRepositoryPortV1,
  EvidenceGrantTransactionPortV1,
} from '../application/evidence-grant-repository.port.js';

export interface EvidenceGrantDatabaseRowV1 {
  readonly id: string;
  readonly evidenceId: string;
  readonly artifactVersionId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly recipientDeviceId: string;
  readonly action: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly authorizationEpoch: number;
  readonly maxExcerptBytes: number;
  readonly revokedAt: Date | null;
}

export interface EvidenceGrantDatabaseClientV1 {
  readonly evidenceGrantRecord: {
    create(input: {
      readonly data: Omit<EvidenceGrantDatabaseRowV1, 'revokedAt'> & {
        readonly revokedAt: Date | null;
      };
    }): Promise<EvidenceGrantDatabaseRowV1>;
    findUnique(input: {
      readonly where: { readonly id: string };
    }): Promise<EvidenceGrantDatabaseRowV1 | null>;
    update(input: {
      readonly where: { readonly id: string };
      readonly data: { readonly revokedAt: Date };
    }): Promise<EvidenceGrantDatabaseRowV1>;
  };
  $transaction<TValue>(
    work: (transaction: EvidenceGrantDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function scope(row: EvidenceGrantDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('IAE_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function id(input: string, error: string) {
  const parsed = parseStableIdentifierV1(input);
  if (!parsed.accepted) throw new Error(error);
  return parsed.value;
}

function timestamp(input: Date, error: string) {
  const parsed = parseStrictUtcTimestampV1(input.toISOString());
  if (!parsed.accepted) throw new Error(error);
  return parsed.value;
}

function rowToDomain(row: EvidenceGrantDatabaseRowV1): EvidenceAccessGrantV1 {
  if (!['COORDINATE', 'EXCERPT', 'OPEN_ON_DEVICE'].includes(row.action))
    throw new Error('IAE_PERSISTED_GRANT_ACTION_INVALID');
  if (
    !Number.isSafeInteger(row.authorizationEpoch) ||
    row.authorizationEpoch < 1 ||
    !Number.isSafeInteger(row.maxExcerptBytes) ||
    row.maxExcerptBytes < 0 ||
    row.maxExcerptBytes > 4096
  )
    throw new Error('IAE_PERSISTED_GRANT_LIMIT_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    grantId: id(row.id, 'IAE_PERSISTED_GRANT_ID_INVALID'),
    evidenceId: id(row.evidenceId, 'IAE_PERSISTED_GRANT_ID_INVALID'),
    artifactVersionId: id(row.artifactVersionId, 'IAE_PERSISTED_GRANT_ID_INVALID'),
    tenantScope: scope(row),
    recipientDeviceId: id(row.recipientDeviceId, 'IAE_PERSISTED_GRANT_ID_INVALID'),
    action: row.action as EvidenceGrantActionV1,
    issuedAt: timestamp(row.issuedAt, 'IAE_PERSISTED_GRANT_TIMESTAMP_INVALID'),
    expiresAt: timestamp(row.expiresAt, 'IAE_PERSISTED_GRANT_TIMESTAMP_INVALID'),
    authorizationEpoch: row.authorizationEpoch,
    maxExcerptBytes: row.maxExcerptBytes,
  });
}

function databaseScope(scopeValue: TenantScopeV1) {
  return {
    scopeType: scopeValue.scopeType,
    organizationId: scopeValue.organizationId,
    workspaceId: scopeValue.scopeType === 'organization' ? null : scopeValue.workspaceId,
    projectId: scopeValue.scopeType === 'project' ? scopeValue.projectId : null,
  } as const;
}

function visible(context: TenantScopeV1, row: EvidenceGrantDatabaseRowV1): boolean {
  const candidate = scope(row);
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaEvidenceGrantTransactionAdapter implements EvidenceGrantTransactionPortV1 {
  public constructor(private readonly client: EvidenceGrantDatabaseClientV1) {}

  public async save(context: IamTenantContextV1, grant: EvidenceAccessGrantV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, grant.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.evidenceGrantRecord.findUnique({
      where: { id: grant.grantId },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToDomain(existing)) !== JSON.stringify(grant))
        throw new Error('IAE_IMMUTABLE_GRANT');
      return;
    }
    await this.client.evidenceGrantRecord.create({
      data: {
        ...databaseScope(grant.tenantScope),
        id: grant.grantId,
        evidenceId: grant.evidenceId,
        artifactVersionId: grant.artifactVersionId,
        recipientDeviceId: grant.recipientDeviceId,
        action: grant.action,
        issuedAt: new Date(grant.issuedAt),
        expiresAt: new Date(grant.expiresAt),
        authorizationEpoch: grant.authorizationEpoch,
        maxExcerptBytes: grant.maxExcerptBytes,
        revokedAt: null,
      },
    });
  }

  public async find(
    context: IamTenantContextV1,
    grantId: EvidenceAccessGrantV1['grantId'],
  ): Promise<EvidenceAccessGrantV1 | undefined> {
    const row = await this.client.evidenceGrantRecord.findUnique({ where: { id: grantId } });
    return row !== null && visible(context.tenantScope, row) ? rowToDomain(row) : undefined;
  }

  public async revoke(
    context: IamTenantContextV1,
    grantId: EvidenceAccessGrantV1['grantId'],
  ): Promise<void> {
    const row = await this.client.evidenceGrantRecord.findUnique({ where: { id: grantId } });
    if (row === null || !visible(context.tenantScope, row)) throw new Error('IAE_GRANT_NOT_FOUND');
    if (row.revokedAt !== null) return;
    await this.client.evidenceGrantRecord.update({
      where: { id: grantId },
      data: { revokedAt: new Date() },
    });
  }

  public async isRevoked(
    context: IamTenantContextV1,
    grantId: EvidenceAccessGrantV1['grantId'],
  ): Promise<boolean> {
    const row = await this.client.evidenceGrantRecord.findUnique({ where: { id: grantId } });
    return row !== null && visible(context.tenantScope, row) && row.revokedAt !== null;
  }
}

export class PrismaEvidenceGrantRepositoryAdapter implements EvidenceGrantRepositoryPortV1 {
  public constructor(private readonly client: EvidenceGrantDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: EvidenceGrantTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaEvidenceGrantTransactionAdapter(transaction)),
    );
  }

  public save(context: IamTenantContextV1, grant: EvidenceAccessGrantV1): Promise<void> {
    return new PrismaEvidenceGrantTransactionAdapter(this.client).save(context, grant);
  }
  public find(
    context: IamTenantContextV1,
    grantId: EvidenceAccessGrantV1['grantId'],
  ): Promise<EvidenceAccessGrantV1 | undefined> {
    return new PrismaEvidenceGrantTransactionAdapter(this.client).find(context, grantId);
  }
  public revoke(
    context: IamTenantContextV1,
    grantId: EvidenceAccessGrantV1['grantId'],
  ): Promise<void> {
    return new PrismaEvidenceGrantTransactionAdapter(this.client).revoke(context, grantId);
  }
  public isRevoked(
    context: IamTenantContextV1,
    grantId: EvidenceAccessGrantV1['grantId'],
  ): Promise<boolean> {
    return new PrismaEvidenceGrantTransactionAdapter(this.client).isRevoked(context, grantId);
  }
}
