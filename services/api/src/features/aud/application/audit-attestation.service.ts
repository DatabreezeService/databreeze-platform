import { randomUUID } from 'node:crypto';

import {
  createAuditSealAttestationV1,
  verifyAuditSealAttestationV1,
  type AuditErrorCodeV1,
  type AuditSealAttestationSignerV1,
  type AuditSealAttestationV1,
  type AuditResultV1,
} from '@databreeze/domain/audit/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { AuditAttestationRepositoryPortV1 } from './audit-attestation-repository.port.js';
import type { AuditRepositoryPortV1 } from './audit-repository.port.js';

export const AUDIT_ATTESTATION_SERVICE = Symbol('AUDIT_ATTESTATION_SERVICE');

export type AuditAttestationClockV1 = () => Date;
export type AuditAttestationIdGeneratorV1 = () => string;

export type AuditAttestationApplicationCodeV1 = AuditErrorCodeV1 | 'NOT_FOUND' | 'UNAVAILABLE';

export type AuditAttestationApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: AuditAttestationApplicationCodeV1 };

export interface CreateAuditAttestationInputV1 {
  readonly attestationId?: unknown;
  readonly signerKeyId: unknown;
  readonly firstSequence: unknown;
  readonly lastSequence: unknown;
  readonly rootDigest: unknown;
}

export interface VerifyAuditAttestationInputV1 {
  readonly attestationId: unknown;
}

function rejected<TValue>(
  code: AuditAttestationApplicationCodeV1,
): AuditAttestationApplicationResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function stableId(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function positiveInteger(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function applicationResult<TValue>(
  result: AuditResultV1<TValue>,
): AuditAttestationApplicationResultV1<TValue> {
  return result.accepted ? result : rejected(result.code);
}

/** Attests only a persisted exact-scope seal and keeps the signature in a separate store. */
export class AuditAttestationService {
  public constructor(
    private readonly auditRepository: AuditRepositoryPortV1,
    private readonly attestationRepository: AuditAttestationRepositoryPortV1,
    private readonly signer: AuditSealAttestationSignerV1,
    private readonly idGenerator: AuditAttestationIdGeneratorV1 = () => randomUUID(),
  ) {}

  public async create(
    context: IamTenantContextV1,
    input: CreateAuditAttestationInputV1,
  ): Promise<AuditAttestationApplicationResultV1<AuditSealAttestationV1>> {
    const attestationId = stableId(input.attestationId ?? this.idGenerator());
    const firstSequence = positiveInteger(input.firstSequence);
    const lastSequence = positiveInteger(input.lastSequence);
    const rootDigest = text(input.rootDigest, 512);
    if (!attestationId) return rejected('INVALID_IDENTIFIER');
    if (!firstSequence || !lastSequence || lastSequence < firstSequence)
      return rejected('INVALID_SEQUENCE');
    if (!rootDigest) return rejected('INVALID_TEXT');
    const seal = await this.auditRepository.findSeal(context, {
      tenantScope: context.tenantScope,
      firstSequence,
      lastSequence,
      rootDigest,
    });
    if (!seal) return rejected('NOT_FOUND');
    const created = createAuditSealAttestationV1(
      seal,
      { attestationId, signerKeyId: input.signerKeyId },
      this.signer,
    );
    if (!created.accepted) return applicationResult(created);
    await this.attestationRepository.withTransaction(context, async (transaction) => {
      await transaction.saveAttestation(context, created.value);
    });
    return created;
  }

  public async verify(
    context: IamTenantContextV1,
    input: VerifyAuditAttestationInputV1,
  ): Promise<AuditAttestationApplicationResultV1<true>> {
    const attestationId = stableId(input.attestationId);
    if (!attestationId) return rejected('INVALID_IDENTIFIER');
    const attestation = await this.attestationRepository.findAttestation(context, attestationId);
    if (!attestation) return rejected('NOT_FOUND');
    const seal = await this.auditRepository.findSeal(context, {
      tenantScope: attestation.tenantScope,
      firstSequence: attestation.firstSequence,
      lastSequence: attestation.lastSequence,
      rootDigest: attestation.rootDigest,
    });
    if (!seal) return rejected('NOT_FOUND');
    return applicationResult(verifyAuditSealAttestationV1(attestation, seal, this.signer));
  }
}

export class UnavailableAuditAttestationService {
  public create(
    context: IamTenantContextV1,
    input: CreateAuditAttestationInputV1,
  ): Promise<AuditAttestationApplicationResultV1<AuditSealAttestationV1>> {
    void context;
    void input;
    return Promise.resolve(rejected('UNAVAILABLE'));
  }

  public verify(
    context: IamTenantContextV1,
    input: VerifyAuditAttestationInputV1,
  ): Promise<AuditAttestationApplicationResultV1<true>> {
    void context;
    void input;
    return Promise.resolve(rejected('UNAVAILABLE'));
  }
}
