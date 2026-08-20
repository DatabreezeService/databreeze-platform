import identifierContract from '@databreeze/contracts/v1/identifier' with { type: 'json' };
import problemDetailsContract from '@databreeze/contracts/v1/problem-details' with { type: 'json' };
import revisionContract from '@databreeze/contracts/v1/revision' with { type: 'json' };
import utcTimestampContract from '@databreeze/contracts/v1/utc-timestamp' with { type: 'json' };
import authoringCommandContract from '@databreeze/contracts/v3/dda-dashboard-authoring-command' with { type: 'json' };
import authoringCommandResultContract from '@databreeze/contracts/v3/dda-dashboard-authoring-command-result' with { type: 'json' };
import chartProposalContract from '@databreeze/contracts/v3/dda-dashboard-chart-proposal' with { type: 'json' };
import workspaceHistoryContract from '@databreeze/contracts/v3/dda-dashboard-workspace-history' with { type: 'json' };
import notificationContract from '@databreeze/contracts/v3/dda-notification' with { type: 'json' };
import notificationPageContract from '@databreeze/contracts/v3/dda-notification-page' with { type: 'json' };
import notificationStateCommandContract from '@databreeze/contracts/v3/dda-notification-state-command' with { type: 'json' };
import workspaceMemberSettingsContract from '@databreeze/contracts/v3/dda-workspace-member-settings' with { type: 'json' };
import notificationPreferencesCommandContract from '@databreeze/contracts/v4/dda-notification-preferences-command' with { type: 'json' };
import notificationPreferencesAcceptedContract from '@databreeze/contracts/v4/dda-notification-preferences-accepted' with { type: 'json' };
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

const contractReferences: Readonly<Record<string, string>> = {
  'https://schemas.databreeze.dev/contracts/v1/identifier': '#/components/schemas/Identifier',
  'https://schemas.databreeze.dev/contracts/v1/revision': '#/components/schemas/Revision',
  'https://schemas.databreeze.dev/contracts/v1/utc-timestamp': '#/components/schemas/UtcTimestamp',
  'https://schemas.databreeze.dev/contracts/v3/dda-dashboard-authoring-command':
    '#/components/schemas/DdaDashboardAuthoringCommand',
  'https://schemas.databreeze.dev/contracts/v3/dda-dashboard-authoring-command-result':
    '#/components/schemas/DdaDashboardAuthoringCommandResult',
  'https://schemas.databreeze.dev/contracts/v3/dda-dashboard-chart-proposal':
    '#/components/schemas/DdaDashboardChartProposal',
  'https://schemas.databreeze.dev/contracts/v3/dda-dashboard-workspace-history':
    '#/components/schemas/DdaDashboardWorkspaceHistory',
  'https://schemas.databreeze.dev/contracts/v3/dda-notification':
    '#/components/schemas/DdaNotification',
  'https://schemas.databreeze.dev/contracts/v3/dda-notification-page':
    '#/components/schemas/DdaNotificationPage',
  'https://schemas.databreeze.dev/contracts/v3/dda-notification-state-command':
    '#/components/schemas/DdaNotificationStateCommand',
  'https://schemas.databreeze.dev/contracts/v3/dda-workspace-member-settings':
    '#/components/schemas/DdaWorkspaceMemberSettings',
  'https://schemas.databreeze.dev/contracts/v4/dda-notification-preferences-command':
    '#/components/schemas/DdaNotificationPreferencesCommand',
  'https://schemas.databreeze.dev/contracts/v4/dda-notification-preferences-accepted':
    '#/components/schemas/DdaNotificationPreferencesAccepted',
};

function safeContractSchema(contract: object): Record<string, unknown> {
  const schema = structuredClone(contract) as Record<string, unknown>;
  delete schema['$schema'];
  delete schema['$id'];
  delete schema['$comment'];
  return schema;
}

function localizeContractReferences(value: unknown, componentName?: string): void {
  if (Array.isArray(value)) {
    for (const entry of value) localizeContractReferences(entry, componentName);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const record = value as Record<string, unknown>;
  if (typeof record['$ref'] === 'string') {
    const reference = record['$ref'];
    record['$ref'] =
      contractReferences[reference] ??
      (componentName !== undefined && reference.startsWith('#/$defs/')
        ? `#/components/schemas/${componentName}${reference.slice(1)}`
        : reference);
  }
  for (const entry of Object.values(record)) localizeContractReferences(entry, componentName);
}

function safeProblemSchema(): Record<string, unknown> {
  const schema = safeContractSchema(problemDetailsContract);
  localizeContractReferences(schema);
  return schema;
}

function safeGeneratedContractSchema(
  componentName: string,
  contract: object,
): Record<string, unknown> {
  const schema = safeContractSchema(contract);
  localizeContractReferences(schema, componentName);
  return schema;
}

function addSafetyMetadata(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas['Identifier'] = safeContractSchema(identifierContract);
  document.components.schemas['Revision'] = safeContractSchema(revisionContract);
  document.components.schemas['UtcTimestamp'] = safeContractSchema(utcTimestampContract);
  document.components.schemas['ProblemDetails'] = safeProblemSchema();
  document.components.schemas['DdaDashboardAuthoringCommand'] = safeGeneratedContractSchema(
    'DdaDashboardAuthoringCommand',
    authoringCommandContract,
  );
  document.components.schemas['DdaDashboardAuthoringCommandResult'] = safeGeneratedContractSchema(
    'DdaDashboardAuthoringCommandResult',
    authoringCommandResultContract,
  );
  document.components.schemas['DdaDashboardChartProposal'] = safeGeneratedContractSchema(
    'DdaDashboardChartProposal',
    chartProposalContract,
  );
  document.components.schemas['DdaDashboardWorkspaceHistory'] = safeGeneratedContractSchema(
    'DdaDashboardWorkspaceHistory',
    workspaceHistoryContract,
  );
  document.components.schemas['DdaNotification'] = safeGeneratedContractSchema(
    'DdaNotification',
    notificationContract,
  );
  document.components.schemas['DdaNotificationPage'] = safeGeneratedContractSchema(
    'DdaNotificationPage',
    notificationPageContract,
  );
  document.components.schemas['DdaNotificationStateCommand'] = safeGeneratedContractSchema(
    'DdaNotificationStateCommand',
    notificationStateCommandContract,
  );
  document.components.schemas['DdaWorkspaceMemberSettings'] = safeGeneratedContractSchema(
    'DdaWorkspaceMemberSettings',
    workspaceMemberSettingsContract,
  );
  document.components.schemas['DdaNotificationPreferencesCommand'] = safeGeneratedContractSchema(
    'DdaNotificationPreferencesCommand',
    notificationPreferencesCommandContract,
  );
  document.components.schemas['DdaNotificationPreferencesAccepted'] = safeGeneratedContractSchema(
    'DdaNotificationPreferencesAccepted',
    notificationPreferencesAcceptedContract,
  );
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
    .setOpenAPIVersion('3.1.0')
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
  (document as OpenAPIObject & { jsonSchemaDialect: string }).jsonSchemaDialect =
    'https://json-schema.org/draft/2020-12/schema';
  SwaggerModule.setup('v1/openapi', app, () => document, {
    jsonDocumentUrl: 'v1/openapi.json',
    raw: ['json'],
    ui: false,
  });
  return document;
}
