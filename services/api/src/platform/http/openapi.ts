import problemDetailsContract from '@databreeze/contracts/v1/problem-details' with { type: 'json' };
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

const responseHeaders = {
  'X-Correlation-Id': {
    description: 'Stable UUID that correlates related requests and errors.',
    schema: { format: 'uuid', type: 'string' },
  },
  'X-Request-Id': {
    description: 'Unique UUID generated for this HTTP request.',
    schema: { format: 'uuid', type: 'string' },
  },
} as const;

function safeProblemSchema(): Record<string, unknown> {
  const schema = structuredClone(problemDetailsContract) as Record<string, unknown>;
  delete schema['$schema'];
  delete schema['$id'];
  delete schema['$comment'];
  return schema;
}

function addSafetyMetadata(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas['ProblemDetails'] = safeProblemSchema();
  const compatibility = document.components.schemas['ClientCompatibilityDto'];
  if (compatibility !== undefined && !('$ref' in compatibility)) {
    compatibility.additionalProperties = false;
  }

  for (const pathItem of Object.values(document.paths)) {
    if (pathItem === undefined) continue;
    for (const method of [
      'delete',
      'get',
      'head',
      'options',
      'patch',
      'post',
      'put',
      'trace',
    ] as const) {
      const operation = pathItem[method];
      if (operation === undefined) continue;
      operation.responses['400'] ??= {
        description: 'The request was malformed or failed closed validation.',
        content: {
          'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
        },
      };
      operation.responses['500'] ??= {
        description: 'An unexpected failure was safely mapped.',
        content: {
          'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } },
        },
      };
      for (const response of Object.values(operation.responses)) {
        if (response === undefined) continue;
        if ('$ref' in response) continue;
        response.headers = { ...responseHeaders, ...response.headers };
      }
    }
  }
  return document;
}

export function configureOpenApi(app: NestFastifyApplication): OpenAPIObject {
  const configuration = new DocumentBuilder()
    .setTitle('DataBreeze Control-Plane API')
    .setDescription('Versioned public system contract and explicitly operational health routes.')
    .setVersion('1.0.0')
    .addGlobalParameters({
      name: 'X-Correlation-Id',
      in: 'header',
      required: false,
      description: 'Optional single bounded UUID; invalid or repeated values fail closed.',
      schema: { format: 'uuid', maxLength: 128, type: 'string' },
    })
    .build();
  const document = addSafetyMetadata(
    SwaggerModule.createDocument(app, configuration, {
      operationIdFactory: (controllerKey, methodKey) => `${controllerKey}.${methodKey}`,
    }),
  );
  SwaggerModule.setup('v1/openapi', app, () => document, {
    jsonDocumentUrl: 'v1/openapi.json',
    raw: ['json'],
    ui: false,
  });
  return document;
}
