import { createHash } from 'node:crypto';

import {
  createDataModePolicyVersionV1,
  type DataModePolicyVersionV1,
} from '@databreeze/domain/data-mode/v1';

import type { DataModePolicyVersionLookupPortV1 } from '../features/dso/application/data-mode-policy-version-lookup.port.js';
import type { ExecutionRouteWorkspacePolicyAuthorityPortV1 } from '../features/dso/application/execution-route-policy-authority.port.js';
import type { WorkspaceDataModePolicyAuthorityPortV1 } from '../features/dso/application/workspace-data-mode-policy-authority.port.js';
import type {
  WorkspaceDataModePolicyActivationParticipantPortV1,
  WorkspaceDataModePolicyActivationResultV1,
  WorkspaceDataModePolicyActivationUseCaseV1,
} from '../features/dso/application/workspace-data-mode-policy-activation.port.js';
import type { WorkspaceExecutionPolicyReferenceAuthorityPortV1 } from '../features/iam/application/workspace-execution-policy-reference.port.js';
import type { WorkspaceExecutionPolicyActivationParticipantPortV1 } from '../features/iam/application/workspace-execution-policy-activation.port.js';
import type { IamTenantContextV1 } from '../features/iam/application/tenant-context.js';

const HASH = /^[a-f0-9]{64}$/u;

/** DSO-026/027 and IAM-019: root comparison of two authorities; mismatch is unavailable. */
export class DsoWorkspacePolicyAuthorityAdapter
  implements ExecutionRouteWorkspacePolicyAuthorityPortV1
{
  public constructor(
    private readonly currentPolicies: WorkspaceDataModePolicyAuthorityPortV1,
    private readonly versions: DataModePolicyVersionLookupPortV1,
    private readonly iamReferences: WorkspaceExecutionPolicyReferenceAuthorityPortV1,
  ) {}

  public async resolveCurrentWorkspacePolicy(
    input: Parameters<
      ExecutionRouteWorkspacePolicyAuthorityPortV1['resolveCurrentWorkspacePolicy']
    >[0],
  ) {
    try {
      const [current, iam] = await Promise.all([
        this.currentPolicies.resolveCurrent(input),
        this.iamReferences.resolveExact(input),
      ]);
      if (
        current === undefined ||
        iam === undefined ||
        current.organizationId !== input.organizationId ||
        current.workspaceId !== input.workspaceId ||
        iam.organizationId !== input.organizationId ||
        iam.workspaceId !== input.workspaceId ||
        current.policyId !== iam.dataModePolicyId ||
        current.currentPolicyVersionId !== iam.currentDataModePolicyVersionId ||
        !HASH.test(current.currentPolicyVersionHash) ||
        !Number.isSafeInteger(current.aggregateRevision) ||
        current.aggregateRevision < 1 ||
        !Number.isSafeInteger(iam.authorizationEpoch) ||
        iam.authorizationEpoch < 1
      )
        return undefined;
      const value = await this.versions.findExact({
        ...input,
        policyId: current.policyId,
        policyVersionId: current.currentPolicyVersionId,
      });
      if (value === undefined) return undefined;
      const parsed = createDataModePolicyVersionV1(value);
      if (
        !parsed.accepted ||
        parsed.value.organizationId !== input.organizationId ||
        parsed.value.workspaceId !== input.workspaceId ||
        parsed.value.policyId !== current.policyId ||
        parsed.value.policyVersionId !== current.currentPolicyVersionId ||
        parsed.value.canonicalHash !== current.currentPolicyVersionHash ||
        parsed.value.mode !== iam.dataModeProjection
      )
        return undefined;
      return Object.freeze({ policy: parsed.value, authorizationEpoch: iam.authorizationEpoch });
    } catch {
      return undefined;
    }
  }
}

export interface WorkspacePolicyActivationParticipantsV1 {
  readonly dso: WorkspaceDataModePolicyActivationParticipantPortV1;
  readonly iam: WorkspaceExecutionPolicyActivationParticipantPortV1;
  readonly audit: WorkspacePolicyActivationAuditParticipantV1;
  readonly outbox: WorkspacePolicyActivationOutboxParticipantV1;
}

export interface WorkspacePolicyActivationAuthorizationV1 {
  readonly authorizationDecisionId: string;
  readonly recentMfaAssertionId: string;
  readonly transitionProofId: string;
}

/** DSO-018: a public root seam. Implementations must prove Admin, recent MFA and transition safety. */
export interface WorkspacePolicyActivationAuthorizationPortV1 {
  authorize(
    context: IamTenantContextV1,
    input: WorkspaceDataModePolicyActivationInputV1,
  ): Promise<
    | ({ readonly allowed: true } & WorkspacePolicyActivationAuthorizationV1)
    | {
        readonly allowed: false;
        readonly code:
          | 'ACTIVATION_UNAUTHORIZED'
          | 'RECENT_MFA_REQUIRED'
          | 'TRANSITION_PROOF_REQUIRED'
          | 'ACTIVATION_GUARDS_UNAVAILABLE';
      }
  >;
}

export interface WorkspacePolicyActivationEffectV1 {
  readonly context: IamTenantContextV1;
  readonly result: WorkspaceDataModePolicyActivationResultV1;
  readonly authorization: WorkspacePolicyActivationAuthorizationV1;
}

/** AUD-001 and DSO-018: append within the same transaction as policy activation. */
export interface WorkspacePolicyActivationAuditParticipantV1 {
  appendActivation(input: WorkspacePolicyActivationEffectV1): Promise<void>;
}

/** DSO-018: append a durable policy-changed event within the same transaction. */
export interface WorkspacePolicyActivationOutboxParticipantV1 {
  appendPolicyChanged(input: WorkspacePolicyActivationEffectV1): Promise<void>;
}

export interface WorkspacePolicyAtomicTransactionPortV1 {
  run<TValue>(
    work: (participants: WorkspacePolicyActivationParticipantsV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export interface WorkspaceDataModePolicyActivationInputV1 {
  readonly policy: DataModePolicyVersionV1;
  readonly expectedAggregateRevision: number;
  readonly expectedCurrentPolicyVersionId?: DataModePolicyVersionV1['policyVersionId'];
  readonly expectedIamPolicyId?: DataModePolicyVersionV1['policyId'];
  readonly expectedIamPolicyVersionId?: DataModePolicyVersionV1['policyVersionId'];
  readonly expectedIamModeProjection?: 'LOCAL' | 'HYBRID' | 'CLOUD';
  readonly expectedAuthorizationEpoch: number;
}

export type WorkspaceDataModePolicyActivationResponseV1 =
  | { readonly accepted: true; readonly value: WorkspaceDataModePolicyActivationResultV1 }
  | {
      readonly accepted: false;
      readonly code:
        | 'INVALID_ACTIVATION'
        | 'SCOPE_MISMATCH'
        | 'ACTIVATION_UNAUTHORIZED'
        | 'RECENT_MFA_REQUIRED'
        | 'TRANSITION_PROOF_REQUIRED'
        | 'ACTIVATION_GUARDS_UNAVAILABLE'
        | 'ACTIVATION_STALE'
        | 'IDEMPOTENCY_CONFLICT'
        | 'PERSISTENCE_UNAVAILABLE';
    };

function activationRequestHash(
  context: IamTenantContextV1,
  input: WorkspaceDataModePolicyActivationInputV1,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        organizationId: context.tenantScope.organizationId,
        workspaceId:
          context.tenantScope.scopeType === 'workspace'
            ? context.tenantScope.workspaceId
            : undefined,
        policy: input.policy,
        expectedAggregateRevision: input.expectedAggregateRevision,
        expectedCurrentPolicyVersionId: input.expectedCurrentPolicyVersionId ?? null,
        expectedIamPolicyId: input.expectedIamPolicyId ?? null,
        expectedIamPolicyVersionId: input.expectedIamPolicyVersionId ?? null,
        expectedIamModeProjection: input.expectedIamModeProjection ?? null,
        expectedAuthorizationEpoch: input.expectedAuthorizationEpoch,
      }),
      'utf8',
    )
    .digest('hex');
}

/** Internal coordinator. Authorization, recent MFA, and transition workflow must precede this call. */
export class WorkspaceDataModePolicyActivationService
  implements WorkspaceDataModePolicyActivationUseCaseV1
{
  public constructor(
    private readonly transactions: WorkspacePolicyAtomicTransactionPortV1,
    private readonly authorization?: WorkspacePolicyActivationAuthorizationPortV1,
  ) {}

  public async activate(
    context: IamTenantContextV1,
    input: WorkspaceDataModePolicyActivationInputV1,
  ): Promise<WorkspaceDataModePolicyActivationResponseV1> {
    const parsed = createDataModePolicyVersionV1(input.policy);
    if (
      !parsed.accepted ||
      !Number.isSafeInteger(input.expectedAggregateRevision) ||
      input.expectedAggregateRevision < 0 ||
      !Number.isSafeInteger(input.expectedAuthorizationEpoch) ||
      input.expectedAuthorizationEpoch < 1
    )
      return Object.freeze({ accepted: false, code: 'INVALID_ACTIVATION' });
    const tenantScope = context.tenantScope;
    if (
      tenantScope.scopeType !== 'workspace' ||
      parsed.value.organizationId !== tenantScope.organizationId ||
      parsed.value.workspaceId !== tenantScope.workspaceId
    )
      return Object.freeze({ accepted: false, code: 'SCOPE_MISMATCH' });
    if (this.authorization === undefined)
      return Object.freeze({ accepted: false, code: 'ACTIVATION_GUARDS_UNAVAILABLE' });
    let authorization: WorkspacePolicyActivationAuthorizationV1;
    try {
      const decision = await this.authorization.authorize(context, {
        ...input,
        policy: parsed.value,
      });
      if (!decision.allowed) return Object.freeze({ accepted: false, code: decision.code });
      if (
        decision.authorizationDecisionId.length === 0 ||
        decision.recentMfaAssertionId.length === 0 ||
        decision.transitionProofId.length === 0
      )
        return Object.freeze({ accepted: false, code: 'ACTIVATION_GUARDS_UNAVAILABLE' });
      authorization = decision;
    } catch {
      return Object.freeze({ accepted: false, code: 'ACTIVATION_GUARDS_UNAVAILABLE' });
    }
    const requestHash = activationRequestHash(context, { ...input, policy: parsed.value });
    try {
      const value = await this.transactions.run(async ({ dso, iam, audit, outbox }) => {
        const dsoResult = await dso.apply({
          organizationId: tenantScope.organizationId,
          workspaceId: tenantScope.workspaceId,
          idempotencyKey: context.idempotencyKey,
          requestHash,
          policy: parsed.value,
          expectedAggregateRevision: input.expectedAggregateRevision,
          ...(input.expectedCurrentPolicyVersionId === undefined
            ? {}
            : { expectedCurrentPolicyVersionId: input.expectedCurrentPolicyVersionId }),
          expectedAuthorizationEpoch: input.expectedAuthorizationEpoch,
        });
        if (dsoResult.replayed) return dsoResult;
        const nextEpoch = await iam.compareAndSet({
          organizationId: tenantScope.organizationId,
          workspaceId: tenantScope.workspaceId,
          ...(input.expectedIamPolicyId === undefined
            ? {}
            : { expectedPolicyId: input.expectedIamPolicyId }),
          ...(input.expectedIamPolicyVersionId === undefined
            ? {}
            : { expectedPolicyVersionId: input.expectedIamPolicyVersionId }),
          ...(input.expectedIamModeProjection === undefined
            ? {}
            : { expectedModeProjection: input.expectedIamModeProjection }),
          expectedAuthorizationEpoch: input.expectedAuthorizationEpoch,
          nextPolicyId: parsed.value.policyId,
          nextPolicyVersionId: parsed.value.policyVersionId,
          nextModeProjection: parsed.value.mode,
        });
        if (nextEpoch !== dsoResult.authorizationEpoch)
          throw new Error('IAM_AUTHORIZATION_EPOCH_MISMATCH');
        const effect = Object.freeze({ context, result: dsoResult, authorization });
        await audit.appendActivation(effect);
        await outbox.appendPolicyChanged(effect);
        return dsoResult;
      });
      return Object.freeze({ accepted: true, value });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const code = message.includes('IDEMPOTENCY')
        ? 'IDEMPOTENCY_CONFLICT'
        : message.includes('STALE') || message.includes('MISMATCH')
          ? 'ACTIVATION_STALE'
          : 'PERSISTENCE_UNAVAILABLE';
      return Object.freeze({ accepted: false, code });
    }
  }
}

interface ActivationVersionDelegateV1 {
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
  findFirst(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<unknown>;
}

interface ActivationPointerDelegateV1 {
  findFirst(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<unknown>;
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

interface ActivationReceiptDelegateV1 {
  findFirst(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<unknown>;
  create(input: { readonly data: Readonly<Record<string, unknown>> }): Promise<unknown>;
}

interface ActivationWorkspaceDelegateV1 {
  updateMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly data: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly count: number }>;
}

export interface WorkspacePolicyActivationDatabaseClientV1 {
  readonly deviceDataModePolicyRecord: ActivationVersionDelegateV1;
  readonly workspaceDataModePolicyRecord: ActivationPointerDelegateV1;
  readonly workspacePolicyActivationRecord: ActivationReceiptDelegateV1;
  readonly workspaceIdentity: ActivationWorkspaceDelegateV1;
  $transaction<TValue>(
    work: (transaction: WorkspacePolicyActivationDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export interface WorkspacePolicyActivationEffectParticipantFactoryV1 {
  forTransaction(transaction: WorkspacePolicyActivationDatabaseClientV1): {
    readonly audit: WorkspacePolicyActivationAuditParticipantV1;
    readonly outbox: WorkspacePolicyActivationOutboxParticipantV1;
  };
}

interface PersistedActivationReceiptV1 {
  readonly organizationId: unknown;
  readonly workspaceId: unknown;
  readonly idempotencyKey: unknown;
  readonly requestHash: unknown;
  readonly policySnapshot: unknown;
  readonly aggregateRevision: unknown;
  readonly authorizationEpoch: unknown;
}

interface PersistedCurrentPolicyV1 {
  readonly id: unknown;
  readonly organizationId: unknown;
  readonly workspaceId: unknown;
  readonly currentVersionId: unknown;
  readonly currentVersionHash: unknown;
  readonly revision: unknown;
}

function activationReceipt(
  value: unknown,
  input: Parameters<WorkspaceDataModePolicyActivationParticipantPortV1['apply']>[0],
): WorkspaceDataModePolicyActivationResultV1 | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const row = value as PersistedActivationReceiptV1;
  const policy = createDataModePolicyVersionV1(
    row.policySnapshot as Parameters<typeof createDataModePolicyVersionV1>[0],
  );
  if (
    row.organizationId !== input.organizationId ||
    row.workspaceId !== input.workspaceId ||
    row.idempotencyKey !== input.idempotencyKey ||
    typeof row.requestHash !== 'string' ||
    !HASH.test(row.requestHash) ||
    !policy.accepted ||
    !Number.isSafeInteger(row.aggregateRevision) ||
    (row.aggregateRevision as number) < 1 ||
    !Number.isSafeInteger(row.authorizationEpoch) ||
    (row.authorizationEpoch as number) < 1
  )
    return undefined;
  if (row.requestHash !== input.requestHash) throw new Error('DSO_IDEMPOTENCY_CONFLICT');
  return Object.freeze({
    replayed: true,
    policy: policy.value,
    aggregateRevision: row.aggregateRevision as number,
    authorizationEpoch: row.authorizationEpoch as number,
    requestHash: row.requestHash,
  });
}

function versionCreateData(policy: DataModePolicyVersionV1): Readonly<Record<string, unknown>> {
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

class PrismaWorkspaceDataModePolicyActivationParticipant
  implements WorkspaceDataModePolicyActivationParticipantPortV1
{
  public constructor(private readonly database: WorkspacePolicyActivationDatabaseClientV1) {}

  public async apply(
    input: Parameters<WorkspaceDataModePolicyActivationParticipantPortV1['apply']>[0],
  ): Promise<WorkspaceDataModePolicyActivationResultV1> {
    const existingReceipt = await this.database.workspacePolicyActivationRecord.findFirst({
      where: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (existingReceipt !== null) {
      const replay = activationReceipt(existingReceipt, input);
      if (replay === undefined) throw new Error('DSO_PERSISTED_ACTIVATION_INVALID');
      return replay;
    }

    const currentValue = await this.database.workspaceDataModePolicyRecord.findFirst({
      where: { organizationId: input.organizationId, workspaceId: input.workspaceId },
    });
    const current = currentValue as PersistedCurrentPolicyV1 | null;
    const nextRevision = input.expectedAggregateRevision + 1;
    if (current === null) {
      if (
        input.expectedAggregateRevision !== 0 ||
        input.expectedCurrentPolicyVersionId !== undefined
      )
        throw new Error('DSO_ACTIVATION_STALE');
    } else if (
      current.id !== input.policy.policyId ||
      current.organizationId !== input.organizationId ||
      current.workspaceId !== input.workspaceId ||
      current.revision !== input.expectedAggregateRevision ||
      current.currentVersionId !== input.expectedCurrentPolicyVersionId
    ) {
      throw new Error('DSO_ACTIVATION_STALE');
    }

    try {
      await this.database.deviceDataModePolicyRecord.create({
        data: versionCreateData(input.policy),
      });
      if (current === null) {
        await this.database.workspaceDataModePolicyRecord.create({
          data: {
            id: input.policy.policyId,
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            currentVersionId: input.policy.policyVersionId,
            currentVersionHash: input.policy.canonicalHash,
            revision: nextRevision,
          },
        });
      } else {
        const updated = await this.database.workspaceDataModePolicyRecord.updateMany({
          where: {
            id: input.policy.policyId,
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            currentVersionId: input.expectedCurrentPolicyVersionId,
            revision: input.expectedAggregateRevision,
          },
          data: {
            currentVersionId: input.policy.policyVersionId,
            currentVersionHash: input.policy.canonicalHash,
            revision: nextRevision,
          },
        });
        if (updated.count !== 1) throw new Error('DSO_ACTIVATION_STALE');
      }
      const result = Object.freeze({
        replayed: false,
        policy: input.policy,
        aggregateRevision: nextRevision,
        authorizationEpoch: input.expectedAuthorizationEpoch + 1,
        requestHash: input.requestHash,
      });
      await this.database.workspacePolicyActivationRecord.create({
        data: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          policySnapshot: input.policy,
          aggregateRevision: result.aggregateRevision,
          authorizationEpoch: result.authorizationEpoch,
        },
      });
      return result;
    } catch (error) {
      const uniqueConflict =
        (typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2002') ||
        (error instanceof Error && /unique/iu.test(error.message));
      if (!uniqueConflict) throw error;
      const racedReceipt = await this.database.workspacePolicyActivationRecord.findFirst({
        where: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (racedReceipt === null) throw error;
      const replay = activationReceipt(racedReceipt, input);
      if (replay === undefined) throw new Error('DSO_PERSISTED_ACTIVATION_INVALID');
      return replay;
    }
  }
}

class PrismaWorkspaceExecutionPolicyActivationParticipant
  implements WorkspaceExecutionPolicyActivationParticipantPortV1
{
  public constructor(private readonly database: WorkspacePolicyActivationDatabaseClientV1) {}

  public async compareAndSet(
    input: Parameters<WorkspaceExecutionPolicyActivationParticipantPortV1['compareAndSet']>[0],
  ): Promise<number> {
    const nextEpoch = input.expectedAuthorizationEpoch + 1;
    const updated = await this.database.workspaceIdentity.updateMany({
      where: {
        id: input.workspaceId,
        organizationId: input.organizationId,
        authorizationEpoch: input.expectedAuthorizationEpoch,
        dataModePolicyId: input.expectedPolicyId ?? null,
        currentDataModePolicyVersionId: input.expectedPolicyVersionId ?? null,
        dataModeProjection: input.expectedModeProjection ?? null,
      },
      data: {
        dataModePolicyId: input.nextPolicyId,
        currentDataModePolicyVersionId: input.nextPolicyVersionId,
        dataModeProjection: input.nextModeProjection,
        authorizationEpoch: nextEpoch,
      },
    });
    if (updated.count !== 1) throw new Error('IAM_ACTIVATION_STALE');
    return nextEpoch;
  }
}

export class PrismaWorkspacePolicyAtomicTransactionAdapter
  implements WorkspacePolicyAtomicTransactionPortV1
{
  public constructor(
    private readonly database: WorkspacePolicyActivationDatabaseClientV1,
    private readonly effects?: WorkspacePolicyActivationEffectParticipantFactoryV1,
  ) {}

  public run<TValue>(
    work: (participants: WorkspacePolicyActivationParticipantsV1) => Promise<TValue>,
  ): Promise<TValue> {
    if (this.effects === undefined)
      return Promise.reject(new Error('DSO_ACTIVATION_EFFECTS_UNAVAILABLE'));
    return this.database.$transaction((transaction) =>
      work({
        dso: new PrismaWorkspaceDataModePolicyActivationParticipant(transaction),
        iam: new PrismaWorkspaceExecutionPolicyActivationParticipant(transaction),
        ...this.effects!.forTransaction(transaction),
      }),
    );
  }
}
