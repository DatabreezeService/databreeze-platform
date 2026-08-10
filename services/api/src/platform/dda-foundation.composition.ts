import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { AuditLedgerService } from '../features/aud/application/audit-ledger.service.js';
import type { EntitlementAdmissionService } from '../features/bua/application/entitlement-admission.service.js';
import {
  createLookupBackedDdaAudPortV1,
  createLookupBackedDdaBuaPortV1,
  createLookupBackedDdaDsmPortV1,
  createLookupBackedDdaDsoPortV1,
  createLookupBackedDdaIaePortV1,
  createLookupBackedDdaJraPortV1,
} from '../features/dda/adapter/fail-closed-foundation.adapters.js';
import type {
  DdaAudComposePortV1,
  DdaBuaPortV1,
  DdaDsmPortV1,
  DdaDsoPortV1,
  DdaIaePortV1,
  DdaJraPortV1,
} from '../features/dda/application/foundation-ports.js';
import type { DatasetVersionRepositoryPortV1 } from '../features/dsm/application/dataset-version-repository.port.js';
import type { DeviceCapabilityRepositoryPortV1 } from '../features/dso/application/device-capability-repository.port.js';
import { ObjectStorageArtifactProcessingContentAdapter } from '../features/iae/adapter/object-storage-artifact-processing-content.adapter.js';
import type { ArtifactProcessingContentPortV1 } from '../features/iae/application/artifact-processing-content.port.js';
import type { ArtifactRepositoryPortV1 } from '../features/iae/application/artifact-repository.port.js';
import { createIamTenantContextV1 } from '../features/iam/application/tenant-context.js';
import type { JobRepositoryPortV1 } from '../features/jra/application/job-repository.port.js';
import type { ResultManifestRepositoryPortV1 } from '../features/jra/application/result-manifest-repository.port.js';

function contextFor(tenantScope: TenantScopeV1, correlationId: string) {
  const created = createIamTenantContextV1({
    tenantScope,
    actorId: '00000000-0000-4000-8000-0000000000a0',
    correlationId,
    idempotencyKey: `dda-foundation-${correlationId}`,
    authorizationEpoch: 1,
    mfaReenrollmentRequired: false,
  });
  if (!created.accepted) throw new Error('DDA_FOUNDATION_CONTEXT_INVALID');
  return created.value;
}

function asId(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('DDA_FOUNDATION_CONTEXT_INVALID');
  return parsed.value;
}

/** Compose DDA IAE require-* ports from the IAE artifact repository (no fabricated success). */
export function composeDdaIaePortFromArtifactRepository(
  artifacts: ArtifactRepositoryPortV1,
  processingContent: ArtifactProcessingContentPortV1 = new ObjectStorageArtifactProcessingContentAdapter(),
): DdaIaePortV1 {
  return createLookupBackedDdaIaePortV1({
    async findArtifactVersion(reference) {
      const context = contextFor(reference.tenantScope, reference.id);
      const found = await artifacts.findVersion(context, asId(reference.id));
      return found !== undefined;
    },
    findEvidenceReference() {
      // Evidence lookup by evidenceId alone is not exposed on ArtifactRepositoryPortV1.
      // Fail closed until an evidence-index composition port is supplied.
      return Promise.resolve(false);
    },
    async addRetentionConstraint(reference) {
      const context = contextFor(reference.tenantScope, reference.id);
      const found = await artifacts.findVersion(context, asId(reference.id));
      if (found === undefined) throw new Error('DDA_AUTHORITY_MISSING');
    },
    openProcessingContent: (input) => processingContent.openProcessingContent(input),
  });
}

export function composeDdaDsmPortFromDatasetVersionRepository(
  datasets: DatasetVersionRepositoryPortV1,
): DdaDsmPortV1 {
  return createLookupBackedDdaDsmPortV1({
    async findDatasetVersion(reference) {
      const context = contextFor(reference.tenantScope, reference.id);
      const found = await datasets.find(context, asId(reference.id));
      return found !== undefined;
    },
    findSemanticVersion() {
      return Promise.resolve(false);
    },
    findMetricVersion() {
      return Promise.resolve(false);
    },
  });
}

export function composeDdaJraPortFromRepositories(input: {
  readonly jobs: JobRepositoryPortV1;
  readonly manifests: ResultManifestRepositoryPortV1;
}): DdaJraPortV1 {
  return createLookupBackedDdaJraPortV1({
    async findJob(reference) {
      const context = contextFor(reference.tenantScope, reference.id);
      const found = await input.jobs.find(context, asId(reference.id));
      return found !== undefined;
    },
    async findResultManifest(reference) {
      const context = contextFor(reference.tenantScope, reference.id);
      const found = await input.manifests.find(context, asId(reference.id));
      return found !== undefined;
    },
  });
}

export function composeDdaDsoPortFromCapabilityRepository(
  capabilities: DeviceCapabilityRepositoryPortV1,
): DdaDsoPortV1 {
  return createLookupBackedDdaDsoPortV1({
    async findCapabilityGrant(reference) {
      const context = contextFor(reference.tenantScope, reference.id);
      const grant = await capabilities.findGrant(context, asId(reference.id));
      if (grant !== undefined) return true;
      const capability = await capabilities.findCapability(context, asId(reference.id));
      return capability !== undefined;
    },
    findProjection() {
      return Promise.resolve(false);
    },
  });
}

export function composeDdaBuaPortFromAdmissionService(
  admission: EntitlementAdmissionService,
): DdaBuaPortV1 {
  return createLookupBackedDdaBuaPortV1({
    async admit(reference, usageClass) {
      const context = contextFor(reference.tenantScope, reference.id);
      const result = await admission.admit(context, {
        snapshotId: reference.id,
        feature: usageClass,
        reservationId: reference.id,
        entryId: reference.id,
        tenantScope: reference.tenantScope,
        metric: usageClass,
        requestedUnits: 1,
        idempotencyKey: `dda-bua-${reference.id}`,
        now: new Date().toISOString(),
      });
      return result.accepted;
    },
  });
}

export function composeDdaAudPortFromLedger(ledger: AuditLedgerService): DdaAudComposePortV1 {
  return createLookupBackedDdaAudPortV1({
    async emitContentSafeSummary(input) {
      const context = contextFor(input.tenantScope, input.correlationId);
      const result = await ledger.append(context, {
        eventId: input.correlationId,
        actorType: 'SYSTEM',
        action: input.action,
        entityType: 'dda',
        entityId: input.references[0] ?? input.correlationId,
        entityRevision: 1,
        occurredAt: new Date().toISOString(),
        summary: Object.freeze({
          outcome: input.outcome,
          referenceCount: input.references.length,
        }),
      });
      if (!result.accepted) throw new Error('DDA_AUTHORITY_MISSING');
    },
  });
}
