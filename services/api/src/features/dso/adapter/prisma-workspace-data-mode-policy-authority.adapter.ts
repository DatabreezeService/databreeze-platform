import {
  createDataModePolicyVersionV1,
  type DataModePolicyVersionV1,
} from '@databreeze/domain/data-mode/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { DataModePolicyVersionLookupPortV1 } from '../application/data-mode-policy-version-lookup.port.js';
import type {
  CurrentWorkspaceDataModePolicyV1,
  WorkspaceDataModePolicyAuthorityPortV1,
} from '../application/workspace-data-mode-policy-authority.port.js';

interface CurrentRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly currentVersionId: string;
  readonly currentVersionHash: string;
  readonly revision: number;
}

interface VersionRowV1 {
  readonly id: string;
  readonly policyId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly revision: number;
  readonly mode: string;
  readonly allowedPayloadClasses: unknown;
  readonly allowedPlacementKinds: unknown;
  readonly allowedExecutorClasses: unknown;
  readonly allowedDestinationClasses: unknown;
  readonly canonicalHash: string;
  readonly publishedAt: Date;
}

interface FindFirstDelegateV1<TRow> {
  findFirst(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<TRow | null>;
}

export interface WorkspaceDataModePolicyAuthorityDatabaseClientV1 {
  readonly workspaceDataModePolicyRecord: FindFirstDelegateV1<CurrentRowV1>;
  readonly deviceDataModePolicyRecord: FindFirstDelegateV1<VersionRowV1>;
}

const HASH = /^[a-f0-9]{64}$/u;

function currentFromRow(row: CurrentRowV1): CurrentWorkspaceDataModePolicyV1 | undefined {
  const organizationId = parseStableIdentifierV1(row.organizationId);
  const workspaceId = parseStableIdentifierV1(row.workspaceId);
  const policyId = parseStableIdentifierV1(row.id);
  const currentVersionId = parseStableIdentifierV1(row.currentVersionId);
  if (
    !organizationId.accepted ||
    !workspaceId.accepted ||
    !policyId.accepted ||
    !currentVersionId.accepted ||
    !HASH.test(row.currentVersionHash) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  )
    return undefined;
  return Object.freeze({
    organizationId: organizationId.value,
    workspaceId: workspaceId.value,
    policyId: policyId.value,
    currentPolicyVersionId: currentVersionId.value,
    currentPolicyVersionHash: row.currentVersionHash,
    aggregateRevision: row.revision,
  });
}

function versionFromRow(row: VersionRowV1): DataModePolicyVersionV1 | undefined {
  const parsed = createDataModePolicyVersionV1({
    policyId: row.policyId,
    policyVersionId: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    revision: row.revision,
    mode: row.mode,
    allowedPayloadClasses: row.allowedPayloadClasses,
    allowedPlacementKinds: row.allowedPlacementKinds,
    allowedExecutorClasses: row.allowedExecutorClasses,
    allowedDestinationClasses: row.allowedDestinationClasses,
    canonicalHash: row.canonicalHash,
    publishedAt: row.publishedAt.toISOString(),
  });
  return parsed.accepted ? parsed.value : undefined;
}

export class PrismaWorkspaceDataModePolicyAuthorityAdapter
  implements WorkspaceDataModePolicyAuthorityPortV1
{
  public constructor(private readonly database: WorkspaceDataModePolicyAuthorityDatabaseClientV1) {}

  public async resolveCurrent(
    input: Parameters<WorkspaceDataModePolicyAuthorityPortV1['resolveCurrent']>[0],
  ): Promise<CurrentWorkspaceDataModePolicyV1 | undefined> {
    try {
      const row = await this.database.workspaceDataModePolicyRecord.findFirst({
        where: { organizationId: input.organizationId, workspaceId: input.workspaceId },
      });
      if (row === null) return undefined;
      const current = currentFromRow(row);
      return current?.organizationId === input.organizationId &&
        current.workspaceId === input.workspaceId
        ? current
        : undefined;
    } catch {
      return undefined;
    }
  }
}

export class PrismaDataModePolicyVersionLookupAdapter
  implements DataModePolicyVersionLookupPortV1
{
  public constructor(private readonly database: WorkspaceDataModePolicyAuthorityDatabaseClientV1) {}

  public async findExact(
    input: Parameters<DataModePolicyVersionLookupPortV1['findExact']>[0],
  ): Promise<DataModePolicyVersionV1 | undefined> {
    try {
      const row = await this.database.deviceDataModePolicyRecord.findFirst({
        where: {
          id: input.policyVersionId,
          policyId: input.policyId,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
        },
      });
      if (row === null) return undefined;
      const version = versionFromRow(row);
      return version?.organizationId === input.organizationId &&
        version.workspaceId === input.workspaceId &&
        version.policyId === input.policyId &&
        version.policyVersionId === input.policyVersionId
        ? version
        : undefined;
    } catch {
      return undefined;
    }
  }
}
