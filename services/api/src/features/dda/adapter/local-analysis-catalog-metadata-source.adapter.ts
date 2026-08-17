import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { AnalysisCatalogMetadataSourcePortV1 } from '../../../platform/dda-dashboard.composition.js';

interface DatasetVersionRowV1 {
  readonly id: string;
  readonly datasetId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
}

interface DatasetDefinitionRowV1 {
  readonly datasetId: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly fields: unknown;
  readonly status: string;
}

interface LocalAnalysisCatalogDatabaseClientV1 {
  readonly datasetVersionRecord: {
    findFirst(input: { readonly where: Record<string, unknown> }): Promise<DatasetVersionRowV1 | null>;
  };
  readonly datasetDefinitionRecord: {
    findFirst(input: { readonly where: Record<string, unknown> }): Promise<DatasetDefinitionRowV1 | null>;
  };
}

interface FieldDescriptorV1 {
  readonly name: string;
  readonly unit?: string;
}

function scopeWhere(scope: TenantScopeV1): Record<string, unknown> {
  if (scope.scopeType === 'project') {
    return {
      scopeType: scope.scopeType,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    };
  }
  if (scope.scopeType === 'workspace') {
    return {
      scopeType: scope.scopeType,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      projectId: null,
    };
  }
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: null,
    projectId: null,
  };
}

function sameScope(row: {
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
}, scope: TenantScopeV1): boolean {
  const expected = scopeWhere(scope);
  return (
    row.scopeType === expected['scopeType'] &&
    row.organizationId === expected['organizationId'] &&
    row.workspaceId === (expected['workspaceId'] ?? null) &&
    row.projectId === (expected['projectId'] ?? null)
  );
}

function parseFields(value: unknown): readonly FieldDescriptorV1[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const fields: FieldDescriptorV1[] = [];
  for (const candidate of value) {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return undefined;
    }
    const record = candidate as Record<string, unknown>;
    if (typeof record['name'] !== 'string' || record['name'].length === 0) return undefined;
    fields.push({
      name: record['name'],
      ...(typeof record['unit'] === 'string' && record['unit'].length > 0
        ? { unit: record['unit'] }
        : {}),
    });
  }
  return Object.freeze(fields);
}

/**
 * Local-only metadata source for the Compose profile. It reads the same published
 * DSM definition that owns the approved dataset; it never reads source rows and
 * never accepts field/permission metadata from the browser.
 */
export class LocalAnalysisCatalogMetadataSourceAdapterV1
  implements AnalysisCatalogMetadataSourcePortV1
{
  readonly #client: LocalAnalysisCatalogDatabaseClientV1;

  public constructor(client: LocalAnalysisCatalogDatabaseClientV1) {
    this.#client = client;
  }

  public async load(input: {
    readonly context: IamTenantContextV1;
    readonly datasetVersionId: string;
    readonly semanticVersionId: string;
    readonly metricVersionId: string;
    readonly permissionProjectionVersionId: string;
  }): Promise<
    | {
        readonly authorizedFields: readonly string[];
        readonly authorizedJoins: readonly string[];
        readonly units: Readonly<Record<string, string>>;
        readonly grains: readonly string[];
        readonly versionState: 'CURRENT' | 'STALE';
        readonly blockedReason?: never;
      }
    | undefined
  > {
    const scope = input.context.tenantScope;
    const version = await this.#client.datasetVersionRecord.findFirst({
      where: {
        id: input.datasetVersionId,
        ...scopeWhere(scope),
      },
    });
    if (
      version === null ||
      version.id !== input.datasetVersionId ||
      version.datasetId.length === 0 ||
      !sameScope(version, scope)
    ) {
      return undefined;
    }

    const definition = await this.#client.datasetDefinitionRecord.findFirst({
      where: {
        datasetId: version.datasetId,
        status: 'PUBLISHED',
        ...scopeWhere(scope),
      },
    });
    if (
      definition === null ||
      definition.datasetId !== version.datasetId ||
      definition.status !== 'PUBLISHED' ||
      !sameScope(definition, scope)
    ) {
      return undefined;
    }

    const fields = parseFields(definition.fields);
    if (fields === undefined || fields.length === 0) return undefined;
    const units: Record<string, string> = {};
    for (const field of fields) {
      if (field.unit !== undefined) units[field.name] = field.unit;
    }

    return Object.freeze({
      authorizedFields: Object.freeze(fields.map((field) => field.name)),
      authorizedJoins: Object.freeze([]),
      units: Object.freeze(units),
      grains: Object.freeze(['DAY', 'MONTH', 'YEAR']),
      versionState: 'CURRENT' as const,
    });
  }
}
