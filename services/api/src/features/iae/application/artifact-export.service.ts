import { createHash } from 'node:crypto';

import {
  createArtifactExportManifestV1,
  type ArtifactExportManifestV1,
  type ArtifactExportResultV1,
} from '@databreeze/domain/artifact-export/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import { ArtifactService } from './artifact.service.js';
import type { ArtifactLineageRepositoryPortV1 } from './artifact-lineage-repository.port.js';
import type { ArtifactExportRepositoryPortV1 } from './artifact-export-repository.port.js';

export type ArtifactExportServiceErrorV1 = 'ARTIFACT_NOT_FOUND';
export type ArtifactExportServiceResultV1<TValue> =
  | ArtifactExportResultV1<TValue>
  | { readonly accepted: false; readonly code: ArtifactExportServiceErrorV1 };

/** Builds and stores an export manifest without copying protected source bytes. */
export class ArtifactExportService {
  public constructor(
    private readonly manifests: ArtifactExportRepositoryPortV1,
    private readonly artifacts: ArtifactService,
    private readonly lineage: ArtifactLineageRepositoryPortV1,
  ) {}

  public async create(
    context: IamTenantContextV1,
    input: {
      readonly manifestId: unknown;
      readonly versionIds: readonly unknown[];
      readonly approvalState: unknown;
      readonly createdAt: unknown;
    },
  ): Promise<ArtifactExportServiceResultV1<ArtifactExportManifestV1>> {
    const entries: Array<{
      readonly versionId: string;
      readonly contentSha256: string;
      readonly byteSize: number;
      readonly evidenceIds: readonly string[];
      readonly processorVersions: readonly string[];
    }> = [];
    for (const candidate of input.versionIds) {
      const versionId = parseStableIdentifierV1(candidate);
      if (!versionId.accepted)
        return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
      const found = await this.artifacts.find(context, versionId.value);
      if (!found.version)
        return Object.freeze({ accepted: false, code: 'ARTIFACT_NOT_FOUND' as const });
      const derivedLineage = await this.lineage.withTransaction(context, (transaction) =>
        transaction.findByDerived(context, versionId.value),
      );
      entries.push({
        versionId: found.version.versionId,
        contentSha256: found.version.contentSha256,
        byteSize: found.version.byteSize,
        evidenceIds: found.evidence.map((evidence) => evidence.evidenceId),
        processorVersions: derivedLineage ? [derivedLineage.processorVersion] : [],
      });
    }
    const canonicalInput = JSON.stringify({
      tenantScope: context.tenantScope,
      entries,
      approvalState: input.approvalState,
    });
    const canonicalHash = createHash('sha256').update(canonicalInput).digest('hex');
    const created = createArtifactExportManifestV1({
      manifestId: input.manifestId,
      tenantScope: context.tenantScope,
      entries,
      approvalState: input.approvalState,
      createdAt: input.createdAt,
      canonicalHash,
    });
    if (!created.accepted) return created;
    return this.manifests.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.manifestId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value))
          return { accepted: true, value: existing };
        throw new Error('IAE_IMMUTABLE_EXPORT_MANIFEST');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async find(
    context: IamTenantContextV1,
    manifestIdInput: unknown,
  ): Promise<ArtifactExportServiceResultV1<ArtifactExportManifestV1>> {
    const manifestId = parseStableIdentifierV1(manifestIdInput);
    if (!manifestId.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
    const found = await this.manifests.find(context, manifestId.value);
    return found
      ? Object.freeze({ accepted: true, value: found })
      : Object.freeze({ accepted: false, code: 'ARTIFACT_NOT_FOUND' as const });
  }
}
