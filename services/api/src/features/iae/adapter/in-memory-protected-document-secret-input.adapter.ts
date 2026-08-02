import { randomUUID } from 'node:crypto';

import { tenantScopeContainsV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { ProtectedDocumentUnlockRequestV1 } from '@databreeze/domain/protected-document/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ProtectedDocumentSecretInputPortV1,
  ProtectedDocumentSecretInputResultV1,
  ProtectedDocumentUnlockHandleV1,
} from '../application/protected-document-secret-input.port.js';

function accepted<TValue>(value: TValue): ProtectedDocumentSecretInputResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected<TValue>(
  code: Exclude<ProtectedDocumentSecretInputResultV1<TValue>, { readonly accepted: true }>['code'],
): ProtectedDocumentSecretInputResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate);
}

/** Test/local adapter that models a one-shot OS-secret prompt without storing its value. */
export class InMemoryProtectedDocumentSecretInputAdapter
  implements ProtectedDocumentSecretInputPortV1
{
  private handles = new Map<string, { readonly requestId: string; readonly expiresAt: string }>();

  public constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  public async issue(
    context: IamTenantContextV1,
    request: ProtectedDocumentUnlockRequestV1,
  ): Promise<ProtectedDocumentSecretInputResultV1<ProtectedDocumentUnlockHandleV1>> {
    await Promise.resolve();
    if (!visible(context.tenantScope, request.tenantScope)) return rejected('UNLOCK_SCOPE_DENIED');
    if (request.state !== 'REQUESTED') return rejected('UNLOCK_HANDLE_INVALID');
    if (Date.parse(request.expiresAt) <= Date.parse(this.now()))
      return rejected('UNLOCK_HANDLE_EXPIRED');
    const handleId = randomUUID();
    this.handles.set(handleId, { requestId: request.requestId, expiresAt: request.expiresAt });
    return accepted({ handleId, requestId: request.requestId, expiresAt: request.expiresAt });
  }

  public async consume(
    context: IamTenantContextV1,
    request: ProtectedDocumentUnlockRequestV1,
    handleId: string,
    outcome: 'UNLOCKED' | 'FAILED',
  ): Promise<ProtectedDocumentSecretInputResultV1<void>> {
    await Promise.resolve();
    if (!visible(context.tenantScope, request.tenantScope)) return rejected('UNLOCK_SCOPE_DENIED');
    const handle = this.handles.get(handleId);
    if (!handle || handle.requestId !== request.requestId) return rejected('UNLOCK_HANDLE_INVALID');
    this.handles.delete(handleId);
    if (Date.parse(handle.expiresAt) <= Date.parse(this.now()))
      return rejected('UNLOCK_HANDLE_EXPIRED');
    void outcome;
    return accepted(undefined);
  }

  public async release(
    context: IamTenantContextV1,
    request: ProtectedDocumentUnlockRequestV1,
  ): Promise<void> {
    await Promise.resolve();
    if (!visible(context.tenantScope, request.tenantScope)) return;
    for (const [handleId, handle] of this.handles)
      if (handle.requestId === request.requestId) this.handles.delete(handleId);
  }
}
