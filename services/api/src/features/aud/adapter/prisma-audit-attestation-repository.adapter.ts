import type { AuditSealAttestationV1 } from '@databreeze/domain/audit/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  tenantScopeKeyV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  AuditAttestationRepositoryPortV1,
  AuditAttestationTransactionPortV1,
} from '../application/audit-attestation-repository.port.js';
import { sameAuditSealAttestationV1 } from '../application/audit-equality.js';

export interface AuditAttestationDatabaseRowV1 {
  readonly id: string;
  readonly schemaVersion: number;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly eventCount: number;
  readonly rootDigest: string;
  readonly sealedAt: Date;
  readonly signerKeyId: string;
  readonly payload: string;
  readonly signature: string;
  readonly createdAt: Date;
}

interface AuditAttestationDatabaseCreateDataV1
  extends Omit<AuditAttestationDatabaseRowV1, 'createdAt'> {
  readonly createdAt: Date;
}

interface AuditAttestationDelegateV1 {
  create(input: {
    readonly data: AuditAttestationDatabaseCreateDataV1;
  }): Promise<AuditAttestationDatabaseRowV1>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<AuditAttestationDatabaseRowV1 | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<readonly AuditAttestationDatabaseRowV1[]>;
}

export interface AuditAttestationDatabaseClientV1 {
  readonly auditSealAttestationRecord: AuditAttestationDelegateV1;
  $transaction<TValue>(
    work: (transaction: AuditAttestationDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function positiveInteger(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

function persistedScope(row: AuditAttestationDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('AUD_PERSISTED_ATTESTATION_SCOPE_INVALID');
  return parsed.value;
}

function persistedAttestation(row: AuditAttestationDatabaseRowV1): AuditSealAttestationV1 {
  const attestationId = parseStableIdentifierV1(row.id);
  const scope = persistedScope(row);
  const sealedAt = parseStrictUtcTimestampV1(row.sealedAt.toISOString());
  if (
    row.schemaVersion !== 1 ||
    !attestationId.accepted ||
    !sealedAt.accepted ||
    !positiveInteger(row.firstSequence) ||
    !positiveInteger(row.lastSequence) ||
    row.lastSequence < row.firstSequence ||
    !positiveInteger(row.eventCount) ||
    !text(row.rootDigest, 512) ||
    !text(row.signerKeyId, 200) ||
    !text(row.payload, 10000) ||
    !text(row.signature, 2048)
  )
    throw new Error('AUD_PERSISTED_ATTESTATION_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    attestationId: attestationId.value,
    tenantScope: scope,
    firstSequence: row.firstSequence,
    lastSequence: row.lastSequence,
    eventCount: row.eventCount,
    rootDigest: row.rootDigest,
    sealedAt: sealedAt.value,
    signerKeyId: row.signerKeyId,
    payload: row.payload,
    signature: row.signature,
  });
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function scopeWhere(context: IamTenantContextV1): Readonly<Record<string, unknown>> {
  if (context.tenantScope.scopeType === 'organization')
    return { organizationId: context.tenantScope.organizationId };
  if (context.tenantScope.scopeType === 'workspace') {
    return {
      organizationId: context.tenantScope.organizationId,
      OR: [
        { scopeType: 'organization' },
        { scopeType: 'workspace', workspaceId: context.tenantScope.workspaceId },
        { scopeType: 'project', workspaceId: context.tenantScope.workspaceId },
      ],
    };
  }
  return {
    organizationId: context.tenantScope.organizationId,
    OR: [
      { scopeType: 'organization' },
      { scopeType: 'workspace', workspaceId: context.tenantScope.workspaceId },
      { scopeType: 'project', projectId: context.tenantScope.projectId },
    ],
  };
}

function attestationData(
  attestation: AuditSealAttestationV1,
): AuditAttestationDatabaseCreateDataV1 {
  return {
    ...databaseScope(attestation.tenantScope),
    id: attestation.attestationId,
    schemaVersion: attestation.schemaVersion,
    scopeKey: tenantScopeKeyV1(attestation.tenantScope),
    firstSequence: attestation.firstSequence,
    lastSequence: attestation.lastSequence,
    eventCount: attestation.eventCount,
    rootDigest: attestation.rootDigest,
    sealedAt: new Date(attestation.sealedAt),
    signerKeyId: attestation.signerKeyId,
    payload: attestation.payload,
    signature: attestation.signature,
    createdAt: new Date(),
  };
}

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

class PrismaAuditAttestationTransactionAdapter implements AuditAttestationTransactionPortV1 {
  public constructor(private readonly client: AuditAttestationDatabaseClientV1) {}

  public async saveAttestation(
    context: IamTenantContextV1,
    attestation: AuditSealAttestationV1,
  ): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, attestation.tenantScope))
      throw new Error('AUD_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.auditSealAttestationRecord.findFirst({
      where: { id: attestation.attestationId },
    });
    if (existing !== null) {
      if (!sameAuditSealAttestationV1(persistedAttestation(existing), attestation))
        throw new Error('AUD_IMMUTABLE_ATTESTATION');
      return;
    }
    await this.client.auditSealAttestationRecord.create({ data: attestationData(attestation) });
  }

  public async findAttestation(
    context: IamTenantContextV1,
    attestationId: StableIdentifierV1,
  ): Promise<AuditSealAttestationV1 | undefined> {
    const row = await this.client.auditSealAttestationRecord.findFirst({
      where: { id: attestationId, ...scopeWhere(context) },
    });
    if (row === null) return undefined;
    const attestation = persistedAttestation(row);
    return visible(context.tenantScope, attestation.tenantScope) ? attestation : undefined;
  }
}

export class PrismaAuditAttestationRepositoryAdapter implements AuditAttestationRepositoryPortV1 {
  public constructor(private readonly client: AuditAttestationDatabaseClientV1) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: AuditAttestationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaAuditAttestationTransactionAdapter(transaction)),
    );
  }

  public saveAttestation(
    context: IamTenantContextV1,
    attestation: AuditSealAttestationV1,
  ): Promise<void> {
    return new PrismaAuditAttestationTransactionAdapter(this.client).saveAttestation(
      context,
      attestation,
    );
  }

  public findAttestation(
    context: IamTenantContextV1,
    attestationId: StableIdentifierV1,
  ): Promise<AuditSealAttestationV1 | undefined> {
    return new PrismaAuditAttestationTransactionAdapter(this.client).findAttestation(
      context,
      attestationId,
    );
  }

  public async listAttestations(
    context: IamTenantContextV1,
  ): Promise<readonly AuditSealAttestationV1[]> {
    const rows = await this.client.auditSealAttestationRecord.findMany({
      where: { organizationId: context.tenantScope.organizationId },
    });
    return rows
      .map(persistedAttestation)
      .filter((attestation) => visible(context.tenantScope, attestation.tenantScope))
      .sort(
        (left, right) =>
          tenantScopeKeyV1(left.tenantScope).localeCompare(tenantScopeKeyV1(right.tenantScope)) ||
          left.lastSequence - right.lastSequence ||
          left.attestationId.localeCompare(right.attestationId),
      );
  }
}
