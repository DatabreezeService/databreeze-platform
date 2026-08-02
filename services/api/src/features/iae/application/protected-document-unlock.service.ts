import {
  createProtectedDocumentUnlockRequestV1,
  expireProtectedDocumentUnlockRequestV1,
  recordProtectedDocumentUnlockResultV1,
  type ProtectedDocumentUnlockRequestV1,
  type ProtectedDocumentUnlockResultV1,
} from '@databreeze/domain/protected-document/v1';
import { parseStableIdentifierV1, tenantScopeContainsV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ProtectedDocumentSecretInputPortV1,
  ProtectedDocumentSecretInputResultV1,
  ProtectedDocumentUnlockHandleV1,
} from './protected-document-secret-input.port.js';
import type { ProtectedDocumentUnlockRepositoryPortV1 } from './protected-document-unlock-repository.port.js';

export type ProtectedDocumentUnlockServiceErrorV1 =
  | 'UNLOCK_NOT_FOUND'
  | 'UNLOCK_SCOPE_NARROWING_REQUIRED';
export type ProtectedDocumentUnlockServiceResultV1<TValue> =
  | ProtectedDocumentUnlockResultV1<TValue>
  | ProtectedDocumentSecretInputResultV1<TValue>
  | { readonly accepted: false; readonly code: ProtectedDocumentUnlockServiceErrorV1 };

/** Coordinates unlock state while delegating secret entry to a local/sidecar port. */
export class ProtectedDocumentUnlockService {
  public constructor(
    private readonly requests: ProtectedDocumentUnlockRepositoryPortV1,
    private readonly secretInput: ProtectedDocumentSecretInputPortV1,
  ) {}

  public async create(
    context: IamTenantContextV1,
    input: Omit<Parameters<typeof createProtectedDocumentUnlockRequestV1>[0], 'tenantScope'> & {
      readonly tenantScope?: unknown;
    },
  ): Promise<ProtectedDocumentUnlockServiceResultV1<ProtectedDocumentUnlockRequestV1>> {
    const created = createProtectedDocumentUnlockRequestV1({
      ...input,
      tenantScope: input.tenantScope ?? context.tenantScope,
    });
    if (!created.accepted) return created;
    if (!tenantScopeContainsV1(context.tenantScope, created.value.tenantScope))
      return Object.freeze({ accepted: false, code: 'UNLOCK_SCOPE_NARROWING_REQUIRED' as const });
    return this.requests.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.requestId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value))
          return { accepted: true, value: existing };
        throw new Error('IAE_IMMUTABLE_UNLOCK_REQUEST');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async find(
    context: IamTenantContextV1,
    requestIdInput: unknown,
  ): Promise<ProtectedDocumentUnlockServiceResultV1<ProtectedDocumentUnlockRequestV1>> {
    const requestId = parseStableIdentifierV1(requestIdInput);
    if (!requestId.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
    const request = await this.requests.find(context, requestId.value);
    return request
      ? Object.freeze({ accepted: true, value: request })
      : Object.freeze({ accepted: false, code: 'UNLOCK_NOT_FOUND' as const });
  }

  public async issueHandle(
    context: IamTenantContextV1,
    requestIdInput: unknown,
  ): Promise<ProtectedDocumentUnlockServiceResultV1<ProtectedDocumentUnlockHandleV1>> {
    const request = await this.find(context, requestIdInput);
    if (!request.accepted) return request;
    return this.secretInput.issue(context, request.value);
  }

  public async recordOutcome(
    context: IamTenantContextV1,
    requestIdInput: unknown,
    input: {
      readonly handleId: string;
      readonly expectedRevision: unknown;
      readonly outcome: unknown;
      readonly failureCode?: unknown;
      readonly occurredAt: unknown;
    },
  ): Promise<ProtectedDocumentUnlockServiceResultV1<ProtectedDocumentUnlockRequestV1>> {
    const requestId = parseStableIdentifierV1(requestIdInput);
    if (!requestId.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
    return this.requests.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, requestId.value);
      if (!current) return Object.freeze({ accepted: false, code: 'UNLOCK_NOT_FOUND' as const });
      if (input.outcome !== 'UNLOCKED' && input.outcome !== 'FAILED')
        return Object.freeze({ accepted: false, code: 'INVALID_OUTCOME' as const });
      const verified = await this.secretInput.consume(
        context,
        current,
        input.handleId,
        input.outcome,
      );
      if (!verified.accepted) return verified;
      const next = recordProtectedDocumentUnlockResultV1(current, input);
      if (!next.accepted) return next;
      await transaction.save(context, next.value);
      return next;
    });
  }

  public async expire(
    context: IamTenantContextV1,
    requestIdInput: unknown,
    now: unknown,
  ): Promise<ProtectedDocumentUnlockServiceResultV1<ProtectedDocumentUnlockRequestV1>> {
    const requestId = parseStableIdentifierV1(requestIdInput);
    if (!requestId.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
    return this.requests.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, requestId.value);
      if (!current) return Object.freeze({ accepted: false, code: 'UNLOCK_NOT_FOUND' as const });
      const next = expireProtectedDocumentUnlockRequestV1(current, now);
      if (!next.accepted) return next;
      await this.secretInput.release(context, current);
      await transaction.save(context, next.value);
      return next;
    });
  }
}
