import type { WorkerObjectGrantAuthorityPortV1 } from './worker-ports.js';

/**
 * Explicit production blocker: IAE currently exposes content readers/evidence grants, but not a
 * signed attempt-bound object capability issuer/consumer. Never fabricate a URL or path here.
 */
export class UnavailableWorkerObjectGrantAuthority implements WorkerObjectGrantAuthorityPortV1 {
  public issueInputGrant(..._argumentsList: readonly unknown[]): Promise<never> {
    void _argumentsList;
    return Promise.reject(new Error('IAE_WORKER_OBJECT_GRANT_CAPABILITY_UNAVAILABLE'));
  }

  public acceptResultReferences(..._argumentsList: readonly unknown[]): Promise<never> {
    void _argumentsList;
    return Promise.reject(new Error('IAE_WORKER_OBJECT_GRANT_CAPABILITY_UNAVAILABLE'));
  }
}
