import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  parseStableIdentifierV1,
  tenantScopeKeyV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type {
  IaeWorkerCapabilityReferenceResolverPortV1,
  IaeWorkerCapabilitySigningPayloadV1,
  IaeWorkerCapabilitySignerPortV1,
  IaeWorkerCapabilityVerifierPortV1,
} from '../application/worker-object-capability.port.js';

function base64Url(value: Buffer): string {
  return value.toString('base64url');
}

function canonicalScope(scope: TenantScopeV1): string {
  return tenantScopeKeyV1(scope);
}

function canonicalPayload(payload: IaeWorkerCapabilitySigningPayloadV1): string {
  return JSON.stringify({
    schemaVersion: 1,
    capabilityId: payload.capabilityId,
    grantType: payload.grantType,
    tenantScope: canonicalScope(payload.tenantScope),
    jobId: payload.jobId,
    attemptId: payload.attemptId,
    workerId: payload.workerId,
    securityEpoch: payload.securityEpoch,
    objectIds: payload.objectIds,
    objectBindings: payload.objectBindings,
    action: payload.action,
    maxBytes: payload.maxBytes,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    ...(payload.resultFinalizationBinding === undefined
      ? {}
      : { resultFinalizationBinding: payload.resultFinalizationBinding }),
  });
}

/**
 * Opaque capability signer for deployments that provision a dedicated secret through their
 * secret manager. The token contains only a capability ID, expiry, and MAC; object references
 * and content never appear in the worker-facing token.
 */
export class HmacWorkerCapabilitySignerAdapter
  implements
    IaeWorkerCapabilitySignerPortV1,
    IaeWorkerCapabilityVerifierPortV1,
    IaeWorkerCapabilityReferenceResolverPortV1
{
  private readonly key: Buffer;

  public constructor(secret: string | Uint8Array) {
    this.key = Buffer.from(secret);
    if (this.key.length < 32) throw new Error('IAE_WORKER_CAPABILITY_SECRET_TOO_SHORT');
  }

  public sign(payload: IaeWorkerCapabilitySigningPayloadV1): Promise<string> {
    const body = `${payload.capabilityId}.${Date.parse(payload.expiresAt)}.${base64Url(
      createHmac('sha256', this.key).update(canonicalPayload(payload), 'utf8').digest(),
    )}`;
    const mac = createHmac('sha256', this.key).update(body, 'utf8').digest();
    return Promise.resolve(`iae-cap-v1.${base64Url(Buffer.from(body, 'utf8'))}.${base64Url(mac)}`);
  }

  public async verify(
    payload: IaeWorkerCapabilitySigningPayloadV1,
    signedCapability: string,
  ): Promise<boolean> {
    if (
      typeof signedCapability !== 'string' ||
      signedCapability.length === 0 ||
      signedCapability.length > 4096
    )
      return false;
    const expected = Buffer.from(await this.sign(payload), 'utf8');
    const candidate = Buffer.from(signedCapability, 'utf8');
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  }

  public resolveCapabilityId(
    signedCapability: string,
  ): Promise<StableIdentifierV1 | undefined> {
    if (typeof signedCapability !== 'string' || signedCapability.length > 4096)
      return Promise.resolve(undefined);
    const parts = signedCapability.split('.');
    if (parts.length !== 3 || parts[0] !== 'iae-cap-v1') return Promise.resolve(undefined);
    try {
      const body = Buffer.from(parts[1]!, 'base64url');
      const claimed = Buffer.from(parts[2]!, 'base64url');
      const expected = createHmac('sha256', this.key).update(body).digest();
      if (claimed.length !== expected.length || !timingSafeEqual(claimed, expected))
        return Promise.resolve(undefined);
      const bodyParts = body.toString('utf8').split('.');
      if (bodyParts.length !== 3) return Promise.resolve(undefined);
      const parsed = parseStableIdentifierV1(bodyParts[0]);
      return Promise.resolve(parsed.accepted ? parsed.value : undefined);
    } catch {
      return Promise.resolve(undefined);
    }
  }
}
