export type LocalGrantStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'SUSPENDED';
export type LocalRequestedEffect = 'READ' | 'WRITE';
export type LocalApprovalState = 'APPROVED' | 'NOT_REQUIRED' | 'PENDING';
export type LocalSafetyReasonCode =
  | 'APPROVAL_REQUIRED'
  | 'AUTHORIZED'
  | 'CAPABILITY_DIGEST_MISMATCH'
  | 'DEVICE_GRANT_EXPIRED'
  | 'DEVICE_GRANT_REVOKED'
  | 'DEVICE_GRANT_SUSPENDED';

export interface LocalExecutionAuthorization {
  readonly deviceGrantId: string;
  readonly grantStatus: LocalGrantStatus;
  readonly expectedCapabilityDigest: string;
  readonly actualCapabilityDigest: string;
  readonly effectiveDataModePolicyRef: string;
  readonly planHash: string;
  readonly sourceFingerprint: string;
  readonly requestedEffect: LocalRequestedEffect;
  readonly requiresApproval: boolean;
  readonly approvalState: LocalApprovalState;
}

export interface LocalExecutionDecision {
  readonly accepted: boolean;
  readonly reasonCode: LocalSafetyReasonCode;
}

export interface ContentFreeExecutionPayload {
  readonly deviceGrantId: string;
  readonly effectiveDataModePolicyRef: string;
  readonly planHash: string;
  readonly requestedEffect: LocalRequestedEffect;
  readonly sourceFingerprint: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const AUTHORIZATION_KEYS = [
  'actualCapabilityDigest',
  'approvalState',
  'deviceGrantId',
  'effectiveDataModePolicyRef',
  'expectedCapabilityDigest',
  'grantStatus',
  'planHash',
  'requestedEffect',
  'requiresApproval',
  'sourceFingerprint',
] as const;

function reject(): never {
  throw new Error('INVALID_EXECUTION_AUTHORIZATION');
}

function validateAuthorization(value: unknown): LocalExecutionAuthorization {
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) {
    return reject();
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== AUTHORIZATION_KEYS.length ||
    keys.some((key) => typeof key !== 'string' || !AUTHORIZATION_KEYS.includes(key as (typeof AUTHORIZATION_KEYS)[number]))
  ) {
    return reject();
  }
  const input = value as Record<(typeof AUTHORIZATION_KEYS)[number], unknown>;
  if (
    typeof input.deviceGrantId !== 'string' ||
    !SAFE_ID.test(input.deviceGrantId) ||
    typeof input.effectiveDataModePolicyRef !== 'string' ||
    !SAFE_ID.test(input.effectiveDataModePolicyRef) ||
    typeof input.expectedCapabilityDigest !== 'string' ||
    !SHA256.test(input.expectedCapabilityDigest) ||
    typeof input.actualCapabilityDigest !== 'string' ||
    !SHA256.test(input.actualCapabilityDigest) ||
    typeof input.planHash !== 'string' ||
    !SHA256.test(input.planHash) ||
    typeof input.sourceFingerprint !== 'string' ||
    !SHA256.test(input.sourceFingerprint) ||
    !['ACTIVE', 'EXPIRED', 'REVOKED', 'SUSPENDED'].includes(input.grantStatus as string) ||
    !['READ', 'WRITE'].includes(input.requestedEffect as string) ||
    !['APPROVED', 'NOT_REQUIRED', 'PENDING'].includes(input.approvalState as string) ||
    typeof input.requiresApproval !== 'boolean'
  ) {
    return reject();
  }
  return input as LocalExecutionAuthorization;
}

export function authorizeLocalExecution(value: LocalExecutionAuthorization): LocalExecutionDecision {
  const authorization = validateAuthorization(value);
  return evaluateAuthorization(authorization);
}

function evaluateAuthorization(
  authorization: LocalExecutionAuthorization,
): LocalExecutionDecision {
  if (authorization.grantStatus === 'REVOKED') {
    return { accepted: false, reasonCode: 'DEVICE_GRANT_REVOKED' };
  }
  if (authorization.grantStatus === 'EXPIRED') {
    return { accepted: false, reasonCode: 'DEVICE_GRANT_EXPIRED' };
  }
  if (authorization.grantStatus === 'SUSPENDED') {
    return { accepted: false, reasonCode: 'DEVICE_GRANT_SUSPENDED' };
  }
  if (authorization.expectedCapabilityDigest !== authorization.actualCapabilityDigest) {
    return { accepted: false, reasonCode: 'CAPABILITY_DIGEST_MISMATCH' };
  }
  if (authorization.requiresApproval && authorization.approvalState !== 'APPROVED') {
    return { accepted: false, reasonCode: 'APPROVAL_REQUIRED' };
  }
  return { accepted: true, reasonCode: 'AUTHORIZED' };
}

export function buildContentFreeExecutionPayload(
  value: LocalExecutionAuthorization,
): ContentFreeExecutionPayload {
  const authorization = validateAuthorization(value);
  const decision = evaluateAuthorization(authorization);
  if (!decision.accepted) {
    throw new Error(`LOCAL_EXECUTION_NOT_AUTHORIZED:${decision.reasonCode}`);
  }
  return Object.freeze({
    deviceGrantId: authorization.deviceGrantId,
    effectiveDataModePolicyRef: authorization.effectiveDataModePolicyRef,
    planHash: authorization.planHash,
    requestedEffect: authorization.requestedEffect,
    sourceFingerprint: authorization.sourceFingerprint,
  });
}
