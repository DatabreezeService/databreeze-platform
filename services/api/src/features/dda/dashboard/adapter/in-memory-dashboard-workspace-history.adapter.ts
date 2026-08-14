/* eslint-disable @typescript-eslint/require-await -- in-memory adapter mirrors the durable async history port. */

import { tenantScopesEqualV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  DashboardWorkspaceHistoryCursorProblemV1,
  decodeDashboardWorkspaceHistoryCursorV1,
  encodeDashboardWorkspaceHistoryCursorV1,
  type DashboardWorkspaceHistoryCandidateV1,
  type DashboardWorkspaceHistoryPortV1,
} from '../application/dashboard-workspace-history.port.js';

export interface InMemoryDashboardWorkspaceHistoryEntryV1 {
  readonly tenantScope: TenantScopeV1;
  readonly candidate: DashboardWorkspaceHistoryCandidateV1;
  readonly deniedActorIds?: readonly string[];
}

function compareCandidates(
  left: DashboardWorkspaceHistoryCandidateV1,
  right: DashboardWorkspaceHistoryCandidateV1,
): number {
  return (
    right.updatedAt.localeCompare(left.updatedAt) || left.subjectId.localeCompare(right.subjectId)
  );
}

function afterCursor(
  candidate: DashboardWorkspaceHistoryCandidateV1,
  cursor: { readonly updatedAt: string; readonly subjectId: string },
): boolean {
  return (
    candidate.updatedAt < cursor.updatedAt ||
    (candidate.updatedAt === cursor.updatedAt && candidate.subjectId > cursor.subjectId)
  );
}

/** Test/local-only metadata adapter; no source, plan, layout, or result content is stored. */
export class InMemoryDashboardWorkspaceHistoryAdapter implements DashboardWorkspaceHistoryPortV1 {
  readonly #entries: InMemoryDashboardWorkspaceHistoryEntryV1[] = [];

  public seed(entries: readonly InMemoryDashboardWorkspaceHistoryEntryV1[]): void {
    this.#entries.push(
      ...entries.map((entry) =>
        Object.freeze({
          tenantScope: entry.tenantScope,
          candidate: Object.freeze({
            ...entry.candidate,
            title: Object.freeze({ ...entry.candidate.title }),
          }),
          ...(entry.deniedActorIds === undefined
            ? {}
            : { deniedActorIds: Object.freeze([...entry.deniedActorIds]) }),
        }),
      ),
    );
  }

  public async list(input: {
    readonly tenantScope: TenantScopeV1;
    readonly cursor?: string;
    readonly limit: number;
  }) {
    const cursor = input.cursor
      ? decodeDashboardWorkspaceHistoryCursorV1(input.tenantScope, input.cursor)
      : undefined;
    if (input.cursor !== undefined && cursor === undefined) {
      throw new DashboardWorkspaceHistoryCursorProblemV1();
    }
    const ordered = this.#entries
      .filter((entry) => tenantScopesEqualV1(entry.tenantScope, input.tenantScope))
      .map((entry) => entry.candidate)
      .sort(compareCandidates);
    const start = cursor ? ordered.findIndex((candidate) => afterCursor(candidate, cursor)) : 0;
    const offset = start < 0 ? ordered.length : start;
    const items = ordered.slice(offset, offset + Math.min(input.limit, 50));
    const last = items[items.length - 1];
    return Object.freeze({
      items: Object.freeze(items),
      ...(last !== undefined && offset + items.length < ordered.length
        ? {
            nextCursor: encodeDashboardWorkspaceHistoryCursorV1(input.tenantScope, {
              updatedAt: last.updatedAt,
              subjectId: last.subjectId,
            }),
          }
        : {}),
    });
  }

  public async reauthorize(input: {
    readonly tenantScope: TenantScopeV1;
    readonly actorId: string;
    readonly kind: DashboardWorkspaceHistoryCandidateV1['kind'];
    readonly subjectId: string;
  }) {
    const entry = this.#entries.find(
      (candidate) =>
        tenantScopesEqualV1(candidate.tenantScope, input.tenantScope) &&
        candidate.candidate.kind === input.kind &&
        candidate.candidate.subjectId === input.subjectId,
    );
    if (entry === undefined || entry.deniedActorIds?.includes(input.actorId))
      return 'DENIED' as const;
    return 'ALLOWED' as const;
  }
}
