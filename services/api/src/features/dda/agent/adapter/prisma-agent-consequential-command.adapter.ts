import { randomUUID } from 'node:crypto';

import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { canonicalAgentInputFingerprintV1 } from '../application/agent-consequential-command.port.js';

import type {
  AgentCommandAuditOutcomeV1,
  AgentConsequentialCommandInputV1,
  AgentConsequentialCommandPortV1,
  AgentConsequentialCommandReconciliationInputV1,
  AgentConsequentialCommandReconciliationPortV1,
} from '../application/agent-consequential-command.port.js';
import type {
  AgentToolDescriptorV1,
  AgentToolExecutionResultV1,
} from '../application/agent-tool.types.js';

export type DdaAgentConsequentialCommandStateV1 =
  | 'RESERVED'
  | 'COMMITTED'
  | 'FAILED'
  | 'RECONCILIATION_REQUIRED';

export interface DdaAgentConsequentialCommandRowV1 {
  readonly id: string;
  readonly tenantScopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly actorId: string;
  readonly toolName: string;
  readonly idempotencyKey: string;
  readonly inputFingerprint: string;
  readonly correlationId: string;
  readonly state: string;
  readonly ownerToken: string;
  readonly leaseExpiresAt: Date | null;
  readonly auditIntentAt: Date | null;
  readonly auditAttemptedAt: Date | null;
  readonly auditSucceededAt: Date | null;
  readonly auditFailureCode: string | null;
  readonly resultReferenceId: string | null;
  readonly resultDocument: unknown;
  readonly failureCode: string | null;
  readonly reconciliationRequiredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}

export interface DdaAgentConsequentialCommandCreateV1 {
  readonly id: string;
  readonly tenantScopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly actorId: string;
  readonly toolName: string;
  readonly idempotencyKey: string;
  readonly inputFingerprint: string;
  readonly correlationId: string;
  readonly state: 'RESERVED';
  readonly ownerToken: string;
  readonly leaseExpiresAt: Date;
  readonly auditIntentAt: Date;
  readonly auditAttemptedAt: null;
  readonly auditSucceededAt: null;
  readonly auditFailureCode: null;
  readonly resultReferenceId: null;
  readonly resultDocument: null;
  readonly failureCode: null;
  readonly reconciliationRequiredAt: null;
  readonly createdAt: Date;
  readonly completedAt: null;
}

export interface DdaAgentConsequentialCommandDatabaseClientV1 {
  readonly agentConsequentialCommandRecord: {
    create(input: {
      readonly data: DdaAgentConsequentialCommandCreateV1;
    }): Promise<DdaAgentConsequentialCommandRowV1>;
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
    }): Promise<DdaAgentConsequentialCommandRowV1 | null>;
    updateMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<{ readonly count: number }>;
  };
  readonly $transaction: <TValue>(
    callback: (transaction: DdaAgentConsequentialCommandDatabaseClientV1) => Promise<TValue>,
  ) => Promise<TValue>;
}

export interface PrismaAgentConsequentialCommandAdapterOptions {
  readonly now?: () => Date;
  readonly leaseMs?: number;
}

const DEFAULT_LEASE_MS = 120_000;
const MIN_LEASE_MS = 1_000;
const MAX_LEASE_MS = 15 * 60_000;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_TENANT_SCOPE_KEY_LENGTH = 180;
const MAX_TOOL_NAME_LENGTH = 64;
const MAX_OWNER_TOKEN_LENGTH = 128;
const PERSISTED_FORBIDDEN_KEYS = new Set([
  'row',
  'rows',
  'cell',
  'cells',
  'raw',
  'rawvalue',
  'rawvalues',
  'rawcontent',
  'sourcecontent',
  'ocr',
  'ocrtext',
  'path',
  'filepath',
  'localpath',
  'query',
  'sql',
  'secret',
  'token',
  'credential',
  'password',
  'apikey',
]);
const PERSISTED_SECRET_PATTERN = /(?:\bsk|pk|ghp|github_pat|xox[baprs])-[-a-z0-9_]{8,}/iu;
const PERSISTED_PATH_PATTERN = /(?:[a-z]:\\|\\\\|\/(?:users|home|private|var|tmp|mnt)(?:\/|$))/iu;
const PERSISTED_SOURCE_PATTERN =
  /\b(?:raw\s+source|source\s+content|original\s+ocr|ocr\s+content)\b/iu;

type CommandIdentity = Readonly<{
  tenantScopeKey: string;
  scopeType: TenantScopeV1['scopeType'];
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  actorId: string;
  toolName: string;
  idempotencyKey: string;
  inputFingerprint: string;
  correlationId: string;
}>;

type AgentCommandIdentityInput = Pick<
  AgentConsequentialCommandInputV1,
  'context' | 'descriptor' | 'input' | 'idempotencyKey' | 'inputFingerprint' | 'correlationId'
>;

type ReserveOutcome =
  | { readonly kind: 'OWNER'; readonly row: DdaAgentConsequentialCommandRowV1 }
  | { readonly kind: 'REPLAY'; readonly result: AgentToolExecutionResultV1 }
  | { readonly kind: 'REJECTED'; readonly result: AgentToolExecutionResultV1 };

type PersistedResultDocumentV1 = Readonly<{
  readonly value: Record<string, unknown>;
}>;

function rejected(code: 'IDEMPOTENCY_CONFLICT' | 'PROVIDER_FAILURE'): AgentToolExecutionResultV1 {
  return Object.freeze({ accepted: false as const, code });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isValidText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    !/\p{Cc}/u.test(value)
  );
}

function isP2002(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'P2002';
}

function tenantScopeKey(scope: TenantScopeV1): string {
  switch (scope.scopeType) {
    case 'organization':
      return `organization:${scope.organizationId}`;
    case 'workspace':
      return `workspace:${scope.organizationId}:${scope.workspaceId}`;
    case 'project':
      return `project:${scope.organizationId}:${scope.workspaceId}:${scope.projectId}`;
  }
}

function identityFor(input: AgentCommandIdentityInput): CommandIdentity | undefined {
  if (
    !isRecord(input.input) ||
    input.descriptor.sideEffectClass !== 'MUTATION' ||
    input.descriptor.auditPolicy !== 'REQUIRED' ||
    !isValidText(input.descriptor.name, MAX_TOOL_NAME_LENGTH) ||
    !isValidText(input.idempotencyKey, MAX_IDEMPOTENCY_KEY_LENGTH) ||
    !SHA256_PATTERN.test(input.inputFingerprint) ||
    input.input['idempotencyKey'] !== input.idempotencyKey
  ) {
    return undefined;
  }

  const scope = parseTenantScopeV1(input.context.tenantScope);
  const actorId = parseStableIdentifierV1(input.context.actorId);
  const correlationId = parseStableIdentifierV1(input.correlationId);
  if (!scope.accepted || !actorId.accepted || !correlationId.accepted) return undefined;
  let canonicalFingerprint: string;
  try {
    canonicalFingerprint = canonicalAgentInputFingerprintV1(input.input);
  } catch {
    return undefined;
  }
  if (canonicalFingerprint !== input.inputFingerprint) return undefined;

  const canonicalScopeKey = tenantScopeKey(scope.value);
  if (canonicalScopeKey.length > MAX_TENANT_SCOPE_KEY_LENGTH) return undefined;

  return Object.freeze({
    tenantScopeKey: canonicalScopeKey,
    scopeType: scope.value.scopeType,
    organizationId: scope.value.organizationId,
    workspaceId: scope.value.scopeType === 'organization' ? null : scope.value.workspaceId,
    projectId: scope.value.scopeType === 'project' ? scope.value.projectId : null,
    actorId: actorId.value,
    toolName: input.descriptor.name,
    idempotencyKey: input.idempotencyKey,
    inputFingerprint: input.inputFingerprint,
    correlationId: correlationId.value,
  });
}

function keyWhere(identity: CommandIdentity): Readonly<Record<string, unknown>> {
  return {
    tenantScopeKey: identity.tenantScopeKey,
    actorId: identity.actorId,
    toolName: identity.toolName,
    idempotencyKey: identity.idempotencyKey,
  };
}

function resultDocument(value: Record<string, unknown>): PersistedResultDocumentV1 {
  return Object.freeze({ value: Object.freeze(value) });
}

function containsUnsafePersistedValue(
  value: unknown,
  depth = 0,
  active = new WeakSet<object>(),
): boolean {
  if (depth > 8) return true;
  if (typeof value === 'string') {
    return (
      PERSISTED_SECRET_PATTERN.test(value) ||
      PERSISTED_PATH_PATTERN.test(value) ||
      PERSISTED_SOURCE_PATTERN.test(value)
    );
  }
  if (value === null || typeof value !== 'object') return false;
  if (active.has(value)) return true;
  active.add(value);
  try {
    if (Array.isArray(value)) {
      return value.some((item) => containsUnsafePersistedValue(item, depth + 1, active));
    }
    for (const [key, child] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (
        PERSISTED_FORBIDDEN_KEYS.has(lowerKey) ||
        /(?:row|cell|raw|ocr|path|query|sql|secret|token|credential|password|apikey|content)/u.test(
          lowerKey,
        )
      ) {
        return true;
      }
      if (containsUnsafePersistedValue(child, depth + 1, active)) return true;
    }
    return false;
  } finally {
    active.delete(value);
  }
}

function isJsonSafe(value: unknown, depth = 0, active = new WeakSet<object>()): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (active.has(value)) return false;
  active.add(value);
  try {
    if (Array.isArray(value)) return value.every((item) => isJsonSafe(item, depth + 1, active));
    return Object.values(value).every((child) => isJsonSafe(child, depth + 1, active));
  } finally {
    active.delete(value);
  }
}

function safePersistedValue(
  descriptor: AgentToolDescriptorV1,
  value: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(value) || !isJsonSafe(value) || containsUnsafePersistedValue(value))
    return undefined;
  const allowed = new Set(descriptor.outputSchema.properties);
  const keys = Object.keys(value);
  if (
    keys.some((key) => !allowed.has(key)) ||
    descriptor.outputSchema.requiredProperties.some(
      (key) => !Object.prototype.hasOwnProperty.call(value, key),
    )
  ) {
    return undefined;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return undefined;
  }
  if (Buffer.byteLength(serialized, 'utf8') > descriptor.maximumBytes) return undefined;
  return Object.freeze(JSON.parse(serialized) as Record<string, unknown>);
}

function parsePersistedResult(
  descriptor: AgentToolDescriptorV1,
  row: DdaAgentConsequentialCommandRowV1,
): AgentToolExecutionResultV1 | undefined {
  if (
    !isRecord(row.resultDocument) ||
    row.resultReferenceId === null ||
    !parseStableIdentifierV1(row.resultReferenceId).accepted
  ) {
    return undefined;
  }
  const value = safePersistedValue(descriptor, row.resultDocument['value']);
  return value === undefined ? undefined : Object.freeze({ accepted: true as const, value });
}

function validRow(row: DdaAgentConsequentialCommandRowV1): boolean {
  return (
    parseStableIdentifierV1(row.id).accepted &&
    isValidText(row.tenantScopeKey, MAX_TENANT_SCOPE_KEY_LENGTH) &&
    (row.scopeType === 'organization' ||
      row.scopeType === 'workspace' ||
      row.scopeType === 'project') &&
    parseStableIdentifierV1(row.organizationId).accepted &&
    (row.workspaceId === null || parseStableIdentifierV1(row.workspaceId).accepted) &&
    (row.projectId === null || parseStableIdentifierV1(row.projectId).accepted) &&
    ((row.scopeType === 'organization' && row.workspaceId === null && row.projectId === null) ||
      (row.scopeType === 'workspace' && row.workspaceId !== null && row.projectId === null) ||
      (row.scopeType === 'project' && row.workspaceId !== null && row.projectId !== null)) &&
    parseStableIdentifierV1(row.actorId).accepted &&
    isValidText(row.toolName, MAX_TOOL_NAME_LENGTH) &&
    isValidText(row.idempotencyKey, MAX_IDEMPOTENCY_KEY_LENGTH) &&
    SHA256_PATTERN.test(row.inputFingerprint) &&
    parseStableIdentifierV1(row.correlationId).accepted &&
    (row.state === 'RESERVED' ||
      row.state === 'COMMITTED' ||
      row.state === 'FAILED' ||
      row.state === 'RECONCILIATION_REQUIRED') &&
    isValidText(row.ownerToken, MAX_OWNER_TOKEN_LENGTH) &&
    (row.leaseExpiresAt === null || isValidDate(row.leaseExpiresAt)) &&
    (row.auditIntentAt === null || isValidDate(row.auditIntentAt)) &&
    (row.auditAttemptedAt === null || isValidDate(row.auditAttemptedAt)) &&
    (row.auditSucceededAt === null || isValidDate(row.auditSucceededAt)) &&
    (row.auditFailureCode === null || isValidText(row.auditFailureCode, 96)) &&
    (row.resultReferenceId === null || parseStableIdentifierV1(row.resultReferenceId).accepted) &&
    (row.failureCode === null || isValidText(row.failureCode, 96)) &&
    (row.reconciliationRequiredAt === null || isValidDate(row.reconciliationRequiredAt)) &&
    isValidDate(row.createdAt) &&
    isValidDate(row.updatedAt) &&
    (row.completedAt === null || isValidDate(row.completedAt))
  );
}

function validLeaseMs(value: number): boolean {
  return Number.isSafeInteger(value) && value >= MIN_LEASE_MS && value <= MAX_LEASE_MS;
}

export class PrismaAgentConsequentialCommandAdapter
  implements AgentConsequentialCommandPortV1, AgentConsequentialCommandReconciliationPortV1
{
  private readonly now: () => Date;
  private readonly leaseMs: number;

  public constructor(
    private readonly client: DdaAgentConsequentialCommandDatabaseClientV1,
    options: PrismaAgentConsequentialCommandAdapterOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    if (!validLeaseMs(this.leaseMs)) throw new Error('DDA_AGENT_COMMAND_LEASE_INVALID');
  }

  public async execute(
    input: AgentConsequentialCommandInputV1,
  ): Promise<AgentToolExecutionResultV1> {
    const identity = identityFor(input);
    if (identity === undefined) return rejected('PROVIDER_FAILURE');

    const now = this.now();
    if (!isValidDate(now)) return rejected('PROVIDER_FAILURE');
    const ownerToken = randomUUID();
    const reserved = await this.reserve(identity, ownerToken, input.descriptor, now);
    if (reserved.kind === 'REPLAY' || reserved.kind === 'REJECTED') return reserved.result;

    const attempted = await this.runAudit(input.audit, 'ATTEMPTED');
    if (!attempted) {
      await this.failReservation(identity, ownerToken, 'AUDIT_ATTEMPT_FAILED', now);
      return rejected('PROVIDER_FAILURE');
    }
    if (!(await this.markAuditAttempted(identity, ownerToken, now))) {
      await this.reconcileReservation(identity, ownerToken, 'AUDIT_ATTEMPT_STATE_UNCERTAIN', now);
      return rejected('PROVIDER_FAILURE');
    }

    let performed: AgentToolExecutionResultV1;
    try {
      // No abort timeout is used here. A mutation must settle before this boundary reports an
      // outcome; an unknown/expired reservation is reconciled instead of being retried.
      performed = await input.perform();
    } catch {
      await this.reconcileReservation(identity, ownerToken, 'SIDE_EFFECT_OUTCOME_UNKNOWN', now);
      return rejected('PROVIDER_FAILURE');
    }
    if (!performed.accepted) {
      await this.reconcileReservation(identity, ownerToken, 'SIDE_EFFECT_OUTCOME_UNKNOWN', now);
      return rejected('PROVIDER_FAILURE');
    }

    const safeValue = safePersistedValue(input.descriptor, performed.value);
    if (safeValue === undefined) {
      await this.reconcileReservation(identity, ownerToken, 'RESULT_NOT_CONTENT_SAFE', now);
      return rejected('PROVIDER_FAILURE');
    }

    const succeeded = await this.runAudit(input.audit, 'SUCCEEDED');
    if (!succeeded) {
      await this.reconcileReservation(identity, ownerToken, 'AUDIT_SUCCESS_FAILED', now);
      return rejected('PROVIDER_FAILURE');
    }
    if (!(await this.markAuditSucceeded(identity, ownerToken, now))) {
      await this.reconcileReservation(identity, ownerToken, 'AUDIT_SUCCESS_STATE_UNCERTAIN', now);
      return rejected('PROVIDER_FAILURE');
    }

    return this.commit(identity, ownerToken, input.descriptor, safeValue, now);
  }

  public async reconcile(
    input: AgentConsequentialCommandReconciliationInputV1,
  ): Promise<AgentToolExecutionResultV1> {
    const identity = identityFor(input);
    if (identity === undefined) return rejected('PROVIDER_FAILURE');
    const now = this.now();
    if (!isValidDate(now)) return rejected('PROVIDER_FAILURE');
    let row = await this.find(identity);
    if (row === null || !validRow(row)) return rejected('PROVIDER_FAILURE');
    if (row.inputFingerprint !== identity.inputFingerprint) {
      return rejected('IDEMPOTENCY_CONFLICT');
    }
    if (row.state === 'COMMITTED') {
      return parsePersistedResult(input.descriptor, row) ?? rejected('PROVIDER_FAILURE');
    }
    if (row.state === 'FAILED') return rejected('PROVIDER_FAILURE');
    if (row.state === 'RESERVED') {
      if (row.leaseExpiresAt !== null && row.leaseExpiresAt.getTime() > now.getTime()) {
        return rejected('PROVIDER_FAILURE');
      }
      await this.reconcileReservation(
        identity,
        row.ownerToken,
        row.leaseExpiresAt === null ? 'LEASE_MISSING' : 'LEASE_EXPIRED',
        now,
        row.leaseExpiresAt,
      );
      row = await this.find(identity);
      if (row === null || !validRow(row)) return rejected('PROVIDER_FAILURE');
    }
    if (row.state !== 'RECONCILIATION_REQUIRED') return rejected('PROVIDER_FAILURE');
    if (
      !(await this.ensureReconciliationAuditAttempted(identity, row.ownerToken, now, input.audit))
    ) {
      return rejected('PROVIDER_FAILURE');
    }

    if (input.outcome.state === 'FAILED') {
      const failureCode = isValidText(input.outcome.failureCode, 96)
        ? input.outcome.failureCode
        : 'RECONCILIATION_FAILED';
      const count = await this.update(
        identity,
        { ownerToken: row.ownerToken, state: 'RECONCILIATION_REQUIRED' },
        { state: 'FAILED', failureCode, leaseExpiresAt: null, completedAt: now },
      );
      if (count !== 1) return rejected('PROVIDER_FAILURE');
      return rejected('PROVIDER_FAILURE');
    }

    if (!input.outcome.result.accepted) return rejected('PROVIDER_FAILURE');
    const safeValue = safePersistedValue(input.descriptor, input.outcome.result.value);
    if (safeValue === undefined) return rejected('PROVIDER_FAILURE');
    if (!(await this.runAudit(input.audit, 'SUCCEEDED'))) return rejected('PROVIDER_FAILURE');
    if (
      (await this.update(
        identity,
        { ownerToken: row.ownerToken, state: 'RECONCILIATION_REQUIRED' },
        { auditSucceededAt: now },
      )) !== 1
    ) {
      return rejected('PROVIDER_FAILURE');
    }
    const resultReferenceId = randomUUID();
    const count = await this.update(
      identity,
      { ownerToken: row.ownerToken, state: 'RECONCILIATION_REQUIRED', auditSucceededAt: now },
      {
        state: 'COMMITTED',
        resultReferenceId,
        resultDocument: resultDocument(safeValue),
        leaseExpiresAt: null,
        completedAt: now,
      },
    );
    if (count === 1) return Object.freeze({ accepted: true as const, value: safeValue });
    const current = await this.find(identity);
    return current?.state === 'COMMITTED'
      ? (parsePersistedResult(input.descriptor, current) ?? rejected('PROVIDER_FAILURE'))
      : rejected('PROVIDER_FAILURE');
  }

  private async reserve(
    identity: CommandIdentity,
    ownerToken: string,
    descriptor: AgentToolDescriptorV1,
    now: Date,
  ): Promise<ReserveOutcome> {
    const create: DdaAgentConsequentialCommandCreateV1 = {
      id: randomUUID(),
      ...identity,
      state: 'RESERVED',
      ownerToken,
      leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
      auditIntentAt: now,
      auditAttemptedAt: null,
      auditSucceededAt: null,
      auditFailureCode: null,
      resultReferenceId: null,
      resultDocument: null,
      failureCode: null,
      reconciliationRequiredAt: null,
      createdAt: now,
      completedAt: null,
    };
    try {
      const row = await this.client.$transaction((transaction) =>
        transaction.agentConsequentialCommandRecord.create({ data: create }),
      );
      return validRow(row)
        ? { kind: 'OWNER', row }
        : { kind: 'REJECTED', result: rejected('PROVIDER_FAILURE') };
    } catch (error) {
      if (!isP2002(error)) return { kind: 'REJECTED', result: rejected('PROVIDER_FAILURE') };
      const existing = await this.find(identity);
      return existing === null
        ? { kind: 'REJECTED', result: rejected('PROVIDER_FAILURE') }
        : this.existing(identity, existing, descriptor, now);
    }
  }

  private async existing(
    identity: CommandIdentity,
    row: DdaAgentConsequentialCommandRowV1,
    descriptor: AgentToolDescriptorV1,
    now: Date,
  ): Promise<ReserveOutcome> {
    if (
      !validRow(row) ||
      row.tenantScopeKey !== identity.tenantScopeKey ||
      row.scopeType !== identity.scopeType ||
      row.organizationId !== identity.organizationId ||
      row.workspaceId !== identity.workspaceId ||
      row.projectId !== identity.projectId ||
      row.actorId !== identity.actorId ||
      row.toolName !== identity.toolName ||
      row.idempotencyKey !== identity.idempotencyKey
    ) {
      return { kind: 'REJECTED', result: rejected('PROVIDER_FAILURE') };
    }
    if (row.inputFingerprint !== identity.inputFingerprint) {
      return { kind: 'REJECTED', result: rejected('IDEMPOTENCY_CONFLICT') };
    }
    if (row.state === 'COMMITTED') {
      const replay = parsePersistedResult(descriptor, row);
      return replay === undefined
        ? { kind: 'REJECTED', result: rejected('PROVIDER_FAILURE') }
        : { kind: 'REPLAY', result: replay };
    }
    if (row.state === 'RESERVED') {
      if (row.leaseExpiresAt !== null && row.leaseExpiresAt.getTime() > now.getTime()) {
        return { kind: 'REJECTED', result: rejected('PROVIDER_FAILURE') };
      }
      await this.reconcileReservation(
        identity,
        row.ownerToken,
        row.leaseExpiresAt === null ? 'LEASE_MISSING' : 'LEASE_EXPIRED',
        now,
        row.leaseExpiresAt,
      );
    }
    return { kind: 'REJECTED', result: rejected('PROVIDER_FAILURE') };
  }

  private async find(identity: CommandIdentity): Promise<DdaAgentConsequentialCommandRowV1 | null> {
    try {
      return await this.client.$transaction((transaction) =>
        transaction.agentConsequentialCommandRecord.findFirst({ where: keyWhere(identity) }),
      );
    } catch {
      return null;
    }
  }

  private async runAudit(
    audit: (outcome: AgentCommandAuditOutcomeV1) => Promise<boolean>,
    outcome: AgentCommandAuditOutcomeV1,
  ): Promise<boolean> {
    try {
      return (await audit(outcome)) === true;
    } catch {
      return false;
    }
  }

  private async markAuditAttempted(
    identity: CommandIdentity,
    ownerToken: string,
    now: Date,
  ): Promise<boolean> {
    return (
      (await this.update(
        identity,
        { ownerToken, state: 'RESERVED' },
        { auditAttemptedAt: now },
      )) === 1
    );
  }

  private async markAuditSucceeded(
    identity: CommandIdentity,
    ownerToken: string,
    now: Date,
  ): Promise<boolean> {
    return (
      (await this.update(
        identity,
        { ownerToken, state: 'RESERVED' },
        { auditSucceededAt: now },
      )) === 1
    );
  }

  private async ensureReconciliationAuditAttempted(
    identity: CommandIdentity,
    ownerToken: string,
    now: Date,
    audit: (outcome: AgentCommandAuditOutcomeV1) => Promise<boolean>,
  ): Promise<boolean> {
    const row = await this.find(identity);
    if (row?.ownerToken !== ownerToken || row.state !== 'RECONCILIATION_REQUIRED') return false;
    if (row.auditAttemptedAt !== null) return true;
    if (!(await this.runAudit(audit, 'ATTEMPTED'))) return false;
    return (
      (await this.update(
        identity,
        { ownerToken, state: 'RECONCILIATION_REQUIRED' },
        { auditAttemptedAt: now },
      )) === 1
    );
  }

  private async failReservation(
    identity: CommandIdentity,
    ownerToken: string,
    failureCode: string,
    now: Date,
  ): Promise<void> {
    const count = await this.update(
      identity,
      { ownerToken, state: 'RESERVED' },
      {
        state: 'FAILED',
        failureCode,
        auditFailureCode: failureCode,
        leaseExpiresAt: null,
        completedAt: now,
      },
    );
    if (count !== 1)
      await this.reconcileReservation(identity, ownerToken, 'AUDIT_FAILURE_STATE_UNCERTAIN', now);
  }

  private async reconcileReservation(
    identity: CommandIdentity,
    ownerToken: string,
    failureCode: string,
    now: Date,
    leaseExpiresAt?: Date | null,
  ): Promise<void> {
    const where: Record<string, unknown> = { ownerToken, state: 'RESERVED' };
    if (leaseExpiresAt !== undefined) where['leaseExpiresAt'] = leaseExpiresAt;
    await this.update(identity, where, {
      state: 'RECONCILIATION_REQUIRED',
      failureCode,
      reconciliationRequiredAt: now,
      leaseExpiresAt: null,
      completedAt: now,
    });
  }

  private async update(
    identity: CommandIdentity,
    ownerWhere: Readonly<Record<string, unknown>>,
    data: Readonly<Record<string, unknown>>,
  ): Promise<number> {
    try {
      const result = await this.client.$transaction((transaction) =>
        transaction.agentConsequentialCommandRecord.updateMany({
          where: { ...keyWhere(identity), ...ownerWhere },
          data,
        }),
      );
      return result.count;
    } catch {
      return 0;
    }
  }

  private async commit(
    identity: CommandIdentity,
    ownerToken: string,
    descriptor: AgentToolDescriptorV1,
    value: Record<string, unknown>,
    now: Date,
  ): Promise<AgentToolExecutionResultV1> {
    const resultReferenceId = randomUUID();
    const committedDocument = resultDocument(value);
    const count = await this.update(
      identity,
      { ownerToken, state: 'RESERVED', auditSucceededAt: now },
      {
        state: 'COMMITTED',
        resultReferenceId,
        resultDocument: committedDocument,
        leaseExpiresAt: null,
        completedAt: now,
      },
    );
    if (count === 1) return Object.freeze({ accepted: true as const, value });

    const current = await this.find(identity);
    if (current?.state === 'COMMITTED') {
      return parsePersistedResult(descriptor, current) ?? rejected('PROVIDER_FAILURE');
    }
    await this.reconcileReservation(identity, ownerToken, 'COMMIT_STATE_UNCERTAIN', now);
    return rejected('PROVIDER_FAILURE');
  }
}
