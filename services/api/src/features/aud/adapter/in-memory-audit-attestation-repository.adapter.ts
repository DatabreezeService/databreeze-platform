import type { AuditSealAttestationV1 } from '@databreeze/domain/audit/v1';
import {
  tenantScopeContainsV1,
  tenantScopeKeyV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  AuditAttestationRepositoryPortV1,
  AuditAttestationSaveResultV1,
  AuditAttestationTransactionPortV1,
} from '../application/audit-attestation-repository.port.js';
import { sameAuditSealAttestationV1 } from '../application/audit-equality.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function clone(attestation: AuditSealAttestationV1): AuditSealAttestationV1 {
  return Object.freeze({
    ...attestation,
    tenantScope: Object.freeze({ ...attestation.tenantScope }),
  });
}

/** In-memory independent attestation store with immutable identity and tenant visibility. */
export class InMemoryAuditAttestationRepositoryAdapter implements AuditAttestationRepositoryPortV1 {
  private attestations = new Map<string, AuditSealAttestationV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async saveAttestation(
    context: IamTenantContextV1,
    attestation: AuditSealAttestationV1,
  ): Promise<AuditAttestationSaveResultV1> {
    await Promise.resolve();
    const existing = this.attestations.get(attestation.attestationId);
    if (existing) {
      return sameAuditSealAttestationV1(existing, attestation)
        ? { accepted: true, value: clone(existing), replayed: true }
        : { accepted: false, code: 'CONFLICT' };
    }
    if (!tenantScopeContainsV1(context.tenantScope, attestation.tenantScope))
      throw new Error('AUD_SCOPE_NARROWING_REQUIRED');
    const stored = clone(attestation);
    this.attestations.set(attestation.attestationId, stored);
    return { accepted: true, value: clone(stored), replayed: false };
  }

  public async findAttestation(
    context: IamTenantContextV1,
    attestationId: StableIdentifierV1,
  ): Promise<AuditSealAttestationV1 | undefined> {
    await Promise.resolve();
    const attestation = this.attestations.get(attestationId);
    return attestation && visible(context.tenantScope, attestation.tenantScope)
      ? clone(attestation)
      : undefined;
  }

  public async listAttestations(
    context: IamTenantContextV1,
  ): Promise<readonly AuditSealAttestationV1[]> {
    await Promise.resolve();
    return [...this.attestations.values()]
      .filter((attestation) => visible(context.tenantScope, attestation.tenantScope))
      .sort(
        (left, right) =>
          tenantScopeKeyV1(left.tenantScope).localeCompare(tenantScopeKeyV1(right.tenantScope)) ||
          left.lastSequence - right.lastSequence ||
          left.attestationId.localeCompare(right.attestationId),
      )
      .map(clone);
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: AuditAttestationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.attestations);
    try {
      return await work({
        saveAttestation: this.saveAttestation.bind(this),
        findAttestation: this.findAttestation.bind(this),
      });
    } catch (error) {
      this.attestations = before;
      throw error;
    } finally {
      release();
    }
  }
}
