import {
  createApprovalDecisionV1,
  createApprovalPolicyV1,
  createApprovalRequestV1,
  type ApprovalDecisionRecordV1,
  type ApprovalPolicyV1,
  type ApprovalRequestV1,
} from '@databreeze/domain/approval/v1';
import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ApprovalRepositoryPortV1,
  ApprovalRequestSearchV1,
  ApprovalTransactionPortV1,
} from '../application/approval-repository.port.js';

type ApprovalOrderByV1 =
  | Readonly<Record<string, 'asc' | 'desc'>>
  | readonly Readonly<Record<string, 'asc' | 'desc'>>[];

export interface ApprovalPolicyDatabaseRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly version: number;
  readonly actionMatcher: unknown;
  readonly minimumApprovals: number;
  readonly eligibleRoles: unknown;
  readonly selfApprovalAllowed: boolean;
  readonly expiresAfterMinutes: number;
  readonly requireMfa: boolean;
  readonly conditions: unknown;
  readonly status: string;
}

export interface ApprovalRequestDatabaseRowV1 {
  readonly id: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectVersion: number;
  readonly subjectHash: string;
  readonly requestedAction: string;
  readonly jobId: string | null;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly status: string;
  readonly requestedBy: string;
  readonly dueAt: Date | null;
  readonly revision: number;
  readonly createdAt: Date;
}

export interface ApprovalDecisionDatabaseRowV1 {
  readonly id: string;
  readonly approvalRequestId: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly actorId: string;
  readonly decision: string;
  readonly reason: string | null;
  readonly mfaAssertionId: string | null;
  readonly subjectHash: string;
  readonly decidedAt: Date;
}

export interface JraApprovalDatabaseClientV1 {
  readonly approvalPolicyRecord: {
    create(input: {
      readonly data: ApprovalPolicyDatabaseRowV1;
    }): Promise<ApprovalPolicyDatabaseRowV1>;
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
    }): Promise<ApprovalPolicyDatabaseRowV1 | null>;
  };
  readonly approvalRequestRecord: {
    create(input: {
      readonly data: ApprovalRequestDatabaseRowV1;
    }): Promise<ApprovalRequestDatabaseRowV1>;
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
    }): Promise<ApprovalRequestDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: ApprovalOrderByV1;
    }): Promise<readonly ApprovalRequestDatabaseRowV1[]>;
    updateMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly data: Readonly<Record<string, unknown>>;
    }): Promise<{ readonly count: number }>;
  };
  readonly approvalDecisionRecord: {
    create(input: {
      readonly data: ApprovalDecisionDatabaseRowV1;
    }): Promise<ApprovalDecisionDatabaseRowV1>;
    findFirst(input: {
      readonly where: Readonly<Record<string, unknown>>;
    }): Promise<ApprovalDecisionDatabaseRowV1 | null>;
    findMany(input: {
      readonly where: Readonly<Record<string, unknown>>;
      readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
    }): Promise<readonly ApprovalDecisionDatabaseRowV1[]>;
  };
  $transaction<TValue>(
    work: (transaction: JraApprovalDatabaseClientV1) => Promise<TValue>,
    options?: { readonly isolationLevel?: 'Serializable' },
  ): Promise<TValue>;
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function workspacePolicyScope(context: IamTenantContextV1) {
  if (context.tenantScope.scopeType === 'organization') {
    throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
  }
  return {
    organizationId: context.tenantScope.organizationId,
    workspaceId: context.tenantScope.workspaceId,
  } as const;
}

function rowScope(row: ApprovalRequestDatabaseRowV1): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('JRA_PERSISTED_APPROVAL_REQUEST_INVALID');
  return parsed.value;
}

function iso(value: Date, errorCode: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(errorCode);
  return value.toISOString();
}

function rowToPolicy(row: ApprovalPolicyDatabaseRowV1): ApprovalPolicyV1 {
  const parsed = createApprovalPolicyV1({
    policyId: row.id,
    workspaceId: row.workspaceId,
    version: row.version,
    actionMatcher: row.actionMatcher,
    minimumApprovals: row.minimumApprovals,
    eligibleRoles: row.eligibleRoles,
    selfApprovalAllowed: row.selfApprovalAllowed,
    expiresAfterMinutes: row.expiresAfterMinutes,
    requireMfa: row.requireMfa,
    status: row.status,
  });
  if (!parsed.accepted) throw new Error('JRA_PERSISTED_APPROVAL_POLICY_INVALID');
  if (parseStableIdentifierV1(row.organizationId).accepted === false) {
    throw new Error('JRA_PERSISTED_APPROVAL_POLICY_INVALID');
  }
  return parsed.value;
}

function rowToRequest(row: ApprovalRequestDatabaseRowV1): ApprovalRequestV1 {
  const tenantScope = rowScope(row);
  const parsed = createApprovalRequestV1({
    requestId: row.id,
    tenantScope,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    subjectVersion: row.subjectVersion,
    subjectHash: row.subjectHash,
    requestedAction: row.requestedAction,
    policyId: row.policyId,
    policyVersion: row.policyVersion,
    requestedBy: row.requestedBy,
    createdAt: iso(row.createdAt, 'JRA_PERSISTED_APPROVAL_REQUEST_INVALID'),
    ...(row.dueAt === null
      ? {}
      : { dueAt: iso(row.dueAt, 'JRA_PERSISTED_APPROVAL_REQUEST_INVALID') }),
  });
  if (
    !parsed.accepted ||
    !['OPEN', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(row.status)
  ) {
    throw new Error('JRA_PERSISTED_APPROVAL_REQUEST_INVALID');
  }
  if (!Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error('JRA_PERSISTED_APPROVAL_REQUEST_INVALID');
  }
  return Object.freeze({
    ...parsed.value,
    status: row.status as ApprovalRequestV1['status'],
    revision: row.revision,
  });
}

function rowToDecision(
  row: ApprovalDecisionDatabaseRowV1,
  request: ApprovalRequestV1,
): ApprovalDecisionRecordV1 {
  const parsed = createApprovalDecisionV1({
    decisionId: row.id,
    request: { ...request, status: 'OPEN' },
    actorId: row.actorId,
    decision: row.decision,
    ...(row.reason === null ? {} : { reason: row.reason }),
    ...(row.mfaAssertionId === null ? {} : { mfaAssertionId: row.mfaAssertionId }),
    subjectHash: row.subjectHash,
    decidedAt: iso(row.decidedAt, 'JRA_PERSISTED_APPROVAL_DECISION_INVALID'),
    actorRole: 'PERSISTED',
    selfApprovalAllowed: true,
    requireMfa: false,
  });
  if (!parsed.accepted) throw new Error('JRA_PERSISTED_APPROVAL_DECISION_INVALID');
  const expected = databaseScope(request.tenantScope);
  if (
    row.organizationId !== expected.organizationId ||
    row.workspaceId !== expected.workspaceId ||
    row.projectId !== expected.projectId ||
    row.approvalRequestId !== request.requestId
  ) {
    throw new Error('JRA_PERSISTED_APPROVAL_DECISION_INVALID');
  }
  return parsed.value;
}

function policyData(
  policy: ApprovalPolicyV1,
  context: IamTenantContextV1,
): ApprovalPolicyDatabaseRowV1 {
  return {
    id: policy.policyId,
    ...workspacePolicyScope(context),
    version: policy.version,
    actionMatcher: policy.actionMatcher,
    minimumApprovals: policy.minimumApprovals,
    eligibleRoles: policy.eligibleRoles,
    selfApprovalAllowed: policy.selfApprovalAllowed,
    expiresAfterMinutes: policy.expiresAfterMinutes,
    requireMfa: policy.requireMfa,
    conditions: {},
    status: policy.status,
  };
}

function requestData(request: ApprovalRequestV1): ApprovalRequestDatabaseRowV1 {
  return {
    id: request.requestId,
    ...databaseScope(request.tenantScope),
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    subjectVersion: request.subjectVersion,
    subjectHash: request.subjectHash,
    requestedAction: request.requestedAction,
    jobId: null,
    policyId: request.policyId,
    policyVersion: request.policyVersion,
    status: request.status,
    requestedBy: request.requestedBy,
    dueAt: request.dueAt === undefined ? null : new Date(request.dueAt),
    revision: request.revision,
    createdAt: new Date(request.createdAt),
  };
}

function decisionData(
  context: IamTenantContextV1,
  decision: ApprovalDecisionRecordV1,
): ApprovalDecisionDatabaseRowV1 {
  return {
    id: decision.decisionId,
    approvalRequestId: decision.requestId,
    ...databaseScope(context.tenantScope),
    actorId: decision.actorId,
    decision: decision.decision,
    reason: decision.reason ?? null,
    mfaAssertionId: decision.mfaAssertionId ?? null,
    subjectHash: decision.subjectHash,
    decidedAt: new Date(decision.decidedAt),
  };
}

function uniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}

class PrismaApprovalTransactionAdapter implements ApprovalTransactionPortV1 {
  public constructor(private readonly client: JraApprovalDatabaseClientV1) {}

  public async savePolicy(context: IamTenantContextV1, policy: ApprovalPolicyV1): Promise<void> {
    const scope = workspacePolicyScope(context);
    if (policy.workspaceId !== scope.workspaceId) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const data = policyData(policy, context);
    const existing = await this.client.approvalPolicyRecord.findFirst({
      where: { id: policy.policyId, ...scope, version: policy.version },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToPolicy(existing)) === JSON.stringify(policy)) return;
      throw new Error('JRA_IMMUTABLE_POLICY');
    }
    try {
      await this.client.approvalPolicyRecord.create({ data });
    } catch (error) {
      if (!uniqueConstraint(error)) throw new Error('JRA_APPROVAL_REPOSITORY_UNAVAILABLE');
      const raced = await this.client.approvalPolicyRecord.findFirst({
        where: { id: policy.policyId, ...scope, version: policy.version },
      });
      if (raced !== null && JSON.stringify(rowToPolicy(raced)) === JSON.stringify(policy)) return;
      throw new Error('JRA_IMMUTABLE_POLICY');
    }
  }

  public async findPolicy(
    context: IamTenantContextV1,
    policyId: StableIdentifierV1,
    version: number,
  ): Promise<ApprovalPolicyV1 | undefined> {
    const scope = workspacePolicyScope(context);
    const row = await this.client.approvalPolicyRecord.findFirst({
      where: { id: policyId, ...scope, version },
    });
    return row === null ? undefined : rowToPolicy(row);
  }

  public async saveRequest(context: IamTenantContextV1, request: ApprovalRequestV1): Promise<void> {
    if (!tenantScopesEqualV1(context.tenantScope, request.tenantScope)) {
      throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    }
    const data = requestData(request);
    const existing = await this.client.approvalRequestRecord.findFirst({
      where: { id: request.requestId, ...databaseScope(request.tenantScope) },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToRequest(existing)) === JSON.stringify(request)) return;
      throw new Error('JRA_IMMUTABLE_REQUEST');
    }
    try {
      await this.client.approvalRequestRecord.create({ data });
    } catch (error) {
      if (!uniqueConstraint(error)) throw new Error('JRA_APPROVAL_REPOSITORY_UNAVAILABLE');
      throw new Error('JRA_IMMUTABLE_REQUEST');
    }
  }

  public async findRequest(
    context: IamTenantContextV1,
    requestId: StableIdentifierV1,
  ): Promise<ApprovalRequestV1 | undefined> {
    const row = await this.client.approvalRequestRecord.findFirst({
      where: { id: requestId, ...databaseScope(context.tenantScope) },
    });
    return row === null ? undefined : rowToRequest(row);
  }

  public async findRequests(
    context: IamTenantContextV1,
    search: ApprovalRequestSearchV1 = {},
  ): Promise<readonly ApprovalRequestV1[]> {
    const where: Record<string, unknown> = { ...databaseScope(context.tenantScope) };
    if (search.subjectType !== undefined) where['subjectType'] = search.subjectType;
    if (search.subjectId !== undefined) where['subjectId'] = search.subjectId;
    if (search.subjectHash !== undefined) where['subjectHash'] = search.subjectHash;
    if (search.requestedAction !== undefined) where['requestedAction'] = search.requestedAction;
    if (search.statuses !== undefined) where['status'] = { in: search.statuses };
    const rows = await this.client.approvalRequestRecord.findMany({
      where,
      // Prisma 7 requires an array when more than one ordering is supplied.
      // Keep the stable createdAt/id keyset order used by the public list.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(rowToRequest);
  }

  public async updateRequest(
    context: IamTenantContextV1,
    request: ApprovalRequestV1,
    expectedRevision: number,
  ): Promise<ApprovalRequestV1 | undefined> {
    if (!tenantScopesEqualV1(context.tenantScope, request.tenantScope)) {
      throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    }
    if (request.revision !== expectedRevision + 1) throw new Error('JRA_REVISION_INVALID');
    const scope = databaseScope(request.tenantScope);
    const existingRow = await this.client.approvalRequestRecord.findFirst({
      where: { id: request.requestId, ...scope },
    });
    if (existingRow === null) return undefined;
    const existing = rowToRequest(existingRow);
    if (!tenantScopesEqualV1(existing.tenantScope, request.tenantScope)) {
      throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    }
    if (
      existing.subjectType !== request.subjectType ||
      existing.subjectId !== request.subjectId ||
      existing.subjectVersion !== request.subjectVersion ||
      existing.subjectHash !== request.subjectHash ||
      existing.requestedAction !== request.requestedAction ||
      existing.policyId !== request.policyId ||
      existing.policyVersion !== request.policyVersion ||
      existing.requestedBy !== request.requestedBy ||
      existing.createdAt !== request.createdAt ||
      existing.dueAt !== request.dueAt
    ) {
      throw new Error('JRA_IMMUTABLE_REQUEST');
    }
    const updated = await this.client.approvalRequestRecord.updateMany({
      where: { id: request.requestId, ...scope, revision: expectedRevision },
      data: { status: request.status, revision: request.revision },
    });
    if (updated.count !== 1) return undefined;
    const stored = await this.client.approvalRequestRecord.findFirst({
      where: { id: request.requestId, ...scope },
    });
    return stored === null ? undefined : rowToRequest(stored);
  }

  public async saveDecision(
    context: IamTenantContextV1,
    decision: ApprovalDecisionRecordV1,
  ): Promise<void> {
    const scope = databaseScope(context.tenantScope);
    const requestRow = await this.client.approvalRequestRecord.findFirst({
      where: { id: decision.requestId, ...scope },
    });
    if (requestRow === null) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const request = rowToRequest(requestRow);
    if (decision.subjectHash !== request.subjectHash) throw new Error('JRA_SUBJECT_HASH_MISMATCH');
    const existing = await this.client.approvalDecisionRecord.findFirst({
      where: { id: decision.decisionId, ...scope },
    });
    if (existing !== null) {
      if (JSON.stringify(rowToDecision(existing, request)) === JSON.stringify(decision)) return;
      throw new Error('JRA_IMMUTABLE_DECISION');
    }
    const actorDuplicate = await this.client.approvalDecisionRecord.findFirst({
      where: { ...scope, approvalRequestId: decision.requestId, actorId: decision.actorId },
    });
    if (actorDuplicate !== null) throw new Error('JRA_DUPLICATE_DECISION');
    try {
      await this.client.approvalDecisionRecord.create({ data: decisionData(context, decision) });
    } catch (error) {
      if (!uniqueConstraint(error)) throw new Error('JRA_APPROVAL_REPOSITORY_UNAVAILABLE');
      const racedActor = await this.client.approvalDecisionRecord.findFirst({
        where: { ...scope, approvalRequestId: decision.requestId, actorId: decision.actorId },
      });
      if (racedActor !== null) throw new Error('JRA_DUPLICATE_DECISION');
      throw new Error('JRA_IMMUTABLE_DECISION');
    }
  }

  public async listDecisions(
    context: IamTenantContextV1,
    requestId: StableIdentifierV1,
  ): Promise<readonly ApprovalDecisionRecordV1[]> {
    const scope = databaseScope(context.tenantScope);
    const requestRow = await this.client.approvalRequestRecord.findFirst({
      where: { id: requestId, ...scope },
    });
    if (requestRow === null) return [];
    const request = rowToRequest(requestRow);
    const rows = await this.client.approvalDecisionRecord.findMany({
      where: { ...scope, approvalRequestId: requestId },
      orderBy: { decidedAt: 'asc', id: 'asc' },
    });
    return rows.map((row) => rowToDecision(row, request));
  }
}

export class PrismaApprovalRepositoryAdapter implements ApprovalRepositoryPortV1 {
  public constructor(private readonly client: JraApprovalDatabaseClientV1) {}

  public savePolicy(context: IamTenantContextV1, policy: ApprovalPolicyV1): Promise<void> {
    return new PrismaApprovalTransactionAdapter(this.client).savePolicy(context, policy);
  }

  public findPolicy(
    context: IamTenantContextV1,
    policyId: StableIdentifierV1,
    version: number,
  ): Promise<ApprovalPolicyV1 | undefined> {
    return new PrismaApprovalTransactionAdapter(this.client).findPolicy(context, policyId, version);
  }

  public saveRequest(context: IamTenantContextV1, request: ApprovalRequestV1): Promise<void> {
    return new PrismaApprovalTransactionAdapter(this.client).saveRequest(context, request);
  }

  public findRequest(
    context: IamTenantContextV1,
    requestId: StableIdentifierV1,
  ): Promise<ApprovalRequestV1 | undefined> {
    return new PrismaApprovalTransactionAdapter(this.client).findRequest(context, requestId);
  }

  public findRequests(
    context: IamTenantContextV1,
    search?: ApprovalRequestSearchV1,
  ): Promise<readonly ApprovalRequestV1[]> {
    return new PrismaApprovalTransactionAdapter(this.client).findRequests(context, search);
  }

  public updateRequest(
    context: IamTenantContextV1,
    request: ApprovalRequestV1,
    expectedRevision: number,
  ): Promise<ApprovalRequestV1 | undefined> {
    return new PrismaApprovalTransactionAdapter(this.client).updateRequest(
      context,
      request,
      expectedRevision,
    );
  }

  public saveDecision(
    context: IamTenantContextV1,
    decision: ApprovalDecisionRecordV1,
  ): Promise<void> {
    return new PrismaApprovalTransactionAdapter(this.client).saveDecision(context, decision);
  }

  public listDecisions(
    context: IamTenantContextV1,
    requestId: StableIdentifierV1,
  ): Promise<readonly ApprovalDecisionRecordV1[]> {
    return new PrismaApprovalTransactionAdapter(this.client).listDecisions(context, requestId);
  }

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ApprovalTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction(
      (transaction) => work(new PrismaApprovalTransactionAdapter(transaction)),
      { isolationLevel: 'Serializable' },
    );
  }
}
