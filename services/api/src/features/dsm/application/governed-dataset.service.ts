import {
  compareGovernedSchemaCompatibilityV1,
  createGovernedDatasetDefinitionV1,
  publishGovernedDatasetDefinitionV1,
  type GovernedDefinitionStatusV1,
  type GovernedFieldTypeV1,
  type DatasetGovernanceResultV1,
  type GovernedDatasetDefinitionV1,
  type SchemaCompatibilityV1,
} from '@databreeze/domain/dataset-governance/v1';
import {
  parseStableIdentifierV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { GovernedDatasetRepositoryPortV1 } from './governed-dataset-repository.port.js';

export type GovernedDatasetServiceErrorV1 =
  | 'VERSION_NOT_FOUND'
  | 'INVALID_CURSOR'
  | 'INVALID_LIMIT';
export type GovernedDatasetServiceResultV1<TValue> =
  | DatasetGovernanceResultV1<TValue>
  | { readonly accepted: false; readonly code: GovernedDatasetServiceErrorV1 };

export interface GovernedDatasetIndexEntryV1 {
  readonly datasetId: StableIdentifierV1;
  readonly versionId: StableIdentifierV1;
  readonly label: string;
  readonly status: 'PUBLISHED';
  readonly versionLabel: string;
  readonly publishedAt: string;
  readonly fieldCount: number;
  readonly fieldTypes: readonly GovernedFieldTypeV1[];
  /** Quality is not stored on a governed definition; do not imply a quality result. */
  readonly health: 'UNKNOWN';
  /** A published definition is referenceable, but this is not a quality claim. */
  readonly readiness: 'READY';
}

export interface GovernedDatasetIndexPageV1 {
  readonly datasets: readonly GovernedDatasetIndexEntryV1[];
  readonly page: {
    readonly limit: number;
    readonly nextCursor?: string;
  };
}

const DEFAULT_INDEX_LIMIT = 25;
const MAX_INDEX_LIMIT = 100;

function rejected(code: GovernedDatasetServiceErrorV1) {
  return Object.freeze({ accepted: false as const, code });
}

function visible(context: IamTenantContextV1, definition: GovernedDatasetDefinitionV1): boolean {
  return tenantScopesEqualV1(context.tenantScope, definition.tenantScope);
}

function publishedTime(definition: GovernedDatasetDefinitionV1): string {
  return definition.publishedAt ?? definition.createdAt;
}

function isNewer(
  candidate: GovernedDatasetDefinitionV1,
  current: GovernedDatasetDefinitionV1,
): boolean {
  return (
    publishedTime(candidate).localeCompare(publishedTime(current)) > 0 ||
    (publishedTime(candidate) === publishedTime(current) &&
      candidate.createdAt.localeCompare(current.createdAt) > 0) ||
    (publishedTime(candidate) === publishedTime(current) &&
      candidate.createdAt === current.createdAt &&
      candidate.versionId.localeCompare(current.versionId) > 0)
  );
}

export function encodeGovernedDatasetIndexCursorV1(datasetId: StableIdentifierV1): string {
  return Buffer.from(datasetId, 'utf8').toString('base64url');
}

function decodeCursor(input: unknown): StableIdentifierV1 | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > 512) return undefined;
  try {
    const decoded = Buffer.from(input, 'base64url').toString('utf8');
    const parsed = parseStableIdentifierV1(decoded);
    return parsed.accepted ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

function indexLimit(input: unknown): number | undefined {
  const candidate = typeof input === 'string' && /^\d+$/u.test(input) ? Number(input) : input;
  return typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate > 0
    ? Math.min(candidate, MAX_INDEX_LIMIT)
    : undefined;
}

function toIndexEntry(definition: GovernedDatasetDefinitionV1): GovernedDatasetIndexEntryV1 {
  const versionLabel = publishedTime(definition);
  return Object.freeze({
    datasetId: definition.datasetId,
    versionId: definition.versionId,
    label: definition.name,
    status: 'PUBLISHED' as const,
    versionLabel,
    publishedAt: versionLabel,
    fieldCount: definition.fields.length,
    fieldTypes: Object.freeze(definition.fields.map((field) => field.type)),
    health: 'UNKNOWN' as const,
    readiness: 'READY' as const,
  });
}

export class GovernedDatasetService {
  public constructor(private readonly repository: GovernedDatasetRepositoryPortV1) {}

  public async create(
    context: IamTenantContextV1,
    input: Parameters<typeof createGovernedDatasetDefinitionV1>[0],
  ): Promise<GovernedDatasetServiceResultV1<GovernedDatasetDefinitionV1>> {
    const created = createGovernedDatasetDefinitionV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.versionId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value)) return created;
        throw new Error('DSM_IMMUTABLE_DEFINITION');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async publish(
    context: IamTenantContextV1,
    versionId: StableIdentifierV1,
    nextVersionIdInput: unknown,
    publishedAt: unknown,
  ): Promise<GovernedDatasetServiceResultV1<GovernedDatasetDefinitionV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, versionId);
      if (!current) return Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });
      const published = publishGovernedDatasetDefinitionV1(
        current,
        nextVersionIdInput,
        publishedAt,
      );
      if (!published.accepted) return published;
      await transaction.save(context, published.value);
      return published;
    });
  }

  public async compare(
    context: IamTenantContextV1,
    previousVersionId: StableIdentifierV1,
    nextVersionId: StableIdentifierV1,
  ): Promise<GovernedDatasetServiceResultV1<SchemaCompatibilityV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const previous = await transaction.find(context, previousVersionId);
      const next = await transaction.find(context, nextVersionId);
      if (!previous || !next)
        return Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });
      return compareGovernedSchemaCompatibilityV1(previous, next);
    });
  }

  public async list(
    context: IamTenantContextV1,
    datasetId: StableIdentifierV1,
  ): Promise<readonly GovernedDatasetDefinitionV1[]> {
    return this.repository.withTransaction(context, (transaction) =>
      transaction.list(context, datasetId),
    );
  }

  public async listIndex(
    context: IamTenantContextV1,
    cursorInput?: unknown,
    limitInput?: unknown,
  ): Promise<GovernedDatasetServiceResultV1<GovernedDatasetIndexPageV1>> {
    const limit = limitInput === undefined ? DEFAULT_INDEX_LIMIT : indexLimit(limitInput);
    if (limit === undefined) return rejected('INVALID_LIMIT');
    if (cursorInput !== undefined && decodeCursor(cursorInput) === undefined)
      return rejected('INVALID_CURSOR');
    const cursor = cursorInput === undefined ? undefined : decodeCursor(cursorInput);
    const definitions = await this.repository.withTransaction(context, (transaction) =>
      transaction.listPublished(context),
    );
    const latestByDataset = new Map<string, GovernedDatasetDefinitionV1>();
    for (const definition of definitions) {
      if (definition.status !== ('PUBLISHED' as GovernedDefinitionStatusV1)) continue;
      if (!visible(context, definition)) continue;
      const current = latestByDataset.get(definition.datasetId);
      if (current === undefined || isNewer(definition, current)) {
        latestByDataset.set(definition.datasetId, definition);
      }
    }
    const ordered = [...latestByDataset.values()].sort((left, right) =>
      left.datasetId.localeCompare(right.datasetId),
    );
    const start = cursor === undefined ? 0 : ordered.findIndex((item) => item.datasetId > cursor);
    const offset = cursor === undefined ? 0 : start < 0 ? ordered.length : start;
    const pageDefinitions = ordered.slice(offset, offset + limit);
    const last = pageDefinitions[pageDefinitions.length - 1];
    const hasMore = offset + limit < ordered.length;
    return Object.freeze({
      accepted: true as const,
      value: Object.freeze({
        datasets: Object.freeze(pageDefinitions.map(toIndexEntry)),
        page: Object.freeze({
          limit,
          ...(hasMore && last
            ? { nextCursor: encodeGovernedDatasetIndexCursorV1(last.datasetId) }
            : {}),
        }),
      }),
    });
  }

  public async find(
    context: IamTenantContextV1,
    versionId: StableIdentifierV1,
  ): Promise<GovernedDatasetServiceResultV1<GovernedDatasetDefinitionV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const definition = await transaction.find(context, versionId);
      return definition
        ? Object.freeze({ accepted: true as const, value: definition })
        : Object.freeze({ accepted: false as const, code: 'VERSION_NOT_FOUND' as const });
    });
  }
}
