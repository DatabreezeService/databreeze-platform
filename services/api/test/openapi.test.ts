import assert from 'node:assert/strict';
import test from 'node:test';

import type { OpenAPIObject } from '@nestjs/swagger';

import { createApiApplication } from '../src/bootstrap.js';
import { CLIENT_VERSION_PATTERN_SOURCE } from '../src/features/system/api/client-compatibility.dto.js';

const httpMethods = ['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'] as const;

interface ParameterLike {
  readonly in?: string;
  readonly name?: string;
}

interface ResponseLike {
  readonly $ref?: string;
  readonly content?: Record<string, unknown>;
  readonly headers?: Record<string, unknown>;
}

interface OperationLike {
  readonly parameters?: readonly ParameterLike[];
  readonly responses: Record<string, ResponseLike>;
  readonly security?: readonly Readonly<Record<string, readonly string[]>>[];
}

type PathItemLike = Partial<Record<(typeof httpMethods)[number], OperationLike>>;

function operations(document: OpenAPIObject): OperationLike[] {
  const found: OperationLike[] = [];
  for (const pathItem of Object.values(document.paths) as PathItemLike[]) {
    for (const method of httpMethods) {
      const operation = pathItem[method];
      if (operation !== undefined) found.push(operation);
    }
  }
  return found;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`;
}

void test('generates deterministic versioned OpenAPI with safe headers, errors, validation, and operational paths', async () => {
  const first = await createApiApplication();
  const second = await createApiApplication();
  try {
    const firstDocument = first.openApi as OpenAPIObject;
    const secondDocument = second.openApi as OpenAPIObject;
    assert.equal(stableJson(firstDocument), stableJson(secondDocument));
    assert.equal(firstDocument.openapi, '3.1.0');
    assert.equal(
      (firstDocument as OpenAPIObject & { jsonSchemaDialect?: string }).jsonSchemaDialect,
      'https://json-schema.org/draft/2020-12/schema',
    );
    assert.equal(firstDocument.info.version, '1.0.0');
    const bootstrapResponse = (
      firstDocument.paths['/v1/me/bootstrap']?.get as OperationLike | undefined
    )?.responses['200'];
    assert.equal(
      (
        bootstrapResponse?.content?.['application/json'] as
          | { readonly schema?: { readonly $ref?: string } }
          | undefined
      )?.schema?.$ref,
      '#/components/schemas/BootstrapResponseDto',
    );
    const membershipResponses = (
      firstDocument.paths['/v1/memberships']?.get as OperationLike | undefined
    )?.responses;
    for (const status of ['400', '403', '404', '409', '410', '503']) {
      assert.equal(
        (
          membershipResponses?.[status]?.content?.['application/json'] as
            | { readonly schema?: { readonly $ref?: string } }
            | undefined
        )?.schema?.$ref,
        '#/components/schemas/MembershipRejectedResponseDto',
      );
    }
    const invitationResponses = (
      firstDocument.paths['/v1/invitations']?.post as OperationLike | undefined
    )?.responses;
    for (const status of ['400', '403', '404', '409', '503']) {
      assert.equal(
        (
          invitationResponses?.[status]?.content?.['application/json'] as
            | { readonly schema?: { readonly $ref?: string } }
            | undefined
        )?.schema?.$ref,
        '#/components/schemas/InvitationRejectedResponseDto',
      );
    }

    const paths = Object.keys(firstDocument.paths).sort();
    assert.deepEqual(paths, [
      '/health/live',
      '/health/ready',
      '/v1/artifact-deletion-requests/{requestId}',
      '/v1/artifact-deletion-requests/{requestId}/authorize',
      '/v1/artifact-upload-sessions',
      '/v1/artifact-upload-sessions/{sessionId}',
      '/v1/artifact-upload-sessions/{sessionId}/abort',
      '/v1/artifact-upload-sessions/{sessionId}/complete',
      '/v1/artifact-upload-sessions/{sessionId}/parts',
      '/v1/artifact-upload-sessions/{sessionId}/parts/transfer',
      '/v1/artifact-versions/{versionId}',
      '/v1/artifact-versions/{versionId}/admit',
      '/v1/artifact-versions/{versionId}/deletion-requests',
      '/v1/artifact-versions/{versionId}/derived-lineage',
      '/v1/artifact-versions/{versionId}/evidence',
      '/v1/artifact-versions/{versionId}/evidence/{evidenceId}/resolve',
      '/v1/artifact-versions/{versionId}/lineage',
      '/v1/artifact-versions/{versionId}/placements/{placementId}',
      '/v1/artifacts/evidence-grants/{grantId}',
      '/v1/artifacts/exports',
      '/v1/artifacts/exports/{manifestId}',
      '/v1/artifacts/inbox',
      '/v1/artifacts/inbox/{inboxItemId}',
      '/v1/artifacts/{versionId}/evidence/{evidenceId}/grants',
      '/v1/audit/attestations',
      '/v1/audit/attestations/{attestationId}/verify',
      '/v1/audit/events',
      '/v1/audit/seals',
      '/v1/auth/me',
      '/v1/auth/mfa/factors',
      '/v1/auth/mfa/factors/{factorId}/verify',
      '/v1/auth/mfa/recovery/redeem',
      '/v1/auth/recovery',
      '/v1/auth/recovery/complete',
      '/v1/auth/refresh',
      '/v1/auth/register',
      '/v1/auth/sign-in',
      '/v1/auth/sign-out',
      '/v1/data-mode-policies',
      '/v1/data-mode-policies/{policyId}',
      '/v1/dataset-exports',
      '/v1/dataset-exports/{manifestId}',
      '/v1/dataset-profiles',
      '/v1/dataset-profiles/page',
      '/v1/dataset-profiles/{profileId}',
      '/v1/dataset-quality-results',
      '/v1/dataset-quality-results/{resultId}',
      '/v1/dataset-versions',
      '/v1/dataset-versions/{versionId}',
      '/v1/datasets',
      '/v1/datasets/{datasetId}/compatibility',
      '/v1/datasets/{datasetId}/mappings',
      '/v1/datasets/{datasetId}/mappings/{versionId}/publish',
      '/v1/datasets/{datasetId}/rules',
      '/v1/datasets/{datasetId}/rules/{versionId}/publish',
      '/v1/datasets/{datasetId}/versions',
      '/v1/datasets/{datasetId}/versions/{versionId}',
      '/v1/datasets/{datasetId}/versions/{versionId}/publish',
      '/v1/devices/enroll',
      '/v1/devices/enrollment-challenges',
      '/v1/devices/grants',
      '/v1/devices/grants/{grantId}/revoke',
      '/v1/devices/sync/conflicts',
      '/v1/devices/sync/operations',
      '/v1/devices/sync/operations/{operationId}/transition',
      '/v1/devices/sync/packages',
      '/v1/devices/sync/packages/receipts',
      '/v1/devices/sync/pull',
      '/v1/devices/sync/push',
      '/v1/devices/{deviceId}/activate',
      '/v1/devices/{deviceId}/capabilities',
      '/v1/devices/{deviceId}/capabilities/{capabilityId}/pause',
      '/v1/devices/{deviceId}/grants',
      '/v1/devices/{deviceId}/key',
      '/v1/devices/{deviceId}/revoke',
      '/v1/entitlements/leases/{leaseId}/verify',
      '/v1/entitlements/snapshots/{snapshotId}',
      '/v1/entitlements/snapshots/{snapshotId}/leases',
      '/v1/entitlements/usage',
      '/v1/invitations',
      '/v1/invitations/accept',
      '/v1/me/bootstrap',
      '/v1/memberships',
      '/v1/memberships/{membershipId}/accept',
      '/v1/memberships/{membershipId}/transfer-ownership',
      '/v1/memberships/{membershipId}/transition',
      '/v1/organizations/{organizationId}',
      '/v1/organizations/{organizationId}/devices',
      '/v1/organizations/{organizationId}/service-accounts',
      '/v1/organizations/{organizationId}/workspaces',
      '/v1/projects/{projectId}',
      '/v1/protected-document-unlocks',
      '/v1/protected-document-unlocks/{requestId}',
      '/v1/protected-document-unlocks/{requestId}/expire',
      '/v1/protected-document-unlocks/{requestId}/handle',
      '/v1/protected-document-unlocks/{requestId}/outcome',
      '/v1/reference-entities',
      '/v1/reference-entities/merge',
      '/v1/reference-entities/{entityId}/resolutions',
      '/v1/reference-entities/{entityId}/versions',
      '/v1/reference-entities/{entityId}/versions/{versionId}',
      '/v1/service-accounts',
      '/v1/service-accounts/{serviceAccountId}/revoke',
      '/v1/service-accounts/{serviceAccountId}/rotate',
      '/v1/spreadsheet-audits',
      '/v1/spreadsheet-audits/{auditId}',
      '/v1/system/compatibility',
      '/v1/system/compatibility/check',
      '/v1/workspaces/{workspaceId}',
      '/v1/workspaces/{workspaceId}/projects',
    ]);
    assert.ok(
      paths.filter((path) => !path.startsWith('/health/')).every((path) => path.startsWith('/v1/')),
    );
    assert.equal(
      (firstDocument.paths['/health/live']?.get as Record<string, unknown> | undefined)?.[
        'x-databreeze-audience'
      ],
      'operational',
    );

    const problem = firstDocument.components?.schemas?.['ProblemDetails'] as Record<
      string,
      unknown
    >;
    assert.equal(problem['additionalProperties'], false);
    assert.deepEqual(problem['required'], ['type', 'status', 'code', 'correlationId', 'retryable']);
    const compatibility = firstDocument.components?.schemas?.['ClientCompatibilityDto'] as Record<
      string,
      unknown
    >;
    assert.equal(compatibility['additionalProperties'], false);
    const clientVersion = (compatibility['properties'] as Record<string, Record<string, unknown>>)[
      'clientVersion'
    ];
    assert.equal(clientVersion?.['pattern'], CLIENT_VERSION_PATTERN_SOURCE);
    const documentedClientVersion = new RegExp(String(clientVersion?.['pattern']));
    assert.equal(documentedClientVersion.test('1.2.3'), true);
    assert.equal(documentedClientVersion.test('1.2.3-beta.1'), true);
    assert.equal(documentedClientVersion.test('1.2.3garbage'), false);
    const refreshResponse = firstDocument.components?.schemas?.[
      'SessionRefreshResponseDto'
    ] as Record<string, unknown>;
    const refreshToken = (refreshResponse['properties'] as Record<string, Record<string, unknown>>)[
      'refreshToken'
    ];
    assert.equal(refreshToken?.['writeOnly'], undefined);
    const deletionRequest = firstDocument.components?.schemas?.[
      'CreateArtifactDeletionRequestDto'
    ] as Record<string, unknown>;
    assert.equal((deletionRequest['required'] as readonly string[]).includes('requestedBy'), false);
    const requestedBy = (deletionRequest['properties'] as Record<string, Record<string, unknown>>)[
      'requestedBy'
    ];
    assert.equal(requestedBy?.['deprecated'], true);
    for (const [schemaName, propertyName, maxItems] of [
      ['CreateArtifactExportDto', 'versionIds', 1024],
      ['CreateGovernedDatasetDto', 'fields', 256],
      ['CreateMappingDto', 'steps', 512],
      ['CreateRuleSetDto', 'rules', 512],
      ['RegisterDatasetVersionDto', 'inputArtifactVersionIds', 1024],
      ['DatasetQualityFindingDto', 'evidenceIds', 128],
      ['RegisterDatasetQualityResultDto', 'findings', 512],
    ] as const) {
      const schema = firstDocument.components?.schemas?.[schemaName] as Record<string, unknown>;
      const property = (schema['properties'] as Record<string, Record<string, unknown>>)[
        propertyName
      ];
      assert.equal(
        property?.['maxItems'],
        maxItems,
        `${schemaName}.${propertyName} must be bounded`,
      );
    }
    const spreadsheetSheet = firstDocument.components?.schemas?.[
      'SpreadsheetAuditSheetDto'
    ] as Record<string, unknown>;
    assert.equal(
      (spreadsheetSheet['properties'] as Record<string, Record<string, unknown>>)['maxRow']?.[
        'maximum'
      ],
      1_048_576,
    );

    for (const operation of operations(firstDocument)) {
      const headerNames = (operation.parameters ?? [])
        .filter((parameter) => parameter.in === 'header')
        .map((parameter) => parameter.name ?? '');
      assert.ok(headerNames.includes('X-Correlation-Id'));
      assert.ok(operation.responses['400']);
      assert.ok(operation.responses['500']);
      for (const response of Object.values(operation.responses)) {
        if (response.$ref !== undefined) continue;
        assert.ok(response.headers?.['X-Request-Id']);
        assert.ok(response.headers?.['X-Correlation-Id']);
      }
    }

    const publicOperations = new Set([
      'GET /health/live',
      'GET /health/ready',
      'GET /v1/system/compatibility',
      'POST /v1/system/compatibility/check',
      'POST /v1/auth/sign-in',
      'POST /v1/auth/register',
      'POST /v1/auth/recovery',
      'POST /v1/auth/recovery/complete',
      'POST /v1/auth/refresh',
    ]);
    for (const [path, pathItem] of Object.entries(firstDocument.paths) as Array<
      [string, PathItemLike]
    >) {
      for (const method of httpMethods) {
        const operation = pathItem[method];
        if (operation === undefined) continue;
        const key = `${method.toUpperCase()} ${path}`;
        if (publicOperations.has(key)) {
          assert.equal(operation.security, undefined, `${key} must remain explicitly public`);
        } else {
          assert.deepEqual(operation.security, [{ bearer: [] }], `${key} must require bearer auth`);
        }
      }
    }

    for (const path of ['/v1/audit/events', '/v1/audit/seals'] as const) {
      const auditRead = firstDocument.paths[path]?.get as OperationLike | undefined;
      assert.ok(auditRead?.responses['200'], `${path} must document its successful response`);
      assert.ok(auditRead.responses['503'], `${path} must document audit persistence outages`);
    }
    const readiness = firstDocument.paths['/health/ready']?.get as OperationLike | undefined;
    assert.ok(readiness?.responses['503']?.content?.['application/problem+json']);

    const served = await first.app.inject({ method: 'GET', url: '/v1/openapi.json' });
    assert.equal(served.statusCode, 200);
    assert.deepEqual(served.json(), firstDocument);
  } finally {
    await Promise.all([first.app.close(), second.app.close()]);
  }
});
