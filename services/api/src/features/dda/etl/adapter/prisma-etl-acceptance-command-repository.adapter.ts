import { randomUUID } from 'node:crypto';

import { parseStableIdentifierV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  EtlAcceptanceReservationInputV1,
  EtlAcceptanceReservationResultV1,
  EtlAcceptanceValueV1,
  EtlAcceptanceCompletionResultV1,
  EtlAcceptanceIdempotencyPortV1,
  EtlAcceptanceReconciliationInputV1,
  EtlAcceptanceReconciliationResultV1,
} from '../application/etl-acceptance-idempotency.port.js';

export type EtlAcceptanceCommandStateV1 = 'RESERVED' | 'COMPLETED' | 'FAILED';

export interface EtlAcceptanceCommandRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly proposalId: string;
  readonly expectedRevision: number;
  readonly commandKey: string;
  readonly payloadFingerprint: string;
  readonly state: string;
  readonly ownerToken: string;
  readonly leaseExpiresAt: Date | null;
  readonly resultDocument: unknown;
  readonly failureCode: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}

export interface EtlAcceptanceCommandCreateV1 {
  readonly id: string;
  readonly scopeType: 'project';
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly proposalId: string;
  readonly expectedRevision: number;
  readonly commandKey: string;
  readonly payloadFingerprint: string;
  readonly state: 'RESERVED';
  readonly ownerToken: string;
  readonly leaseExpiresAt: Date;
  readonly resultDocument: null;
  readonly failureCode: null;
  readonly createdAt: Date;
}

export interface EtlAcceptanceProposalRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly revision: number;
  readonly state: string;
  readonly blockingReasons: readonly unknown[];
}

interface EtlAcceptanceCommandWhereV1 {
  readonly id?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly proposalId?: string;
  readonly expectedRevision?: number;
  readonly commandKey?: string;
  readonly state?: EtlAcceptanceCommandStateV1;
  readonly ownerToken?: string;
}

export interface DdaEtlAcceptanceCommandDatabaseClientV1 {
  readonly etlProposalRecord: {
    findFirst(input: {
      readonly where: {
        readonly id: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
      };
    }): Promise<EtlAcceptanceProposalRowV1 | null>;
    updateMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<{ readonly count: number }>;
  };
  readonly etlAcceptanceCommandRecord: {
    findFirst(input: {
      readonly where: EtlAcceptanceCommandWhereV1;
    }): Promise<EtlAcceptanceCommandRowV1 | null>;
    create(input: {
      readonly data: EtlAcceptanceCommandCreateV1;
    }): Promise<EtlAcceptanceCommandRowV1>;
    updateMany(input: {
      readonly where: EtlAcceptanceCommandWhereV1;
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<{ readonly count: number }>;
  };
  readonly $transaction: <TValue>(
    callback: (client: DdaEtlAcceptanceCommandDatabaseClientV1) => Promise<TValue>,
  ) => Promise<TValue>;
}

export type ReconcileAbandonedEtlAcceptanceInputV1 = EtlAcceptanceReconciliationInputV1;
export type ReconcileAbandonedEtlAcceptanceResultV1 = EtlAcceptanceReconciliationResultV1;

class PersistedEtlAcceptanceInvalidError extends Error {
  public constructor() {
    super('DDA_PERSISTED_ETL_ACCEPTANCE_INVALID');
  }
}

class DurableEtlAcceptanceUnavailableError extends Error {
  public constructor() {
    super('DDA_ETL_COMMAND_UNAVAILABLE');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function isStableIdentifier(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = parseStableIdentifierV1(value);
  return parsed.accepted && parsed.value === value;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isP2002(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'P2002';
}

function requireProjectScope(
  tenantScope: TenantScopeV1,
): Extract<TenantScopeV1, { readonly scopeType: 'project' }> {
  if (tenantScope.scopeType !== 'project') throw new Error('TENANT_SCOPE_REQUIRED');
  return tenantScope;
}

function scopeWhere(tenantScope: TenantScopeV1): {
  readonly scopeType: 'project';
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
} {
  const scope = requireProjectScope(tenantScope);
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
  };
}

function keyWhere(input: EtlAcceptanceReservationInputV1): EtlAcceptanceCommandWhereV1 {
  const scope = scopeWhere(input.tenantScope);
  return {
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    commandKey: input.commandKey,
  };
}

function revisionWhere(input: EtlAcceptanceReservationInputV1): EtlAcceptanceCommandWhereV1 {
  const scope = scopeWhere(input.tenantScope);
  return {
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    proposalId: input.proposalId,
    expectedRevision: input.expectedRevision,
  };
}

function proposalWhere(input: EtlAcceptanceReservationInputV1) {
  const scope = scopeWhere(input.tenantScope);
  return {
    id: input.proposalId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
  };
}

function parseResult(value: unknown): EtlAcceptanceValueV1 {
  if (!isRecord(value)) throw new PersistedEtlAcceptanceInvalidError();
  const lineageIds = value['lineageIds'];
  if (
    !isStableIdentifier(value['proposalId']) ||
    !isStableIdentifier(value['jobId']) ||
    !isStableIdentifier(value['artifactVersionId']) ||
    !isStableIdentifier(value['datasetVersionId']) ||
    typeof value['rowCount'] !== 'number' ||
    !Number.isSafeInteger(value['rowCount']) ||
    value['rowCount'] < 0 ||
    !isSha256(value['contentHash']) ||
    !isSha256(value['schemaHash']) ||
    !Array.isArray(lineageIds) ||
    lineageIds.some((id) => !isStableIdentifier(id)) ||
    typeof value['replayed'] !== 'boolean'
  ) {
    throw new PersistedEtlAcceptanceInvalidError();
  }
  return Object.freeze({
    proposalId: value['proposalId'],
    jobId: value['jobId'],
    artifactVersionId: value['artifactVersionId'],
    datasetVersionId: value['datasetVersionId'],
    rowCount: value['rowCount'],
    contentHash: value['contentHash'],
    schemaHash: value['schemaHash'],
    lineageIds: Object.freeze(lineageIds.map((id) => String(id))),
    replayed: value['replayed'],
  });
}

function validateCommandRow(row: EtlAcceptanceCommandRowV1): EtlAcceptanceCommandRowV1 {
  if (
    !isStableIdentifier(row.id) ||
    row.scopeType !== 'project' ||
    !isStableIdentifier(row.organizationId) ||
    !isStableIdentifier(row.workspaceId) ||
    !isStableIdentifier(row.projectId) ||
    !isStableIdentifier(row.proposalId) ||
    !Number.isSafeInteger(row.expectedRevision) ||
    row.expectedRevision < 1 ||
    typeof row.commandKey !== 'string' ||
    row.commandKey.length === 0 ||
    !isSha256(row.payloadFingerprint) ||
    (row.state !== 'RESERVED' && row.state !== 'COMPLETED' && row.state !== 'FAILED') ||
    typeof row.ownerToken !== 'string' ||
    row.ownerToken.length === 0 ||
    !(row.leaseExpiresAt === null || isValidDate(row.leaseExpiresAt)) ||
    !(row.resultDocument === null || isRecord(row.resultDocument)) ||
    !(row.failureCode === null || typeof row.failureCode === 'string') ||
    !isValidDate(row.createdAt) ||
    !isValidDate(row.updatedAt) ||
    !(row.completedAt === null || isValidDate(row.completedAt))
  ) {
    throw new PersistedEtlAcceptanceInvalidError();
  }
  if (row.state === 'COMPLETED') {
    if (
      row.resultDocument === null ||
      row.failureCode !== null ||
      row.leaseExpiresAt !== null ||
      row.completedAt === null
    ) {
      throw new PersistedEtlAcceptanceInvalidError();
    }
    parseResult(row.resultDocument);
  }
  if (
    row.state === 'RESERVED' &&
    (row.resultDocument !== null ||
      row.failureCode !== null ||
      row.leaseExpiresAt === null ||
      row.completedAt !== null)
  ) {
    throw new PersistedEtlAcceptanceInvalidError();
  }
  if (
    row.state === 'FAILED' &&
    (row.failureCode === null ||
      row.failureCode.length === 0 ||
      row.resultDocument !== null ||
      row.leaseExpiresAt !== null ||
      row.completedAt !== null)
  ) {
    throw new PersistedEtlAcceptanceInvalidError();
  }
  return row;
}

function validateProposalRow(
  row: EtlAcceptanceProposalRowV1,
  input: EtlAcceptanceReservationInputV1,
): EtlAcceptanceProposalRowV1 & { readonly blockingReasons: readonly string[] } {
  const scope = scopeWhere(input.tenantScope);
  if (
    row.id !== input.proposalId ||
    row.scopeType !== scope.scopeType ||
    row.organizationId !== scope.organizationId ||
    row.workspaceId !== scope.workspaceId ||
    row.projectId !== scope.projectId ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    (row.state !== 'NEEDS_REVIEW' &&
      row.state !== 'READY_FOR_ACCEPTANCE' &&
      row.state !== 'ACCEPTED' &&
      row.state !== 'REJECTED') ||
    !Array.isArray(row.blockingReasons) ||
    row.blockingReasons.some((reason) => typeof reason !== 'string')
  ) {
    throw new PersistedEtlAcceptanceInvalidError();
  }
  return row as EtlAcceptanceProposalRowV1 & { readonly blockingReasons: readonly string[] };
}

/** DDA-053: durable acceptance reservation, proposal-revision uniqueness, and completion CAS. */
export class PrismaEtlAcceptanceCommandRepositoryAdapter implements EtlAcceptanceIdempotencyPortV1 {
  private readonly now: () => Date;
  private readonly leaseDurationMs: number;

  public constructor(
    private readonly client: DdaEtlAcceptanceCommandDatabaseClientV1,
    options: { readonly now?: () => Date; readonly leaseDurationMs?: number } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.leaseDurationMs = options.leaseDurationMs ?? 5 * 60 * 1000;
  }

  public async reserveAcceptance(
    input: EtlAcceptanceReservationInputV1,
  ): Promise<EtlAcceptanceReservationResultV1> {
    if (!isSha256(input.payloadFingerprint)) {
      return { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' };
    }
    try {
      requireProjectScope(input.tenantScope);
      const result = await this.client.$transaction(async (client) => {
        const existingByKey = await client.etlAcceptanceCommandRecord.findFirst({
          where: keyWhere(input),
        });
        if (existingByKey !== null) return this.resolveExisting(input, existingByKey);

        const proposal = await client.etlProposalRecord.findFirst({ where: proposalWhere(input) });
        if (proposal === null)
          return { accepted: false as const, code: 'DDA_ETL_NOT_FOUND' as const };
        const current = validateProposalRow(proposal, input);
        if (current.revision !== input.expectedRevision) {
          return { accepted: false as const, code: 'DDA_ETL_REVISION_CONFLICT' as const };
        }
        if (current.state !== 'READY_FOR_ACCEPTANCE' || current.blockingReasons.length > 0) {
          return { accepted: false as const, code: 'DDA_ETL_STALE_PROPOSAL' as const };
        }

        const existingByRevision = await client.etlAcceptanceCommandRecord.findFirst({
          where: revisionWhere(input),
        });
        if (existingByRevision !== null) {
          validateCommandRow(existingByRevision);
          return { accepted: false as const, code: 'DDA_ETL_REVISION_CONFLICT' as const };
        }

        const reservationId = randomUUID();
        const now = this.now();
        await client.etlAcceptanceCommandRecord.create({
          data: {
            id: reservationId,
            ...scopeWhere(input.tenantScope),
            proposalId: input.proposalId,
            expectedRevision: input.expectedRevision,
            commandKey: input.commandKey,
            payloadFingerprint: input.payloadFingerprint,
            state: 'RESERVED',
            ownerToken: reservationId,
            leaseExpiresAt: new Date(now.getTime() + this.leaseDurationMs),
            resultDocument: null,
            failureCode: null,
            createdAt: now,
          },
        });
        return {
          accepted: true as const,
          value: { kind: 'RESERVED' as const, reservationId },
        };
      });
      return result;
    } catch (error) {
      if (!isP2002(error)) return { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' };
      try {
        const byKey = await this.client.etlAcceptanceCommandRecord.findFirst({
          where: keyWhere(input),
        });
        if (byKey !== null) return this.resolveExisting(input, byKey);
        const byRevision = await this.client.etlAcceptanceCommandRecord.findFirst({
          where: revisionWhere(input),
        });
        if (byRevision !== null) {
          validateCommandRow(byRevision);
          return { accepted: false, code: 'DDA_ETL_REVISION_CONFLICT' };
        }
        return { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' };
      } catch {
        return { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' };
      }
    }
  }

  public async completeAcceptance(
    reservationId: string,
    value: EtlAcceptanceValueV1,
  ): Promise<EtlAcceptanceCompletionResultV1> {
    try {
      const completed = await this.client.$transaction(async (client) => {
        const row = await client.etlAcceptanceCommandRecord.findFirst({
          where: { id: reservationId },
        });
        if (row === null) throw new DurableEtlAcceptanceUnavailableError();
        const command = validateCommandRow(row);
        if (command.state !== 'RESERVED' || command.ownerToken !== reservationId) {
          throw new DurableEtlAcceptanceUnavailableError();
        }
        if (command.leaseExpiresAt !== null && command.leaseExpiresAt <= this.now()) {
          throw new DurableEtlAcceptanceUnavailableError();
        }
        const proposal = await client.etlProposalRecord.findFirst({
          where: {
            id: command.proposalId,
            organizationId: command.organizationId,
            workspaceId: command.workspaceId,
            projectId: command.projectId,
          },
        });
        if (proposal === null) throw new DurableEtlAcceptanceUnavailableError();
        const proposalInput: EtlAcceptanceReservationInputV1 = {
          tenantScope: {
            scopeType: 'project',
            organizationId: command.organizationId as never,
            workspaceId: command.workspaceId as never,
            projectId: command.projectId as never,
          },
          proposalId: command.proposalId,
          expectedRevision: command.expectedRevision,
          commandKey: command.commandKey,
          payloadFingerprint: command.payloadFingerprint,
        };
        const current = validateProposalRow(proposal, proposalInput);
        if (
          current.revision !== command.expectedRevision ||
          current.state !== 'READY_FOR_ACCEPTANCE' ||
          current.blockingReasons.length > 0
        ) {
          throw new DurableEtlAcceptanceUnavailableError();
        }
        const persistedValue = parseResult(structuredClone(value));
        if (
          persistedValue.proposalId !== command.proposalId ||
          persistedValue.proposalId !== value.proposalId
        ) {
          throw new DurableEtlAcceptanceUnavailableError();
        }
        const proposalUpdated = await client.etlProposalRecord.updateMany({
          where: {
            id: command.proposalId,
            organizationId: command.organizationId,
            workspaceId: command.workspaceId,
            projectId: command.projectId,
            revision: command.expectedRevision,
            state: 'READY_FOR_ACCEPTANCE',
          },
          data: { state: 'ACCEPTED', revision: command.expectedRevision + 1 },
        });
        if (proposalUpdated.count !== 1) throw new DurableEtlAcceptanceUnavailableError();
        const commandUpdated = await client.etlAcceptanceCommandRecord.updateMany({
          where: { id: reservationId, state: 'RESERVED', ownerToken: reservationId },
          data: {
            state: 'COMPLETED',
            resultDocument: structuredClone(persistedValue),
            failureCode: null,
            leaseExpiresAt: null,
            completedAt: this.now(),
            updatedAt: this.now(),
          },
        });
        if (commandUpdated.count !== 1) throw new DurableEtlAcceptanceUnavailableError();
        return true;
      });
      return completed
        ? { accepted: true }
        : { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' };
    } catch {
      return { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' };
    }
  }

  public async releaseAcceptance(reservationId: string): Promise<void> {
    try {
      await this.client.etlAcceptanceCommandRecord.updateMany({
        where: { id: reservationId, state: 'RESERVED', ownerToken: reservationId },
        data: {
          state: 'FAILED',
          failureCode: 'RELEASED_BEFORE_COMPLETION',
          leaseExpiresAt: null,
          updatedAt: this.now(),
        },
      });
    } catch {
      // A failed release leaves the reservation fail-closed. Reconciliation is explicit.
    }
  }

  public async reconcileAbandonedAcceptance(
    input: EtlAcceptanceReconciliationInputV1,
  ): Promise<EtlAcceptanceReconciliationResultV1> {
    try {
      const row = await this.client.etlAcceptanceCommandRecord.findFirst({
        where: {
          ...keyWhere(input),
          ...revisionWhere(input),
          id: input.reservationId,
        },
      });
      if (row === null) return { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' };
      const command = validateCommandRow(row);
      if (
        command.payloadFingerprint !== input.payloadFingerprint ||
        command.ownerToken !== input.reservationId ||
        command.state !== 'RESERVED' ||
        command.leaseExpiresAt === null ||
        command.leaseExpiresAt > (input.now ?? this.now())
      ) {
        return { accepted: false, code: 'DDA_ETL_COMMAND_CONFLICT' };
      }
      const updated = await this.client.etlAcceptanceCommandRecord.updateMany({
        where: {
          id: input.reservationId,
          organizationId: command.organizationId,
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          state: 'RESERVED',
          ownerToken: command.ownerToken,
        },
        data: {
          state: 'FAILED',
          failureCode: 'LEASE_EXPIRED',
          leaseExpiresAt: null,
          updatedAt: input.now ?? this.now(),
        },
      });
      return updated.count === 1
        ? { accepted: true, value: { state: 'FAILED' } }
        : { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' };
    } catch {
      return { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' };
    }
  }

  private resolveExisting(
    input: EtlAcceptanceReservationInputV1,
    row: EtlAcceptanceCommandRowV1,
  ): EtlAcceptanceReservationResultV1 {
    const command = validateCommandRow(row);
    const scope = scopeWhere(input.tenantScope);
    if (
      command.organizationId !== scope.organizationId ||
      command.workspaceId !== scope.workspaceId ||
      command.projectId !== scope.projectId ||
      command.commandKey !== input.commandKey ||
      command.proposalId !== input.proposalId ||
      command.expectedRevision !== input.expectedRevision
    ) {
      return { accepted: false, code: 'DDA_ETL_COMMAND_CONFLICT' };
    }
    if (command.payloadFingerprint !== input.payloadFingerprint) {
      return { accepted: false, code: 'DDA_ETL_COMMAND_CONFLICT' };
    }
    if (command.state === 'COMPLETED') {
      const acceptance = parseResult(command.resultDocument);
      if (acceptance.proposalId !== command.proposalId) {
        throw new PersistedEtlAcceptanceInvalidError();
      }
      return {
        accepted: true,
        value: { kind: 'REPLAY', acceptance },
      };
    }
    if (command.state === 'FAILED') {
      return { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' };
    }
    return { accepted: false, code: 'DDA_ETL_COMMAND_CONFLICT' };
  }
}
