import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createApprovalDecisionV1,
  createApprovalPolicyV1,
  createApprovalRequestV1,
  type ApprovalDecisionRecordV1,
  type ApprovalPolicyV1,
  type ApprovalRequestV1,
} from '@databreeze/domain/approval/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  PrismaApprovalRepositoryAdapter,
  type ApprovalDecisionDatabaseRowV1,
  type ApprovalPolicyDatabaseRowV1,
  type ApprovalRequestDatabaseRowV1,
  type JraApprovalDatabaseClientV1,
} from '../../../src/features/jra/adapter/prisma-approval-repository.adapter.js';

const ids = Object.freeze({
  organization: '00000000-0000-4000-8000-000000000001',
  otherOrganization: '00000000-0000-4000-8000-000000000101',
  workspace: '00000000-0000-4000-8000-000000000002',
  otherWorkspace: '00000000-0000-4000-8000-000000000102',
  project: '00000000-0000-4000-8000-000000000003',
  otherProject: '00000000-0000-4000-8000-000000000103',
  policy: '00000000-0000-4000-8000-000000000010',
  request: '00000000-0000-4000-8000-000000000011',
  dashboard: '00000000-0000-4000-8000-000000000012',
  actor: '00000000-0000-4000-8000-000000000013',
  requester: '00000000-0000-4000-8000-000000000014',
  decision: '00000000-0000-4000-8000-000000000015',
  correlation: '00000000-0000-4000-8000-000000000016',
  mfa: '00000000-0000-4000-8000-000000000017',
});

const subjectHash = 'a'.repeat(64);

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid Prisma approval test identifier');
  return parsed.value;
}

function context(
  scope: {
    readonly scopeType: 'workspace' | 'project';
    readonly organizationId: string;
    readonly workspaceId: string;
    readonly projectId?: string;
  },
  key: string,
) {
  const result = createIamTenantContextV1({
    tenantScope: scope,
    actorId: ids.actor,
    correlationId: ids.correlation,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context fixture');
  return result.value;
}

const workspaceContext = context(
  { scopeType: 'workspace', organizationId: ids.organization, workspaceId: ids.workspace },
  'jra-prisma-workspace',
);
const projectContext = context(
  {
    scopeType: 'project',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: ids.project,
  },
  'jra-prisma-project',
);
const otherProjectContext = context(
  {
    scopeType: 'project',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    projectId: ids.otherProject,
  },
  'jra-prisma-other-project',
);
const otherWorkspaceContext = context(
  {
    scopeType: 'workspace',
    organizationId: ids.otherOrganization,
    workspaceId: ids.otherWorkspace,
  },
  'jra-prisma-other-workspace',
);

function policy(): ApprovalPolicyV1 {
  const result = createApprovalPolicyV1({
    policyId: ids.policy,
    workspaceId: ids.workspace,
    version: 1,
    actionMatcher: { actionType: 'PUBLISH' },
    minimumApprovals: 1,
    eligibleRoles: ['ADMIN'],
    selfApprovalAllowed: false,
    expiresAfterMinutes: 60,
    requireMfa: true,
    status: 'ACTIVE',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid policy fixture');
  return result.value;
}

function request(): ApprovalRequestV1 {
  const result = createApprovalRequestV1({
    requestId: ids.request,
    tenantScope: projectContext.tenantScope,
    subjectType: 'DASHBOARD_VERSION',
    subjectId: ids.dashboard,
    subjectVersion: 1,
    subjectHash,
    requestedAction: 'PUBLISH',
    policyId: ids.policy,
    policyVersion: 1,
    requestedBy: ids.requester,
    createdAt: '2026-01-01T00:00:00.000Z',
    dueAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid request fixture');
  return result.value;
}

function decision(): ApprovalDecisionRecordV1 {
  const result = createApprovalDecisionV1({
    decisionId: ids.decision,
    request: request(),
    actorId: ids.actor,
    decision: 'APPROVE',
    subjectHash,
    decidedAt: '2026-01-01T00:02:00.000Z',
    actorRole: 'ADMIN',
    selfApprovalAllowed: false,
    requireMfa: true,
    mfaAssertionId: ids.mfa,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid decision fixture');
  return result.value;
}

function database(): {
  readonly client: JraApprovalDatabaseClientV1;
  readonly policies: ApprovalPolicyDatabaseRowV1[];
  readonly requests: ApprovalRequestDatabaseRowV1[];
  readonly decisions: ApprovalDecisionDatabaseRowV1[];
  readonly queries: ReadonlyArray<Readonly<Record<string, unknown>>>;
} {
  const policies: ApprovalPolicyDatabaseRowV1[] = [];
  const requests: ApprovalRequestDatabaseRowV1[] = [];
  const decisions: ApprovalDecisionDatabaseRowV1[] = [];
  const queries: Array<Readonly<Record<string, unknown>>> = [];
  let transactionTail = Promise.resolve();

  const matches = (row: Record<string, unknown>, where: Readonly<Record<string, unknown>>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const clone = <TValue>(value: TValue): TValue => structuredClone(value);

  const client = {
    approvalPolicyRecord: {
      create: async ({ data }: { readonly data: ApprovalPolicyDatabaseRowV1 }) => {
        await Promise.resolve();
        if (policies.some((row) => row.id === data.id)) {
          throw Object.assign(new Error('P2002'), { code: 'P2002' });
        }
        policies.push(clone(data));
        return clone(data);
      },
      findFirst: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        await Promise.resolve();
        queries.push(where);
        return clone(
          policies.find((row) => matches(row as unknown as Record<string, unknown>, where)) ?? null,
        );
      },
    },
    approvalRequestRecord: {
      create: async ({ data }: { readonly data: ApprovalRequestDatabaseRowV1 }) => {
        await Promise.resolve();
        if (requests.some((row) => row.id === data.id)) {
          throw Object.assign(new Error('P2002'), { code: 'P2002' });
        }
        requests.push(clone(data));
        return clone(data);
      },
      findFirst: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        await Promise.resolve();
        queries.push(where);
        return clone(
          requests.find((row) => matches(row as unknown as Record<string, unknown>, where)) ?? null,
        );
      },
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        await Promise.resolve();
        queries.push(where);
        return clone(
          requests
            .filter((row) => matches(row as unknown as Record<string, unknown>, where))
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
        );
      },
      updateMany: async ({
        where,
        data,
      }: {
        readonly where: Readonly<Record<string, unknown>>;
        readonly data: Readonly<Record<string, unknown>>;
      }) => {
        await Promise.resolve();
        queries.push(where);
        let count = 0;
        for (let index = 0; index < requests.length; index += 1) {
          const row = requests[index];
          if (!matches(row as unknown as Record<string, unknown>, where)) continue;
          requests[index] = { ...row, ...data } as ApprovalRequestDatabaseRowV1;
          count += 1;
        }
        return { count };
      },
    },
    approvalDecisionRecord: {
      create: async ({ data }: { readonly data: ApprovalDecisionDatabaseRowV1 }) => {
        await Promise.resolve();
        if (
          decisions.some(
            (row) =>
              row.approvalRequestId === data.approvalRequestId && row.actorId === data.actorId,
          ) ||
          decisions.some((row) => row.id === data.id)
        )
          throw Object.assign(new Error('P2002'), { code: 'P2002' });
        decisions.push(clone(data));
        return clone(data);
      },
      findFirst: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        await Promise.resolve();
        queries.push(where);
        return clone(
          decisions.find((row) => matches(row as unknown as Record<string, unknown>, where)) ??
            null,
        );
      },
      findMany: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        await Promise.resolve();
        queries.push(where);
        return clone(
          decisions.filter((row) => matches(row as unknown as Record<string, unknown>, where)),
        );
      },
    },
    $transaction: async <TValue>(
      work: (transaction: JraApprovalDatabaseClientV1) => Promise<TValue>,
    ) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const before = {
        policies: clone(policies),
        requests: clone(requests),
        decisions: clone(decisions),
      };
      try {
        return await work(client as unknown as JraApprovalDatabaseClientV1);
      } catch (error) {
        policies.splice(0, policies.length, ...before.policies);
        requests.splice(0, requests.length, ...before.requests);
        decisions.splice(0, decisions.length, ...before.decisions);
        throw error;
      } finally {
        release();
      }
    },
  } as unknown as JraApprovalDatabaseClientV1;

  return { client, policies, requests, decisions, queries };
}

function requestRow(value: ApprovalRequestV1): ApprovalRequestDatabaseRowV1 {
  return {
    id: value.requestId,
    scopeType: value.tenantScope.scopeType,
    organizationId: value.tenantScope.organizationId,
    workspaceId:
      value.tenantScope.scopeType === 'organization' ? null : value.tenantScope.workspaceId,
    projectId: value.tenantScope.scopeType === 'project' ? value.tenantScope.projectId : null,
    subjectType: value.subjectType,
    subjectId: value.subjectId,
    subjectVersion: value.subjectVersion,
    subjectHash: value.subjectHash,
    requestedAction: value.requestedAction,
    jobId: null,
    policyId: value.policyId,
    policyVersion: value.policyVersion,
    status: value.status,
    requestedBy: value.requestedBy,
    dueAt: value.dueAt ? new Date(value.dueAt) : null,
    revision: value.revision,
    createdAt: new Date(value.createdAt),
  };
}

void test('[JRA-009, JRA-011, JRA-028] Prisma approvals remain visible after adapter restart and never cross exact scope', async () => {
  const state = database();
  const first = new PrismaApprovalRepositoryAdapter(state.client);
  await first.savePolicy(workspaceContext, policy());
  await first.saveRequest(projectContext, request());

  const restarted = new PrismaApprovalRepositoryAdapter(state.client);
  assert.deepEqual(await restarted.findRequest(projectContext, request().requestId), request());
  assert.equal(await restarted.findRequest(otherProjectContext, request().requestId), undefined);
  assert.equal(await restarted.findRequest(otherWorkspaceContext, request().requestId), undefined);
  assert.equal(await restarted.findPolicy(otherWorkspaceContext, policy().policyId, 1), undefined);
  assert.deepEqual(state.queries.at(-1), {
    id: ids.policy,
    organizationId: ids.otherOrganization,
    workspaceId: ids.otherWorkspace,
    version: 1,
  });
});

void test('[JRA-009, JRA-011] Prisma approval policies and decisions are immutable and actor-unique', async () => {
  const state = database();
  const repository = new PrismaApprovalRepositoryAdapter(state.client);
  const currentPolicy = policy();
  const currentRequest = request();
  const currentDecision = decision();
  await repository.savePolicy(workspaceContext, currentPolicy);
  await repository.saveRequest(projectContext, currentRequest);
  await repository.saveDecision(projectContext, currentDecision);
  await repository.saveDecision(projectContext, currentDecision);
  await assert.rejects(
    repository.savePolicy(workspaceContext, { ...currentPolicy, status: 'RETIRED' }),
    /JRA_IMMUTABLE_POLICY/u,
  );
  await assert.rejects(
    repository.saveDecision(projectContext, {
      ...currentDecision,
      decisionId: stable('00000000-0000-4000-8000-000000000018'),
    }),
    /JRA_DUPLICATE_DECISION/u,
  );
});

void test('[JRA-011, JRA-028] Prisma request updates use an exact revision compare-and-swap and roll back', async () => {
  const state = database();
  const repository = new PrismaApprovalRepositoryAdapter(state.client);
  await repository.savePolicy(workspaceContext, policy());
  await repository.saveRequest(projectContext, request());

  const changed = { ...request(), status: 'APPROVED' as const, revision: 2 };
  assert.deepEqual(await repository.updateRequest(projectContext, changed, 1), changed);
  assert.equal(
    await repository.updateRequest(
      projectContext,
      { ...request(), status: 'REJECTED' as const, revision: 2 },
      1,
    ),
    undefined,
  );

  await assert.rejects(
    repository.withTransaction(projectContext, async (transaction) => {
      await transaction.saveDecision(projectContext, decision());
      throw new Error('force rollback');
    }),
    /force rollback/u,
  );
  assert.equal(state.decisions.length, 0);
});

void test('[JRA-028] Prisma adapters fail safely on corrupt persisted approval rows', async () => {
  const state = database();
  state.requests.push({
    ...requestRow(request()),
    status: 'CORRUPT',
  });
  const repository = new PrismaApprovalRepositoryAdapter(state.client);
  await assert.rejects(
    repository.findRequest(projectContext, request().requestId),
    /JRA_PERSISTED_APPROVAL_REQUEST_INVALID/u,
  );
});

void test('[JRA-010, JRA-011] concurrent Prisma decisions cannot lose the request revision', async () => {
  const state = database();
  const repository = new PrismaApprovalRepositoryAdapter(state.client);
  await repository.savePolicy(workspaceContext, currentPolicyForRace());
  await repository.saveRequest(projectContext, requestForRace());
  const firstDecision = decisionForRace('00000000-0000-4000-8000-000000000021', ids.actor);
  const secondDecision = decisionForRace(
    '00000000-0000-4000-8000-000000000022',
    '00000000-0000-4000-8000-000000000023',
  );

  const outcomes = await Promise.allSettled([
    decide(repository, firstDecision),
    decide(repository, secondDecision),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 2);
  const final = await repository.findRequest(projectContext, requestForRace().requestId);
  assert.equal(final?.status, 'APPROVED');
  assert.equal(final?.revision, 3);
  assert.equal(
    (await repository.listDecisions(projectContext, requestForRace().requestId)).length,
    2,
  );
});

function currentPolicyForRace(): ApprovalPolicyV1 {
  const result = createApprovalPolicyV1({
    policyId: '00000000-0000-4000-8000-000000000024',
    workspaceId: ids.workspace,
    version: 1,
    actionMatcher: { actionType: 'PUBLISH' },
    minimumApprovals: 2,
    eligibleRoles: ['ADMIN', 'OWNER'],
    selfApprovalAllowed: false,
    expiresAfterMinutes: 60,
    requireMfa: true,
    status: 'ACTIVE',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid race policy');
  return result.value;
}

function requestForRace(): ApprovalRequestV1 {
  const result = createApprovalRequestV1({
    requestId: '00000000-0000-4000-8000-000000000025',
    tenantScope: projectContext.tenantScope,
    subjectType: 'DASHBOARD_VERSION',
    subjectId: ids.dashboard,
    subjectVersion: 1,
    subjectHash,
    requestedAction: 'PUBLISH',
    policyId: '00000000-0000-4000-8000-000000000024',
    policyVersion: 1,
    requestedBy: ids.requester,
    createdAt: '2026-01-01T00:00:00.000Z',
    dueAt: '2026-01-01T01:00:00.000Z',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid race request');
  return result.value;
}

function decisionForRace(decisionId: string, actorId: string): ApprovalDecisionRecordV1 {
  const result = createApprovalDecisionV1({
    decisionId,
    request: requestForRace(),
    actorId,
    decision: 'APPROVE',
    subjectHash,
    decidedAt: '2026-01-01T00:02:00.000Z',
    actorRole: 'ADMIN',
    selfApprovalAllowed: false,
    requireMfa: true,
    mfaAssertionId: ids.mfa,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid race decision');
  return result.value;
}

async function decide(
  repository: PrismaApprovalRepositoryAdapter,
  currentDecision: ApprovalDecisionRecordV1,
): Promise<void> {
  await repository.withTransaction(projectContext, async (transaction) => {
    const current = await transaction.findRequest(projectContext, currentDecision.requestId);
    assert.ok(current);
    const decisions = await transaction.listDecisions(projectContext, currentDecision.requestId);
    await transaction.saveDecision(projectContext, currentDecision);
    const next = {
      ...current,
      status: decisions.length + 1 >= 2 ? ('APPROVED' as const) : ('OPEN' as const),
      revision: current.revision + 1,
    };
    const stored = await transaction.updateRequest(projectContext, next, current.revision);
    assert.ok(stored);
  });
}
