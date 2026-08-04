import { randomUUID } from 'node:crypto';

import {
  createSpreadsheetAuditRunAdmissionRequestV1,
  createSpreadsheetAuditRunV1,
  toSpreadsheetAuditRunHandleV1,
  type SpreadsheetAuditRunV1,
  type SpreadsheetAuditRunErrorCodeV1,
  type SpreadsheetAuditRunHandleV1,
} from '@databreeze/domain/spreadsheet-audit-run/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { ArtifactRepositoryPortV1 } from '../../iae/application/artifact-repository.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { SpreadsheetAuditRunRepositoryPortV1 } from './spreadsheet-audit-run-repository.port.js';

export type SpreadsheetAuditRunServiceErrorV1 =
  | SpreadsheetAuditRunErrorCodeV1
  | 'SA_RUN_NOT_FOUND'
  | 'SA_RUN_IDEMPOTENCY_CONFLICT'
  | 'SA_RUN_ARTIFACT_UNAVAILABLE';

export type SpreadsheetAuditRunServiceResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: SpreadsheetAuditRunServiceErrorV1 };

export type SpreadsheetAuditRunIdGeneratorV1 = () => string;
export type SpreadsheetAuditRunClockV1 = () => Date;

function rejected<TValue>(
  code: SpreadsheetAuditRunServiceErrorV1,
): SpreadsheetAuditRunServiceResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** Admits a content-free, tenant-scoped Spreadsheet Auditor run for later JRA dispatch. */
export class SpreadsheetAuditRunService {
  public constructor(
    private readonly repository: SpreadsheetAuditRunRepositoryPortV1,
    private readonly artifactRepository?: ArtifactRepositoryPortV1,
    private readonly idGenerator: SpreadsheetAuditRunIdGeneratorV1 = () => randomUUID(),
    private readonly clock: SpreadsheetAuditRunClockV1 = () => new Date(),
  ) {}

  private async artifactIsAvailable(
    context: IamTenantContextV1,
    artifactVersionId: SpreadsheetAuditRunV1['artifactVersionId'],
  ): Promise<boolean> {
    if (this.artifactRepository === undefined) return false;
    return this.artifactRepository.withTransaction(context, async (transaction) => {
      const version = await transaction.findVersion(context, artifactVersionId);
      if (version === undefined || version.status !== 'ACTIVE' || version.scanState !== 'CLEAN')
        return false;
      const placements = await transaction.listPlacements(context, artifactVersionId);
      return placements.some(
        (placement) => placement.artifactVersionId === version.versionId && placement.available,
      );
    });
  }

  public async admit(
    context: IamTenantContextV1,
    input: { readonly artifactVersionId: unknown; readonly processorVersion: unknown },
  ): Promise<SpreadsheetAuditRunServiceResultV1<SpreadsheetAuditRunHandleV1>> {
    const request = createSpreadsheetAuditRunAdmissionRequestV1(input);
    if (!request.accepted) return rejected(request.code);
    const existing = await this.repository.findByIdempotency(context, context.idempotencyKey);
    if (existing) {
      if (
        existing.artifactVersionId === request.value.artifactVersionId &&
        existing.processorVersion === request.value.processorVersion
      )
        return Object.freeze({
          accepted: true,
          value: toSpreadsheetAuditRunHandleV1(existing),
        });
      return rejected('SA_RUN_IDEMPOTENCY_CONFLICT');
    }
    if (!(await this.artifactIsAvailable(context, request.value.artifactVersionId)))
      return rejected('SA_RUN_ARTIFACT_UNAVAILABLE');
    return this.repository.withTransaction(context, async (transaction) => {
      const raced = await transaction.findByIdempotency(context, context.idempotencyKey);
      if (raced) {
        if (
          raced.artifactVersionId === request.value.artifactVersionId &&
          raced.processorVersion === request.value.processorVersion
        )
          return Object.freeze({
            accepted: true,
            value: toSpreadsheetAuditRunHandleV1(raced),
          });
        return rejected('SA_RUN_IDEMPOTENCY_CONFLICT');
      }
      if (!(await this.artifactIsAvailable(context, request.value.artifactVersionId)))
        return rejected('SA_RUN_ARTIFACT_UNAVAILABLE');

      let createdAt: string;
      try {
        createdAt = this.clock().toISOString();
      } catch {
        return rejected('INVALID_TIMESTAMP');
      }
      const created = createSpreadsheetAuditRunV1({
        runId: this.idGenerator(),
        jobId: this.idGenerator(),
        tenantScope: context.tenantScope,
        artifactVersionId: request.value.artifactVersionId,
        processorVersion: request.value.processorVersion,
        idempotencyKey: context.idempotencyKey,
        createdAt,
      });
      if (!created.accepted) return rejected(created.code);
      await transaction.save(context, created.value);
      return Object.freeze({
        accepted: true,
        value: toSpreadsheetAuditRunHandleV1(created.value),
      });
    });
  }

  public async find(
    context: IamTenantContextV1,
    runIdInput: unknown,
  ): Promise<SpreadsheetAuditRunServiceResultV1<SpreadsheetAuditRunHandleV1>> {
    const runId = parseStableIdentifierV1(runIdInput);
    if (!runId.accepted) return rejected('INVALID_IDENTIFIER');
    const run = await this.repository.find(context, runId.value);
    return run
      ? Object.freeze({ accepted: true, value: toSpreadsheetAuditRunHandleV1(run) })
      : rejected('SA_RUN_NOT_FOUND');
  }
}
