import assert from 'node:assert/strict';
import test from 'node:test';

import type { OpenAPIObject } from '@nestjs/swagger';

import { createApiApplication } from '../src/bootstrap.js';
import { CLIENT_VERSION_PATTERN_SOURCE } from '../src/features/system/api/client-compatibility.dto.js';

const httpMethods = ['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'] as const;
const strictUtcTimestampPattern = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$';

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
  readonly requestBody?: unknown;
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
    for (const requiredPath of [
      '/v1/mobile/tasks',
      '/v1/mobile/route-tokens/{token}/resolve',
      '/v1/mobile/push-registrations',
      '/v1/mobile/reports',
      '/v1/approvals/requests',
      '/v1/approvals/requests/{requestId}/decisions',
      '/v1/devices/sync/cursors/bootstrap',
      '/v1/dda/invoice-extractions',
      '/v1/dda/table-extractions',
    ]) {
      assert.ok(paths.includes(requiredPath), `missing documented path: ${requiredPath}`);
    }
    const invoiceOperation = firstDocument.paths['/v1/dda/invoice-extractions']?.post as OperationLike;
    assert.ok(invoiceOperation.requestBody, 'invoice extraction must document its request schema');
    assert.ok(invoiceOperation.responses['200']?.content?.['application/json'], 'invoice extraction must document its response schema');
    const mobileTasksOperation = firstDocument.paths['/v1/mobile/tasks']?.get as OperationLike;
    assert.ok(mobileTasksOperation.responses['200']?.content?.['application/json'], 'mobile tasks must document its response schema');
    assert.ok(
      paths
        .filter((path) => !path.startsWith('/health/'))
        .every(
          (path) =>
            path.startsWith('/v1/') ||
            path.startsWith('/v3/') ||
            path.startsWith('/internal/worker/') ||
            path.startsWith('/internal/iae/'),
        ),
    );

    const ddaPaths = paths.filter(
      (path) => path.startsWith('/v1/dda/') || path.startsWith('/v3/dda/'),
    );
    assert.ok(ddaPaths.length >= 17, 'OpenAPI must document DDA routes');
    for (const path of ddaPaths) {
      const pathItem = firstDocument.paths[path] as PathItemLike;
      for (const method of httpMethods) {
        const operation = pathItem[method];
        if (operation === undefined) continue;
        assert.deepEqual(
          operation.security,
          [{ bearer: [] }],
          `${method.toUpperCase()} ${path} must require bearer auth`,
        );
        assert.ok(
          operation.responses['400'],
          `${method.toUpperCase()} ${path} must document RFC 7807-compatible 400`,
        );
        assert.ok(
          operation.responses['500'],
          `${method.toUpperCase()} ${path} must document RFC 7807-compatible 500`,
        );
        const headerNames = (operation.parameters ?? [])
          .filter((parameter) => parameter.in === 'header')
          .map((parameter) => parameter.name ?? '');
        assert.ok(
          headerNames.includes('X-Correlation-Id'),
          `${method.toUpperCase()} ${path} must own request-context correlation`,
        );
      }
    }

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
    const refreshResponse = firstDocument.components?.schemas?.['AuthSessionDto'] as Record<
      string,
      unknown
    >;
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
    const spreadsheetSheetProperties = spreadsheetSheet['properties'] as Record<
      string,
      Record<string, unknown>
    >;
    assert.equal(spreadsheetSheetProperties['maxRow']?.['type'], 'integer');
    assert.equal(spreadsheetSheetProperties['maxColumn']?.['type'], 'integer');
    assert.equal(spreadsheetSheetProperties['formulaCount']?.['type'], 'integer');
    assert.equal(spreadsheetSheetProperties['maxRow']?.['maximum'], 1_048_576);

    for (const schemaName of [
      'CreateArtifactDeletionRequestDto',
      'AuthorizeArtifactDeletionRequestDto',
    ] as const) {
      const schema = firstDocument.components?.schemas?.[schemaName] as Record<string, unknown>;
      const properties = schema['properties'] as Record<string, Record<string, unknown>>;
      for (const propertyName of [
        'evaluatedAt',
        'workspaceRetentionUntil',
        'resourceRetentionUntil',
        'auditRetentionUntil',
        'recoveryWindowUntil',
        schemaName === 'CreateArtifactDeletionRequestDto' ? 'requestedAt' : 'approvedAt',
      ]) {
        assert.equal(
          properties[propertyName]?.['pattern'],
          strictUtcTimestampPattern,
          `${schemaName}.${propertyName} must document the strict UTC timestamp`,
        );
      }
    }
    const inboxProperties = (
      firstDocument.components?.schemas?.['UpdateInboxMetadataDto'] as Record<string, unknown>
    )['properties'] as Record<string, Record<string, unknown>>;
    const dueAtStringSchema = (
      inboxProperties['dueAt']?.['oneOf'] as readonly Record<string, unknown>[]
    ).find((candidate) => candidate['type'] === 'string');
    assert.equal(dueAtStringSchema?.['pattern'], strictUtcTimestampPattern);
    const auditResult = firstDocument.components?.schemas?.[
      'CreateSpreadsheetAuditResultDto'
    ] as Record<string, unknown>;
    const auditResultProperties = auditResult['properties'] as Record<
      string,
      Record<string, unknown>
    >;
    assert.equal(auditResultProperties['createdAt']?.['pattern'], strictUtcTimestampPattern);
    const admissionProperties = (
      firstDocument.components?.schemas?.['AdmitArtifactDto'] as Record<string, unknown>
    )['properties'] as Record<string, Record<string, unknown>>;
    assert.equal(admissionProperties['actualByteSize']?.['type'], 'integer');
    assert.equal(admissionProperties['maxByteSize']?.['type'], 'integer');

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
      'GET /v1/system/modules',
      'POST /v1/auth/sign-in',
      'POST /v1/auth/register',
      'POST /v1/auth/email-verification/verify',
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
        if (path.startsWith('/internal/')) continue;
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
