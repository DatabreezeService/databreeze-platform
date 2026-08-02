import type { AuditEventV1, AuditSealV1, AuditSummaryV1 } from '@databreeze/domain/audit/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

function sameScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  return (
    left.scopeType === right.scopeType &&
    left.organizationId === right.organizationId &&
    ('workspaceId' in left ? left.workspaceId : undefined) ===
      ('workspaceId' in right ? right.workspaceId : undefined) &&
    ('projectId' in left ? left.projectId : undefined) ===
      ('projectId' in right ? right.projectId : undefined)
  );
}

function sameSummary(left: AuditSummaryV1, right: AuditSummaryV1): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => {
    const rightKey = rightKeys[index];
    return rightKey === key && left[key] === right[key];
  });
}

export function sameAuditEventV1(left: AuditEventV1, right: AuditEventV1): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.eventId === right.eventId &&
    left.action === right.action &&
    sameScope(left.tenantScope, right.tenantScope) &&
    left.actor.actorType === right.actor.actorType &&
    left.actor.actorId === right.actor.actorId &&
    left.entityType === right.entityType &&
    left.entityId === right.entityId &&
    left.entityRevision === right.entityRevision &&
    left.sequence === right.sequence &&
    left.occurredAt === right.occurredAt &&
    left.correlationId === right.correlationId &&
    left.idempotencyKey === right.idempotencyKey &&
    sameSummary(left.summary, right.summary) &&
    left.previousDigest === right.previousDigest &&
    left.digest === right.digest
  );
}

export function sameAuditSealV1(left: AuditSealV1, right: AuditSealV1): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    sameScope(left.tenantScope, right.tenantScope) &&
    left.firstSequence === right.firstSequence &&
    left.lastSequence === right.lastSequence &&
    left.eventCount === right.eventCount &&
    left.rootDigest === right.rootDigest &&
    left.sealedAt === right.sealedAt
  );
}
