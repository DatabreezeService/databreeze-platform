import { describe, expect, it } from 'vitest';
import {
  authorizeLocalExecution,
  buildContentFreeExecutionPayload,
  type LocalExecutionAuthorization,
} from '../src/features/folder-autopilot/local-safety.ts';

const valid: LocalExecutionAuthorization = {
  deviceGrantId: 'grant-001',
  grantStatus: 'ACTIVE',
  expectedCapabilityDigest: 'a'.repeat(64),
  actualCapabilityDigest: 'a'.repeat(64),
  effectiveDataModePolicyRef: 'policy-001',
  planHash: 'b'.repeat(64),
  sourceFingerprint: 'c'.repeat(64),
  requestedEffect: 'WRITE',
  requiresApproval: true,
  approvalState: 'APPROVED',
};

describe('Folder Autopilot local execution safety boundary', () => {
  it('accepts an active matching grant and emits only content-free metadata', () => {
    const decision = authorizeLocalExecution(valid);
    expect(decision).toEqual({ accepted: true, reasonCode: 'AUTHORIZED' });

    const payload = buildContentFreeExecutionPayload(valid);
    expect(payload).toEqual({
      deviceGrantId: 'grant-001',
      effectiveDataModePolicyRef: 'policy-001',
      planHash: 'b'.repeat(64),
      requestedEffect: 'WRITE',
      sourceFingerprint: 'c'.repeat(64),
    });
    expect(JSON.stringify(payload)).not.toMatch(/path|handle|bytes|content/i);
  });

  it('fails closed for revoked grants, capability drift, and missing approval', () => {
    expect(authorizeLocalExecution({ ...valid, grantStatus: 'REVOKED' })).toEqual({
      accepted: false,
      reasonCode: 'DEVICE_GRANT_REVOKED',
    });
    expect(authorizeLocalExecution({ ...valid, actualCapabilityDigest: 'd'.repeat(64) })).toEqual({
      accepted: false,
      reasonCode: 'CAPABILITY_DIGEST_MISMATCH',
    });
    expect(authorizeLocalExecution({ ...valid, approvalState: 'PENDING' })).toEqual({
      accepted: false,
      reasonCode: 'APPROVAL_REQUIRED',
    });
    expect(() =>
      buildContentFreeExecutionPayload({ ...valid, grantStatus: 'REVOKED' }),
    ).toThrow('LOCAL_EXECUTION_NOT_AUTHORIZED:DEVICE_GRANT_REVOKED');
  });

  it('rejects malformed metadata before any local action can run', () => {
    expect(() =>
      authorizeLocalExecution({ ...valid, deviceGrantId: 'C:\\secret' }),
    ).toThrow('INVALID_EXECUTION_AUTHORIZATION');
    expect(() =>
      buildContentFreeExecutionPayload({ ...valid, sourceFingerprint: 'not-a-digest' }),
    ).toThrow('INVALID_EXECUTION_AUTHORIZATION');
  });
});
