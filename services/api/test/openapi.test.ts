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
  readonly headers?: Record<string, unknown>;
}

interface OperationLike {
  readonly parameters?: readonly ParameterLike[];
  readonly responses: Record<string, ResponseLike>;
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

    const paths = Object.keys(firstDocument.paths).sort();
    assert.deepEqual(paths, [
      '/health/live',
      '/health/ready',
      '/v1/system/compatibility',
      '/v1/system/compatibility/check',
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

    const served = await first.app.inject({ method: 'GET', url: '/v1/openapi.json' });
    assert.equal(served.statusCode, 200);
    assert.deepEqual(served.json(), firstDocument);
  } finally {
    await Promise.all([first.app.close(), second.app.close()]);
  }
});
