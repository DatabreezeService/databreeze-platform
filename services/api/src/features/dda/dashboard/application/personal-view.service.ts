/* eslint-disable @typescript-eslint/require-await -- local store preserves the async service contract. */

import { randomUUID } from 'node:crypto';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export type PersonalViewProblemCodeV1 = 'UNAUTHORIZED' | 'NOT_FOUND' | 'REVISION_CONFLICT';

export type PersonalViewResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: PersonalViewProblemCodeV1 };

export interface PersonalNamedViewV1 {
  readonly viewId: string;
  readonly tenantScope: TenantScopeV1;
  readonly dashboardVersionId: string;
  readonly ownerActorId: string;
  readonly name: string;
  readonly filters: readonly {
    readonly field: string;
    readonly operator: string;
    readonly value: string;
  }[];
  readonly sharedWithWorkspace: boolean;
  readonly revision: number;
}

function rejected(code: PersonalViewProblemCodeV1): PersonalViewResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

/** DDA-033: personal named views stay off shared DashboardVersion mutations. */
export class PersonalViewService {
  readonly #views = new Map<string, PersonalNamedViewV1>();

  public async saveNamedView(
    context: {
      readonly tenantScope: TenantScopeV1;
      readonly actorId: string;
      readonly memberAuthorized: boolean;
    },
    input: {
      readonly dashboardVersionId: string;
      readonly name: string;
      readonly filters: readonly {
        readonly field: string;
        readonly operator: string;
        readonly value: string;
      }[];
      readonly expectedRevision: number;
      readonly viewId?: string;
    },
  ): Promise<PersonalViewResultV1<PersonalNamedViewV1>> {
    if (!context.memberAuthorized) return rejected('UNAUTHORIZED');
    if (input.viewId) {
      const existing = this.#views.get(input.viewId);
      if (!existing) return rejected('NOT_FOUND');
      if (existing.ownerActorId !== context.actorId) return rejected('UNAUTHORIZED');
      if (existing.revision !== input.expectedRevision) return rejected('REVISION_CONFLICT');
      const updated: PersonalNamedViewV1 = Object.freeze({
        ...existing,
        name: input.name.slice(0, 120),
        filters: Object.freeze(input.filters.map((filter) => Object.freeze({ ...filter }))),
        revision: existing.revision + 1,
      });
      this.#views.set(updated.viewId, updated);
      return Object.freeze({ accepted: true, value: updated });
    }

    const created: PersonalNamedViewV1 = Object.freeze({
      viewId: randomUUID(),
      tenantScope: context.tenantScope,
      dashboardVersionId: input.dashboardVersionId,
      ownerActorId: context.actorId,
      name: input.name.slice(0, 120),
      filters: Object.freeze(input.filters.map((filter) => Object.freeze({ ...filter }))),
      sharedWithWorkspace: false,
      revision: 1,
    });
    this.#views.set(created.viewId, created);
    return Object.freeze({ accepted: true, value: created });
  }

  public async shareWithWorkspace(
    context: {
      readonly tenantScope: TenantScopeV1;
      readonly actorId: string;
      readonly memberAuthorized: boolean;
    },
    viewId: string,
    expectedRevision: number,
  ): Promise<PersonalViewResultV1<PersonalNamedViewV1>> {
    if (!context.memberAuthorized) return rejected('UNAUTHORIZED');
    const existing = this.#views.get(viewId);
    if (!existing) return rejected('NOT_FOUND');
    if (existing.ownerActorId !== context.actorId) return rejected('UNAUTHORIZED');
    if (existing.revision !== expectedRevision) return rejected('REVISION_CONFLICT');
    const updated: PersonalNamedViewV1 = Object.freeze({
      ...existing,
      sharedWithWorkspace: true,
      revision: existing.revision + 1,
    });
    this.#views.set(viewId, updated);
    return Object.freeze({ accepted: true, value: updated });
  }

  public async loadView(
    context: {
      readonly tenantScope: TenantScopeV1;
      readonly actorId: string;
      readonly memberAuthorized: boolean;
    },
    viewId: string,
  ): Promise<PersonalViewResultV1<PersonalNamedViewV1>> {
    if (!context.memberAuthorized) return rejected('UNAUTHORIZED');
    const existing = this.#views.get(viewId);
    if (!existing) return rejected('NOT_FOUND');
    if (existing.ownerActorId !== context.actorId && existing.sharedWithWorkspace !== true) {
      return rejected('UNAUTHORIZED');
    }
    void context.tenantScope;
    return Object.freeze({ accepted: true, value: existing });
  }
}
