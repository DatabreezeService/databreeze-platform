import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import {
  DashboardWorkspaceHistoryCursorProblemV1,
  decodeDashboardWorkspaceHistoryCursorV1,
  encodeDashboardWorkspaceHistoryCursorV1,
  type DashboardWorkspaceHistoryCandidateV1,
  type DashboardWorkspaceHistoryPortV1,
} from './dashboard-workspace-history.port.js';

export type DashboardWorkspaceHistoryApplicationCodeV1 =
  | 'INVALID_CURSOR'
  | 'INVALID_PAGE'
  | 'INVALID_SCOPE'
  | 'UNAVAILABLE';

export type DashboardWorkspaceHistoryApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DashboardWorkspaceHistoryApplicationCodeV1 };

export interface DashboardWorkspaceHistoryItemV1 {
  readonly kind: DashboardWorkspaceHistoryCandidateV1['kind'];
  readonly subjectId: string;
  readonly title: DashboardWorkspaceHistoryCandidateV1['title'];
  readonly updatedAt: string;
  readonly safeStatus?: DashboardWorkspaceHistoryCandidateV1['safeStatus'];
}

export interface DashboardWorkspaceHistoryPageV1 {
  readonly items: readonly DashboardWorkspaceHistoryItemV1[];
  readonly nextCursor?: string;
}

const MAX_HISTORY_PAGE_SIZE = 50;
const DEFAULT_HISTORY_PAGE_SIZE = 30;
const localPathPattern = /(?:^[a-z]:[\\/]|^\\\\|^file:|^\/(?:users|home|var|tmp|etc)(?:\/|$))/iu;

function accepted<TValue>(value: TValue): DashboardWorkspaceHistoryApplicationResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(
  code: DashboardWorkspaceHistoryApplicationCodeV1,
): DashboardWorkspaceHistoryApplicationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function validPageSize(input: unknown): number | undefined {
  if (input === undefined) return DEFAULT_HISTORY_PAGE_SIZE;
  if (
    typeof input !== 'number' ||
    !Number.isSafeInteger(input) ||
    input < 1 ||
    input > MAX_HISTORY_PAGE_SIZE
  ) {
    return undefined;
  }
  return input;
}

function safeTitle(input: unknown): DashboardWorkspaceHistoryCandidateV1['title'] | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const title = input as Record<string, unknown>;
  if (typeof title['vi'] !== 'string' || typeof title['en'] !== 'string') return undefined;
  if (
    title['vi'].length === 0 ||
    title['en'].length === 0 ||
    title['vi'].length > 200 ||
    title['en'].length > 200 ||
    /\p{Cc}/u.test(title['vi']) ||
    /\p{Cc}/u.test(title['en']) ||
    localPathPattern.test(title['vi']) ||
    localPathPattern.test(title['en'])
  ) {
    return undefined;
  }
  return Object.freeze({ vi: title['vi'], en: title['en'] });
}

function safeCandidate(
  input: DashboardWorkspaceHistoryCandidateV1,
): DashboardWorkspaceHistoryItemV1 | undefined {
  if (input.kind !== 'ANALYSIS' && input.kind !== 'DASHBOARD') return undefined;
  const subjectId = parseStableIdentifierV1(input.subjectId);
  const updatedAt = parseStrictUtcTimestampV1(input.updatedAt);
  const title = safeTitle(input.title);
  if (!subjectId.accepted || !updatedAt.accepted || title === undefined) return undefined;
  if (
    input.safeStatus !== undefined &&
    input.safeStatus !== 'CURRENT' &&
    input.safeStatus !== 'STALE' &&
    input.safeStatus !== 'BLOCKED'
  ) {
    return undefined;
  }
  return Object.freeze({
    kind: input.kind,
    subjectId: subjectId.value,
    title,
    updatedAt: updatedAt.value,
    ...(input.safeStatus === undefined ? {} : { safeStatus: input.safeStatus }),
  });
}

function compareHistoryItems(
  left: Pick<DashboardWorkspaceHistoryItemV1, 'updatedAt' | 'subjectId'>,
  right: Pick<DashboardWorkspaceHistoryItemV1, 'updatedAt' | 'subjectId'>,
): number {
  return (
    right.updatedAt.localeCompare(left.updatedAt) || left.subjectId.localeCompare(right.subjectId)
  );
}

/**
 * DDA-026/DDA-031/DDA-033/DDA-036: current-scope, metadata-only dashboard and analysis history.
 * Authorization is refreshed per subject; a denial is indistinguishable from an absent entry.
 */
export class DashboardWorkspaceHistoryServiceV1 {
  public constructor(private readonly history: DashboardWorkspaceHistoryPortV1) {}

  public async list(
    context: IamTenantContextV1,
    input: { readonly cursor?: string; readonly limit?: number },
  ): Promise<DashboardWorkspaceHistoryApplicationResultV1<DashboardWorkspaceHistoryPageV1>> {
    if (context.tenantScope.scopeType !== 'project') return rejected('INVALID_SCOPE');
    const limit = validPageSize(input.limit);
    if (limit === undefined) return rejected('INVALID_PAGE');
    if (
      input.cursor !== undefined &&
      decodeDashboardWorkspaceHistoryCursorV1(context.tenantScope, input.cursor) === undefined
    ) {
      return rejected('INVALID_CURSOR');
    }

    let candidates;
    try {
      candidates = await this.history.list({
        tenantScope: context.tenantScope,
        limit,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      });
    } catch (error) {
      if (error instanceof DashboardWorkspaceHistoryCursorProblemV1) {
        return rejected('INVALID_CURSOR');
      }
      return rejected('UNAVAILABLE');
    }

    const authorized: DashboardWorkspaceHistoryItemV1[] = [];
    const emitted = new Set<string>();
    try {
      for (const candidate of candidates.items) {
        const decision = await this.history.reauthorize({
          context,
          tenantScope: context.tenantScope,
          actorId: context.actorId,
          kind: candidate.kind,
          subjectId: candidate.subjectId,
        });
        if (decision === 'UNAVAILABLE') return rejected('UNAVAILABLE');
        if (decision !== 'ALLOWED') continue;
        const item = safeCandidate(candidate);
        if (item === undefined) continue;
        const key = `${item.kind}:${item.subjectId}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        authorized.push(item);
      }
    } catch {
      return rejected('UNAVAILABLE');
    }

    const items = authorized.sort(compareHistoryItems).slice(0, limit);
    const last = items[items.length - 1];
    return accepted(
      Object.freeze({
        items: Object.freeze(items),
        ...(candidates.nextCursor === undefined || last === undefined
          ? {}
          : {
              nextCursor: encodeDashboardWorkspaceHistoryCursorV1(context.tenantScope, {
                updatedAt: last.updatedAt,
                subjectId: last.subjectId,
              }),
            }),
      }),
    );
  }
}
