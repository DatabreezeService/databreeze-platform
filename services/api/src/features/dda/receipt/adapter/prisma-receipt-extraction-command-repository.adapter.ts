import { randomUUID } from 'node:crypto';

import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  tenantScopeKeyV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  ReceiptCandidateView,
  ReceiptFieldCandidateView,
} from '../application/receipt-extraction.service.js';
import type {
  ReceiptCandidateLookupInputV1,
  ReceiptCommandReservationInputV1,
  ReceiptCommandReservationResultV1,
  ReceiptCommandOperationV1,
  ReceiptCommandCompletionResultV1,
  ReceiptCommandReconciliationInputV1,
  ReceiptCommandReconciliationResultV1,
  ReceiptExtractionCommandRepositoryPortV1,
} from '../application/receipt-extraction-command.port.js';

export type ReceiptExtractionCommandStateV1 = 'RESERVED' | 'COMPLETED' | 'FAILED';

export interface ReceiptExtractionCommandRowV1 {
  readonly id: string;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly operation: string;
  readonly artifactVersionId: string;
  readonly sourceId: string;
  readonly commandKey: string;
  readonly payloadFingerprint: string;
  readonly state: string;
  readonly ownerToken: string | null;
  readonly leaseExpiresAt: Date | null;
  readonly failureCode: string | null;
  readonly candidateId: string | null;
  readonly candidateDocument: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}

export interface ReceiptExtractionCommandCreateV1 {
  readonly id: string;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly operation: ReceiptCommandOperationV1;
  readonly artifactVersionId: string;
  readonly sourceId: string;
  readonly commandKey: string;
  readonly payloadFingerprint: string;
  readonly state: ReceiptExtractionCommandStateV1;
  readonly ownerToken: string;
  readonly leaseExpiresAt: Date;
  readonly failureCode: string | null;
  readonly candidateId: string | null;
  readonly candidateDocument: unknown;
  readonly createdAt: Date;
}

interface ReceiptExtractionCommandWhereV1 {
  readonly id?: string;
  readonly scopeKey?: string;
  readonly scopeType?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string | null;
  readonly projectId?: string | null;
  readonly operation?: ReceiptCommandOperationV1;
  readonly artifactVersionId?: string;
  readonly sourceId?: string;
  readonly commandKey?: string;
  readonly ownerToken?: string;
  readonly leaseExpiresAt?: Date | null;
  readonly failureCode?: string | null;
  readonly candidateId?: string;
  readonly state?: ReceiptExtractionCommandStateV1;
}

export interface DdaReceiptExtractionCommandDatabaseClientV1 {
  readonly receiptExtractionCommandRecord: {
    findFirst(input: {
      readonly where: ReceiptExtractionCommandWhereV1;
    }): Promise<ReceiptExtractionCommandRowV1 | null>;
    create(input: {
      readonly data: ReceiptExtractionCommandCreateV1;
    }): Promise<ReceiptExtractionCommandRowV1>;
    updateMany(input: {
      readonly where: ReceiptExtractionCommandWhereV1 & {
        readonly state?: ReceiptExtractionCommandStateV1;
      };
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<{ readonly count: number }>;
    deleteMany(input: {
      readonly where: ReceiptExtractionCommandWhereV1 & {
        readonly state?: ReceiptExtractionCommandStateV1;
      };
    }): Promise<{ readonly count: number }>;
  };
}

class PersistedReceiptCommandInvalidError extends Error {
  public constructor() {
    super('DDA_PERSISTED_RECEIPT_COMMAND_INVALID');
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

function isValidToken(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 200 && !/\p{Cc}/u.test(value)
  );
}

function isCoordinate(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value['page']) &&
    Number(value['page']) >= 1 &&
    typeof value['x'] === 'number' &&
    typeof value['y'] === 'number' &&
    typeof value['width'] === 'number' &&
    typeof value['height'] === 'number' &&
    Number(value['x']) >= 0 &&
    Number(value['y']) >= 0 &&
    Number(value['width']) > 0 &&
    Number(value['height']) > 0 &&
    Number(value['x']) + Number(value['width']) <= 1.0000001 &&
    Number(value['y']) + Number(value['height']) <= 1.0000001
  );
}

function parseCandidate(
  value: unknown,
  expected: { readonly tenantScope: TenantScopeV1; readonly artifactVersionId: string },
): ReceiptCandidateView {
  if (!isRecord(value)) throw new PersistedReceiptCommandInvalidError();
  const parsedScope = parseTenantScopeV1(value['tenantScope']);
  const fields = value['fieldCandidates'];
  if (
    !parsedScope.accepted ||
    !tenantScopesEqualV1(parsedScope.value, expected.tenantScope) ||
    value['schemaVersion'] !== 1 ||
    !isStableIdentifier(value['candidateId']) ||
    value['artifactVersionId'] !== expected.artifactVersionId ||
    !isStableIdentifier(value['profileVersionId']) ||
    !Array.isArray(fields) ||
    typeof value['adapterVersion'] !== 'string' ||
    typeof value['modelVersion'] !== 'string' ||
    !isStableIdentifier(value['evidenceReferenceId']) ||
    !isSha256(value['candidateHash']) ||
    value['treatedAsUntrustedData'] !== true ||
    (value['priorCandidateId'] !== undefined && !isStableIdentifier(value['priorCandidateId']))
  ) {
    throw new PersistedReceiptCommandInvalidError();
  }
  const fieldCandidates = fields.map((field) => {
    if (!isRecord(field)) throw new PersistedReceiptCommandInvalidError();
    if (
      typeof field['field'] !== 'string' ||
      typeof field['value'] !== 'string' ||
      typeof field['confidence'] !== 'number' ||
      !Number.isFinite(field['confidence']) ||
      field['confidence'] < 0 ||
      field['confidence'] > 100 ||
      (field['evidenceCoordinates'] !== undefined && !isCoordinate(field['evidenceCoordinates']))
    ) {
      throw new PersistedReceiptCommandInvalidError();
    }
    const evidenceCoordinates =
      field['evidenceCoordinates'] === undefined
        ? undefined
        : (field['evidenceCoordinates'] as NonNullable<
            ReceiptFieldCandidateView['evidenceCoordinates']
          >);
    const next: ReceiptFieldCandidateView = {
      field: field['field'],
      value: field['value'],
      confidence: field['confidence'],
      ...(evidenceCoordinates === undefined ? {} : { evidenceCoordinates }),
    };
    return Object.freeze(next);
  });
  return Object.freeze({
    schemaVersion: 1,
    candidateId: value['candidateId'],
    tenantScope: parsedScope.value,
    artifactVersionId: value['artifactVersionId'],
    profileVersionId: value['profileVersionId'],
    fieldCandidates: Object.freeze(fieldCandidates),
    adapterVersion: value['adapterVersion'],
    modelVersion: value['modelVersion'],
    evidenceReferenceId: value['evidenceReferenceId'],
    candidateHash: value['candidateHash'],
    treatedAsUntrustedData: true,
    ...(typeof value['priorCandidateId'] === 'string'
      ? { priorCandidateId: value['priorCandidateId'] }
      : {}),
  });
}

function scopeColumns(scope: TenantScopeV1): {
  readonly scopeKey: string;
  readonly scopeType: TenantScopeV1['scopeType'];
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
} {
  return {
    scopeKey: tenantScopeKeyV1(scope),
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  };
}

function isP2002(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'P2002';
}

function commandWhere(input: ReceiptCommandReservationInputV1): ReceiptExtractionCommandWhereV1 {
  return {
    ...scopeColumns(input.tenantScope),
    operation: input.operation,
    artifactVersionId: input.artifactVersionId,
    sourceId: input.sourceId,
    commandKey: input.commandKey,
  };
}

function validateRow(row: ReceiptExtractionCommandRowV1): {
  readonly row: ReceiptExtractionCommandRowV1;
  readonly tenantScope: TenantScopeV1;
} {
  const parsedScope = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (
    !isStableIdentifier(row.id) ||
    !parsedScope.accepted ||
    tenantScopeKeyV1(parsedScope.value) !== row.scopeKey ||
    (row.operation !== 'EXTRACT' && row.operation !== 'CORRECT') ||
    !isStableIdentifier(row.artifactVersionId) ||
    !isStableIdentifier(row.sourceId) ||
    typeof row.commandKey !== 'string' ||
    row.commandKey.length === 0 ||
    !isSha256(row.payloadFingerprint) ||
    (row.state !== 'RESERVED' && row.state !== 'COMPLETED' && row.state !== 'FAILED') ||
    (row.state === 'RESERVED' &&
      (row.candidateId !== null ||
        row.candidateDocument !== null ||
        !isValidToken(row.ownerToken) ||
        !isValidDate(row.leaseExpiresAt) ||
        row.failureCode !== null)) ||
    (row.state === 'COMPLETED' &&
      (!isStableIdentifier(row.candidateId) ||
        row.candidateDocument === null ||
        row.ownerToken !== null ||
        row.leaseExpiresAt !== null ||
        row.failureCode !== null)) ||
    (row.state === 'FAILED' &&
      (row.candidateId !== null ||
        row.candidateDocument !== null ||
        !isValidToken(row.ownerToken) ||
        row.leaseExpiresAt !== null ||
        typeof row.failureCode !== 'string' ||
        row.failureCode.length === 0)) ||
    !isValidDate(row.createdAt) ||
    !isValidDate(row.updatedAt) ||
    !(row.completedAt === null || isValidDate(row.completedAt)) ||
    (row.state === 'RESERVED' && row.completedAt !== null) ||
    (row.state === 'COMPLETED' && row.completedAt === null) ||
    (row.state !== 'COMPLETED' && row.completedAt !== null)
  ) {
    throw new PersistedReceiptCommandInvalidError();
  }
  return { row, tenantScope: parsedScope.value };
}

function cloneCandidate(candidate: ReceiptCandidateView): ReceiptCandidateView {
  return parseCandidate(structuredClone(candidate), {
    tenantScope: candidate.tenantScope,
    artifactVersionId: candidate.artifactVersionId,
  });
}

function sameCandidate(left: ReceiptCandidateView, right: ReceiptCandidateView): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function candidateMatchesCommand(
  candidate: ReceiptCandidateView,
  operation: string,
  sourceId: string,
): boolean {
  return operation === 'EXTRACT'
    ? candidate.profileVersionId === sourceId
    : candidate.priorCandidateId === sourceId;
}

/** DDA-041: durable tenant-scoped receipt command reservation and immutable replay. */
export class PrismaReceiptExtractionCommandRepositoryAdapter
  implements ReceiptExtractionCommandRepositoryPortV1
{
  private readonly clock: () => Date;
  private readonly leaseDurationMs: number;

  public constructor(
    private readonly client: DdaReceiptExtractionCommandDatabaseClientV1,
    options: { readonly clock?: () => Date; readonly leaseDurationMs?: number } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    const duration = options.leaseDurationMs ?? 120_000;
    this.leaseDurationMs = Number.isFinite(duration)
      ? Math.min(15 * 60_000, Math.max(1_000, Math.floor(duration)))
      : 120_000;
  }

  private now(): Date {
    const value = this.clock();
    if (!isValidDate(value)) throw new Error('COMMAND_REPOSITORY_UNAVAILABLE');
    return value;
  }

  private ownerToken(): string {
    return randomUUID();
  }

  private leaseUntil(now: Date): Date {
    return new Date(now.getTime() + this.leaseDurationMs);
  }

  public async reserve(
    input: ReceiptCommandReservationInputV1,
  ): Promise<ReceiptCommandReservationResultV1> {
    if (!isSha256(input.payloadFingerprint)) {
      return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
    }
    const where = commandWhere(input);
    try {
      const now = this.now();
      const existing = await this.client.receiptExtractionCommandRecord.findFirst({ where });
      if (existing !== null) return await this.resolveExisting(input, existing, now);
      const id = randomUUID();
      const ownerToken = this.ownerToken();
      await this.client.receiptExtractionCommandRecord.create({
        data: {
          id,
          ...scopeColumns(input.tenantScope),
          operation: input.operation,
          artifactVersionId: input.artifactVersionId,
          sourceId: input.sourceId,
          commandKey: input.commandKey,
          payloadFingerprint: input.payloadFingerprint,
          state: 'RESERVED',
          ownerToken,
          leaseExpiresAt: this.leaseUntil(now),
          failureCode: null,
          candidateId: null,
          candidateDocument: null,
          createdAt: now,
        },
      });
      return { accepted: true, value: { kind: 'RESERVED', reservationId: id, ownerToken } };
    } catch (error) {
      if (!isP2002(error)) return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
      try {
        const raced = await this.client.receiptExtractionCommandRecord.findFirst({ where });
        if (raced === null) return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
        return await this.resolveExisting(input, raced, this.now());
      } catch {
        return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
      }
    }
  }

  public async complete(
    reservationId: string,
    candidate: ReceiptCandidateView,
    ownerToken: string,
  ): Promise<ReceiptCommandCompletionResultV1> {
    try {
      if (!isValidToken(ownerToken)) {
        return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
      }
      const row = await this.client.receiptExtractionCommandRecord.findFirst({
        where: { id: reservationId },
      });
      if (row === null) return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
      const validated = validateRow(row);
      if (validated.row.state !== 'RESERVED') {
        if (validated.row.state === 'COMPLETED' && validated.row.candidateId !== null) {
          const persisted = parseCandidate(validated.row.candidateDocument, {
            tenantScope: validated.tenantScope,
            artifactVersionId: validated.row.artifactVersionId,
          });
          if (
            !candidateMatchesCommand(persisted, validated.row.operation, validated.row.sourceId)
          ) {
            return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
          }
          const requested = cloneCandidate(candidate);
          return sameCandidate(persisted, requested)
            ? { accepted: true }
            : { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
        }
        return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
      }
      if (!isValidToken(validated.row.ownerToken)) {
        return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
      }
      const now = this.now();
      if (
        ownerToken !== validated.row.ownerToken ||
        validated.row.leaseExpiresAt === null ||
        validated.row.leaseExpiresAt.getTime() <= now.getTime()
      ) {
        return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
      }
      const persistedCandidate = cloneCandidate(candidate);
      if (
        !tenantScopesEqualV1(persistedCandidate.tenantScope, validated.tenantScope) ||
        persistedCandidate.artifactVersionId !== validated.row.artifactVersionId ||
        !candidateMatchesCommand(
          persistedCandidate,
          validated.row.operation,
          validated.row.sourceId,
        )
      ) {
        return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
      }
      const updated = await this.client.receiptExtractionCommandRecord.updateMany({
        where: {
          id: reservationId,
          state: 'RESERVED',
          ownerToken: validated.row.ownerToken,
          leaseExpiresAt: validated.row.leaseExpiresAt,
        },
        data: {
          state: 'COMPLETED',
          candidateId: persistedCandidate.candidateId,
          candidateDocument: structuredClone(persistedCandidate),
          completedAt: now,
          updatedAt: now,
          ownerToken: null,
          leaseExpiresAt: null,
          failureCode: null,
        },
      });
      return updated.count === 1
        ? { accepted: true }
        : { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
    } catch {
      return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
    }
  }

  public async reconcileAbandoned(
    input: ReceiptCommandReconciliationInputV1,
  ): Promise<ReceiptCommandReconciliationResultV1> {
    try {
      if (!isValidToken(input.reservationId) || !isValidToken(input.ownerToken))
        return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
      const now = input.now ?? this.now();
      const row = await this.client.receiptExtractionCommandRecord.findFirst({
        where: { id: input.reservationId },
      });
      if (row === null) return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
      const validated = validateRow(row);
      if (
        validated.row.state !== 'RESERVED' ||
        validated.row.ownerToken !== input.ownerToken ||
        validated.row.leaseExpiresAt === null ||
        validated.row.leaseExpiresAt.getTime() > now.getTime()
      ) {
        return { accepted: false, code: 'COMMAND_CONFLICT' };
      }
      const updated = await this.client.receiptExtractionCommandRecord.updateMany({
        where: {
          id: input.reservationId,
          state: 'RESERVED',
          ownerToken: input.ownerToken,
          leaseExpiresAt: validated.row.leaseExpiresAt,
        },
        data: {
          state: 'FAILED',
          leaseExpiresAt: null,
          failureCode: 'LEASE_EXPIRED',
          updatedAt: now,
        },
      });
      return updated.count === 1
        ? { accepted: true, value: { state: 'FAILED' } }
        : { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
    } catch {
      return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
    }
  }

  public async release(reservationId: string, ownerToken: string): Promise<void> {
    try {
      await this.client.receiptExtractionCommandRecord.updateMany({
        where: { id: reservationId, state: 'RESERVED', ownerToken },
        data: {
          state: 'FAILED',
          leaseExpiresAt: null,
          failureCode: 'RELEASED',
          updatedAt: this.now(),
        },
      });
    } catch {
      // The caller already has a fail-closed result. A release failure must not turn it into a
      // misleading success, and the durable unique key remains unavailable until inspected.
    }
  }

  public async findCandidate(
    input: ReceiptCandidateLookupInputV1,
  ): Promise<ReceiptCandidateView | undefined> {
    try {
      const row = await this.client.receiptExtractionCommandRecord.findFirst({
        where: {
          ...scopeColumns(input.tenantScope),
          candidateId: input.candidateId,
          artifactVersionId: input.artifactVersionId,
          state: 'COMPLETED',
        },
      });
      if (row === null) return undefined;
      const validated = validateRow(row);
      const candidate = parseCandidate(validated.row.candidateDocument, {
        tenantScope: input.tenantScope,
        artifactVersionId: input.artifactVersionId,
      });
      if (
        candidate.candidateId !== validated.row.candidateId ||
        !candidateMatchesCommand(candidate, validated.row.operation, validated.row.sourceId)
      ) {
        throw new PersistedReceiptCommandInvalidError();
      }
      return candidate;
    } catch (error) {
      if (error instanceof PersistedReceiptCommandInvalidError) throw error;
      throw new Error('COMMAND_REPOSITORY_UNAVAILABLE');
    }
  }

  private async resolveExisting(
    input: ReceiptCommandReservationInputV1,
    row: ReceiptExtractionCommandRowV1,
    now: Date,
  ): Promise<ReceiptCommandReservationResultV1> {
    const validated = validateRow(row);
    if (
      validated.row.payloadFingerprint !== input.payloadFingerprint ||
      validated.row.scopeKey !== tenantScopeKeyV1(input.tenantScope) ||
      validated.row.operation !== input.operation ||
      validated.row.artifactVersionId !== input.artifactVersionId ||
      validated.row.sourceId !== input.sourceId ||
      validated.row.commandKey !== input.commandKey
    ) {
      return { accepted: false, code: 'COMMAND_CONFLICT' };
    }
    if (validated.row.state === 'RESERVED' || validated.row.state === 'FAILED') {
      if (!isValidToken(validated.row.ownerToken))
        return { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' };
      if (
        validated.row.state === 'RESERVED' &&
        validated.row.leaseExpiresAt !== null &&
        validated.row.leaseExpiresAt.getTime() > now.getTime()
      )
        return { accepted: false, code: 'COMMAND_CONFLICT' };
      const ownerToken = this.ownerToken();
      const updated = await this.client.receiptExtractionCommandRecord.updateMany({
        where: {
          id: validated.row.id,
          state: validated.row.state,
          ownerToken: validated.row.ownerToken,
          ...(validated.row.state === 'RESERVED'
            ? { leaseExpiresAt: validated.row.leaseExpiresAt }
            : { failureCode: validated.row.failureCode }),
        },
        data: {
          state: 'RESERVED',
          ownerToken,
          leaseExpiresAt: this.leaseUntil(now),
          failureCode: null,
          updatedAt: now,
        },
      });
      if (updated.count !== 1) return { accepted: false, code: 'COMMAND_CONFLICT' };
      return {
        accepted: true,
        value: {
          kind: 'RESERVED',
          reservationId: validated.row.id,
          ownerToken,
        },
      };
    }
    if (validated.row.candidateId === null) {
      return { accepted: false, code: 'COMMAND_CONFLICT' };
    }
    const candidate = parseCandidate(validated.row.candidateDocument, {
      tenantScope: input.tenantScope,
      artifactVersionId: input.artifactVersionId,
    });
    if (
      candidate.candidateId !== validated.row.candidateId ||
      !candidateMatchesCommand(candidate, validated.row.operation, validated.row.sourceId)
    ) {
      throw new PersistedReceiptCommandInvalidError();
    }
    return { accepted: true, value: { kind: 'REPLAY', candidate } };
  }
}
