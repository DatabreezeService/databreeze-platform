import { createHash } from 'node:crypto';

import type {
  DataClassificationV1,
  SynchronizationPayloadClassV1,
} from '@databreeze/domain/data-mode/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

const SHA256 = /^[a-f0-9]{64}$/u;
const ACTION_TYPE = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_ROUTE_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const CLASSIFICATIONS: readonly DataClassificationV1[] = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
];
const PAYLOAD_CLASSES: readonly SynchronizationPayloadClassV1[] = [
  'CONTROL_METADATA',
  'APPROVED_DERIVED_RESULT',
  'RECONSTRUCTABLE_DERIVED_CONTENT',
  'ORIGINAL_CONTENT',
];

export type ExecutionRouteArtifactDataModeV1 = 'Local' | 'Hybrid' | 'Cloud';

export interface ExecutionRouteInputMetadataV1 {
  readonly artifactVersionId: StableIdentifierV1;
  readonly artifactVersionHash: string;
  readonly placementId: StableIdentifierV1;
  readonly placementHash: string;
  readonly dataMode: ExecutionRouteArtifactDataModeV1;
  readonly classification: DataClassificationV1;
  readonly payloadClass: SynchronizationPayloadClassV1;
  readonly placementKind: string;
  readonly placementAvailable: boolean;
}

export interface ExecutionRouteActionV1 {
  readonly type: string;
  readonly version: number;
  readonly requiredCapabilities: readonly string[];
}

export type ExecutionRouteTargetV1 =
  | {
      readonly target: 'CLOUD';
      readonly executorClass: string;
      readonly grantedCapabilities: readonly string[];
    }
  | {
      readonly target: 'DEVICE';
      readonly targetDeviceId: StableIdentifierV1;
      readonly executorClass: string;
      readonly grantedCapabilities: readonly string[];
    };

export interface ExecutionRouteNarrowingConstraintV1 {
  readonly constraintId: StableIdentifierV1;
  readonly constraintHash: string;
  readonly allowedClassifications: readonly DataClassificationV1[];
  readonly allowedPayloadClasses: readonly SynchronizationPayloadClassV1[];
  readonly allowedPlacementKinds: readonly string[];
  readonly allowedExecutorClasses: readonly string[];
}

export interface ExecutionRouteSubjectV1 {
  readonly tenantScope: TenantScopeV1;
  readonly input: ExecutionRouteInputMetadataV1;
  readonly action: ExecutionRouteActionV1;
  readonly target: ExecutionRouteTargetV1;
  readonly narrowingConstraints: readonly ExecutionRouteNarrowingConstraintV1[];
  readonly authorizationEpoch: number;
}

export interface ExecutionRouteSubjectInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly input: {
    readonly artifactVersionId: string;
    readonly artifactVersionHash: string;
    readonly placementId: string;
    readonly placementHash: string;
    readonly dataMode: ExecutionRouteArtifactDataModeV1;
    readonly classification: DataClassificationV1;
    readonly payloadClass: SynchronizationPayloadClassV1;
    readonly placementKind: string;
    readonly placementAvailable: boolean;
  };
  readonly action: {
    readonly type: string;
    readonly version: number;
    readonly requiredCapabilities: readonly string[];
  };
  readonly target:
    | {
        readonly target: 'CLOUD';
        readonly targetDeviceId?: never;
        readonly executorClass: string;
        readonly grantedCapabilities: readonly string[];
      }
    | {
        readonly target: 'DEVICE';
        readonly targetDeviceId: string;
        readonly executorClass: string;
        readonly grantedCapabilities: readonly string[];
      };
  readonly narrowingConstraints: readonly {
    readonly constraintId: string;
    readonly constraintHash: string;
    readonly allowedClassifications: readonly DataClassificationV1[];
    readonly allowedPayloadClasses: readonly SynchronizationPayloadClassV1[];
    readonly allowedPlacementKinds: readonly string[];
    readonly allowedExecutorClasses: readonly string[];
  }[];
  readonly authorizationEpoch: number;
}

export interface ExecutionRouteDecisionV1 extends ExecutionRouteSubjectV1 {
  readonly schemaVersion: 1;
  readonly routeId: StableIdentifierV1;
  readonly decisionId: StableIdentifierV1;
  readonly revision: number;
  readonly dataModePolicyId: StableIdentifierV1;
  readonly dataModePolicyVersionId: StableIdentifierV1;
  readonly dataModePolicyRevision: number;
  readonly dataModePolicyHash: string;
  readonly decisionSubjectHash: string;
  readonly createdAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
}

export type ExecutionRouteDecisionParseResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: 'INVALID_ROUTE_DECISION' };

function rejected<TValue>(): ExecutionRouteDecisionParseResultV1<TValue> {
  return Object.freeze({ accepted: false, code: 'INVALID_ROUTE_DECISION' });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const result = parseStableIdentifierV1(input);
  return result.accepted ? result.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const result = parseStrictUtcTimestampV1(input);
  return result.accepted ? result.value : undefined;
}

function unknownArray(input: unknown): readonly unknown[] | undefined {
  return Array.isArray(input) ? (input as readonly unknown[]) : undefined;
}

function safeList(input: unknown, maximum = 64): readonly string[] | undefined {
  const values = unknownArray(input);
  if (!values || values.length > maximum || values.some((value) => typeof value !== 'string'))
    return undefined;
  const normalized = values.map((value) => (value as string).normalize('NFC').trim());
  if (normalized.some((value) => !SAFE_LABEL.test(value))) return undefined;
  return Object.freeze([...new Set(normalized)].sort());
}

function classifications(input: unknown): readonly DataClassificationV1[] | undefined {
  const values = unknownArray(input);
  if (
    !values ||
    values.some(
      (value) =>
        typeof value !== 'string' || !CLASSIFICATIONS.includes(value as DataClassificationV1),
    )
  )
    return undefined;
  return Object.freeze([...new Set(values as readonly DataClassificationV1[])].sort());
}

function payloadClasses(input: unknown): readonly SynchronizationPayloadClassV1[] | undefined {
  const values = unknownArray(input);
  if (
    !values ||
    values.some(
      (value) =>
        typeof value !== 'string' ||
        !PAYLOAD_CLASSES.includes(value as SynchronizationPayloadClassV1),
    )
  )
    return undefined;
  return Object.freeze([...new Set(values as readonly SynchronizationPayloadClassV1[])].sort());
}

function validEpoch(input: unknown): input is number {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 0;
}

function constraints(input: unknown): readonly ExecutionRouteNarrowingConstraintV1[] | undefined {
  const values = unknownArray(input);
  if (!values || values.length > 32) return undefined;
  const result: ExecutionRouteNarrowingConstraintV1[] = [];
  const constraintIds = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const candidate = value as Record<string, unknown>;
    const constraintId = stable(candidate['constraintId']);
    const constraintHash = candidate['constraintHash'];
    const allowedClassifications = classifications(candidate['allowedClassifications']);
    const allowedPayloadClasses = payloadClasses(candidate['allowedPayloadClasses']);
    const allowedPlacementKinds = safeList(candidate['allowedPlacementKinds']);
    const allowedExecutorClasses = safeList(candidate['allowedExecutorClasses']);
    if (
      !constraintId ||
      constraintIds.has(constraintId) ||
      typeof constraintHash !== 'string' ||
      !SHA256.test(constraintHash) ||
      !allowedClassifications ||
      !allowedPayloadClasses ||
      !allowedPlacementKinds ||
      !allowedExecutorClasses
    )
      return undefined;
    constraintIds.add(constraintId);
    result.push(
      Object.freeze({
        constraintId,
        constraintHash,
        allowedClassifications,
        allowedPayloadClasses,
        allowedPlacementKinds,
        allowedExecutorClasses,
      }),
    );
  }
  result.sort((left, right) => left.constraintId.localeCompare(right.constraintId));
  return Object.freeze(result);
}

export function createExecutionRouteSubjectV1(
  input: ExecutionRouteSubjectInputV1,
): ExecutionRouteDecisionParseResultV1<ExecutionRouteSubjectV1> {
  const tenant = parseTenantScopeV1(input.tenantScope);
  const artifactVersionId = stable(input.input.artifactVersionId);
  const placementId = stable(input.input.placementId);
  const requiredCapabilities = safeList(input.action.requiredCapabilities);
  const executorClass = safeList([input.target.executorClass], 1)?.[0];
  const grantedCapabilities = safeList(input.target.grantedCapabilities);
  const narrowingConstraints = constraints(input.narrowingConstraints);
  if (
    !tenant.accepted ||
    tenant.value.scopeType === 'organization' ||
    !artifactVersionId ||
    !placementId ||
    !SHA256.test(input.input.artifactVersionHash) ||
    !SHA256.test(input.input.placementHash) ||
    !['Local', 'Hybrid', 'Cloud'].includes(input.input.dataMode) ||
    !CLASSIFICATIONS.includes(input.input.classification) ||
    !PAYLOAD_CLASSES.includes(input.input.payloadClass) ||
    !SAFE_LABEL.test(input.input.placementKind) ||
    typeof input.input.placementAvailable !== 'boolean' ||
    !ACTION_TYPE.test(input.action.type) ||
    !Number.isSafeInteger(input.action.version) ||
    input.action.version < 1 ||
    !requiredCapabilities ||
    !executorClass ||
    !grantedCapabilities ||
    !narrowingConstraints ||
    !validEpoch(input.authorizationEpoch) ||
    input.authorizationEpoch < 0
  )
    return rejected();

  let target: ExecutionRouteTargetV1;
  if (input.target.target === 'CLOUD') {
    if ('targetDeviceId' in input.target && input.target.targetDeviceId !== undefined)
      return rejected();
    target = Object.freeze({
      target: 'CLOUD',
      executorClass,
      grantedCapabilities,
    });
  } else if (input.target.target === 'DEVICE') {
    const targetDeviceId = stable(input.target.targetDeviceId);
    if (!targetDeviceId) return rejected();
    target = Object.freeze({
      target: 'DEVICE',
      targetDeviceId,
      executorClass,
      grantedCapabilities,
    });
  } else return rejected();

  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      tenantScope: tenant.value,
      input: Object.freeze({
        artifactVersionId,
        artifactVersionHash: input.input.artifactVersionHash,
        placementId,
        placementHash: input.input.placementHash,
        dataMode: input.input.dataMode,
        classification: input.input.classification,
        payloadClass: input.input.payloadClass,
        placementKind: input.input.placementKind,
        placementAvailable: input.input.placementAvailable,
      }),
      action: Object.freeze({
        type: input.action.type,
        version: input.action.version,
        requiredCapabilities,
      }),
      target,
      narrowingConstraints,
      authorizationEpoch: input.authorizationEpoch,
    }),
  });
}

function canonicalSubject(subject: ExecutionRouteSubjectV1): unknown {
  return {
    tenantScope: subject.tenantScope,
    input: subject.input,
    action: subject.action,
    target: subject.target,
    narrowingConstraints: subject.narrowingConstraints,
    authorizationEpoch: subject.authorizationEpoch,
  };
}

/** DSO-024: the canonical subject binds every policy-relevant routing input. */
export function executionRouteDecisionSubjectHashV1(subject: ExecutionRouteSubjectV1): string {
  return createHash('sha256')
    .update(JSON.stringify({ schemaVersion: 1, subject: canonicalSubject(subject) }), 'utf8')
    .digest('hex');
}

export function createExecutionRouteDecisionV1(input: {
  readonly routeId: unknown;
  readonly decisionId: unknown;
  readonly revision: unknown;
  readonly subject: ExecutionRouteSubjectInputV1 | ExecutionRouteSubjectV1;
  readonly policy: {
    readonly policyId: unknown;
    readonly policyVersionId: unknown;
    readonly organizationId: unknown;
    readonly workspaceId: unknown;
    readonly revision: unknown;
    readonly canonicalHash: unknown;
  };
  readonly createdAt: unknown;
  readonly expiresAt: unknown;
}): ExecutionRouteDecisionParseResultV1<ExecutionRouteDecisionV1> {
  const routeId = stable(input.routeId);
  const decisionId = stable(input.decisionId);
  const policyId = stable(input.policy.policyId);
  const policyVersionId = stable(input.policy.policyVersionId);
  const policyOrganizationId = stable(input.policy.organizationId);
  const policyWorkspaceId = stable(input.policy.workspaceId);
  const subject = createExecutionRouteSubjectV1(input.subject as ExecutionRouteSubjectInputV1);
  const createdAt = timestamp(input.createdAt);
  const expiresAt = timestamp(input.expiresAt);
  if (
    !routeId ||
    !decisionId ||
    !policyId ||
    !policyVersionId ||
    !policyOrganizationId ||
    !policyWorkspaceId ||
    typeof input.revision !== 'number' ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 1 ||
    !subject.accepted ||
    subject.value.tenantScope.scopeType === 'organization' ||
    !createdAt ||
    !expiresAt ||
    typeof input.policy.revision !== 'number' ||
    !Number.isSafeInteger(input.policy.revision) ||
    input.policy.revision < 1 ||
    typeof input.policy.canonicalHash !== 'string' ||
    !SHA256.test(input.policy.canonicalHash)
  )
    return rejected();
  const createdTime = Date.parse(createdAt);
  const expiresTime = Date.parse(expiresAt);
  if (
    expiresTime <= createdTime ||
    expiresTime - createdTime > MAX_ROUTE_LIFETIME_MS ||
    policyOrganizationId !== subject.value.tenantScope.organizationId ||
    policyWorkspaceId !== subject.value.tenantScope.workspaceId
  )
    return rejected();
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: 1,
      routeId,
      decisionId,
      revision: input.revision,
      ...subject.value,
      dataModePolicyId: policyId,
      dataModePolicyVersionId: policyVersionId,
      dataModePolicyRevision: input.policy.revision,
      dataModePolicyHash: input.policy.canonicalHash,
      decisionSubjectHash: executionRouteDecisionSubjectHashV1(subject.value),
      createdAt,
      expiresAt,
    }),
  });
}
