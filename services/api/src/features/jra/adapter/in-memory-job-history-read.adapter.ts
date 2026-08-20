import type { JobV1 } from '@databreeze/domain/jobs/v1';
import { tenantScopeContainsV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  JobHistoryEntryV1,
  JobHistoryListQueryV1,
  JobHistoryPageV1,
  JobHistoryReadPortV1,
} from '../application/job-history-read.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate);
}

function entry(job: JobV1): JobHistoryEntryV1 {
  const approvalState =
    job.state === 'AWAITING_APPROVAL' || job.state === 'NEEDS_REVIEW'
      ? 'PENDING'
      : 'NOT_APPLICABLE';
  return Object.freeze({
    schemaVersion: 4 as const,
    jobId: job.jobId,
    actionType: job.action.actionType,
    actionVersion: job.action.version,
    state: job.state,
    revision: job.revision,
    createdAt: job.createdAt,
    ...(job.startedAt === undefined ? {} : { startedAt: job.startedAt }),
    ...(job.finishedAt === undefined ? {} : { finishedAt: job.finishedAt }),
    resultAvailable: job.state === 'SUCCEEDED' || job.state === 'PARTIALLY_SUCCEEDED',
    approvalState,
  });
}

export class InMemoryJobHistoryReadAdapter implements JobHistoryReadPortV1 {
  public constructor(private readonly jobs: readonly JobV1[] = []) {}

  public async list(
    context: IamTenantContextV1,
    query: JobHistoryListQueryV1,
  ): Promise<JobHistoryPageV1> {
    await Promise.resolve();
    const filtered = this.jobs
      .filter((job) => visible(context.tenantScope, job.tenantScope))
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.jobId.localeCompare(left.jobId),
      );
    let start = 0;
    if (query.cursor !== undefined) {
      if (!/^[A-Za-z0-9_-]{16,512}$/u.test(query.cursor))
        throw new Error('JRA_HISTORY_CURSOR_INVALID');
      try {
        const decoded = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as {
          readonly offset?: unknown;
        };
        start = decoded.offset as number;
      } catch {
        throw new Error('JRA_HISTORY_CURSOR_INVALID');
      }
    }
    if (!Number.isSafeInteger(start) || start < 0) throw new Error('JRA_HISTORY_CURSOR_INVALID');
    const items = filtered.slice(start, start + query.limit).map(entry);
    return Object.freeze({
      items: Object.freeze(items),
      ...(start + query.limit < filtered.length
        ? {
            nextCursor: Buffer.from(
              JSON.stringify({ offset: start + query.limit }),
              'utf8',
            ).toString('base64url'),
          }
        : {}),
    });
  }

  public async find(
    context: IamTenantContextV1,
    jobId: JobV1['jobId'],
  ): Promise<JobHistoryEntryV1 | undefined> {
    await Promise.resolve();
    const job = this.jobs.find(
      (candidate) =>
        candidate.jobId === jobId && visible(context.tenantScope, candidate.tenantScope),
    );
    return job === undefined ? undefined : entry(job);
  }
}
