import { createHash } from 'node:crypto';

import type { AgentUsageAdmissionInputV1 } from '../application/agent-runtime.port.js';
import type {
  AgentUsageAdmissionResolutionV1,
  AgentUsageAdmissionResolverPortV1,
} from './bua-agent-usage.adapter.js';

const LOCAL_ENTITLEMENT_SNAPSHOT_ID = '00000000-0000-4000-8000-000000000503';

function deterministicIdentifier(seed: string): string {
  const bytes = createHash('sha256').update(seed, 'utf8').digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Local-only server-owned mapping for the seeded development entitlement.
 * The browser supplies no quota, feature, metric, or reservation identity.
 */
export class LocalAgentUsageAdmissionResolverAdapter implements AgentUsageAdmissionResolverPortV1 {
  public resolve(
    input: AgentUsageAdmissionInputV1,
  ): Promise<AgentUsageAdmissionResolutionV1 | undefined> {
    if (input.costClass === 'NONE') return Promise.resolve(undefined);
    const workspaceId =
      input.context.tenantScope.scopeType === 'organization'
        ? ''
        : input.context.tenantScope.workspaceId;
    const seed = `${input.context.tenantScope.scopeType}:${input.context.tenantScope.organizationId}:${workspaceId}:${input.context.actorId}:${input.correlationId}`;
    return Promise.resolve(
      Object.freeze({
        snapshotId: LOCAL_ENTITLEMENT_SNAPSHOT_ID,
        feature: 'AGENT',
        reservationId: deterministicIdentifier(`agent-reservation:${seed}`),
        entryId: deterministicIdentifier(`agent-entry:${seed}`),
        metric: 'job_count',
        requestedUnits: 1,
      }),
    );
  }
}
