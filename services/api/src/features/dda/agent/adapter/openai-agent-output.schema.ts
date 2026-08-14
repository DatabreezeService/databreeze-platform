/** Strict structured output contract for the server-only workspace agent (DDA-043/DDA-060). */

export const OPENAI_AGENT_SCHEMA_NAME = 'dda_workspace_agent_v1';
export const OPENAI_AGENT_SCHEMA_VERSION = 'dda-workspace-agent.v1';
export const OPENAI_AGENT_MAX_NARRATIVE_LENGTH = 8_000;
export const OPENAI_AGENT_MAX_TOOL_CALLS = 8;
export const OPENAI_AGENT_MAX_TOOL_CALL_ID_LENGTH = 128;
export const OPENAI_AGENT_MAX_TOOL_NAME_LENGTH = 64;

/** Stable copy of the closed registry names. The agent service remains authoritative. */
export const OPENAI_AGENT_TOOL_NAMES_V1 = Object.freeze([
  'dataset.describe',
  'dataset.sample',
  'analysis.plan',
  'analysis.execute',
  'dashboard.propose',
  'dashboard.applyConfirmed',
  'dashboard.explainValue',
  'evidence.resolve',
  'source.open',
  'etl.proposeCorrection',
] as const);

export type OpenAiAgentToolNameV1 = (typeof OPENAI_AGENT_TOOL_NAMES_V1)[number];

type JsonSchema = Readonly<Record<string, unknown>>;

const idSchema: JsonSchema = Object.freeze({
  type: 'string',
  minLength: 1,
  maxLength: 256,
});

const textSchema: JsonSchema = Object.freeze({
  type: 'string',
  minLength: 1,
  maxLength: 4_000,
});

const inputPropertySchemas: Readonly<Record<string, JsonSchema>> = Object.freeze({
  datasetId: idSchema,
  datasetVersionId: idSchema,
  planId: idSchema,
  dashboardId: idSchema,
  widgetId: idSchema,
  cellId: idSchema,
  evidenceId: idSchema,
  sourceId: idSchema,
  issueId: idSchema,
  previewCommandId: idSchema,
  analysisPlanVersionId: idSchema,
  targetPageId: idSchema,
  targetWidgetId: idSchema,
  idempotencyKey: idSchema,
  question: textSchema,
  correction: textSchema,
  limit: Object.freeze({ type: 'integer', minimum: 0, maximum: 50 }),
  expectedVersion: Object.freeze({ type: 'integer', minimum: 1, maximum: 1_000_000 }),
  revision: Object.freeze({ type: 'integer', minimum: 1, maximum: 1_000_000 }),
  columns: Object.freeze({
    type: 'array',
    maxItems: 32,
    items: idSchema,
  }),
  parameters: Object.freeze({
    type: 'object',
    additionalProperties: false,
    maxProperties: 8,
    properties: {},
    required: [],
  }),
});

const TOOL_INPUT_DEFINITIONS: ReadonlyArray<{
  readonly name: OpenAiAgentToolNameV1;
  readonly required: readonly string[];
  readonly optional: readonly string[];
}> = Object.freeze([
  { name: 'dataset.describe', required: ['datasetId'], optional: [] },
  { name: 'dataset.sample', required: ['datasetId'], optional: ['limit', 'columns'] },
  { name: 'analysis.plan', required: ['datasetId', 'question'], optional: [] },
  {
    name: 'analysis.execute',
    required: ['planId', 'datasetId', 'datasetVersionId'],
    optional: ['parameters'],
  },
  {
    name: 'dashboard.propose',
    required: ['dashboardId', 'question'],
    optional: ['analysisPlanVersionId', 'targetPageId', 'targetWidgetId'],
  },
  {
    name: 'dashboard.applyConfirmed',
    required: ['previewCommandId', 'expectedVersion', 'revision', 'idempotencyKey'],
    optional: [],
  },
  {
    name: 'dashboard.explainValue',
    required: ['dashboardId', 'widgetId'],
    optional: ['cellId'],
  },
  { name: 'evidence.resolve', required: ['evidenceId'], optional: [] },
  { name: 'source.open', required: ['sourceId'], optional: [] },
  {
    name: 'etl.proposeCorrection',
    required: ['datasetId', 'issueId', 'correction'],
    optional: [],
  },
]);

function inputPropertyVariants(
  required: readonly string[],
  optional: readonly string[],
): readonly (readonly string[])[] {
  let variants: readonly (readonly string[])[] = [Object.freeze([...required])];
  for (const property of optional) {
    variants = Object.freeze([
      ...variants,
      ...variants.map((variant) => Object.freeze([...variant, property])),
    ]);
  }
  return Object.freeze(variants);
}

function inputSchema(properties: readonly string[]): JsonSchema {
  const schemaProperties: Record<string, JsonSchema> = {};
  for (const property of properties) {
    const schema = inputPropertySchemas[property];
    if (schema === undefined) throw new Error(`missing agent input schema: ${property}`);
    schemaProperties[property] = schema;
  }
  return Object.freeze({
    type: 'object',
    additionalProperties: false,
    maxProperties: properties.length,
    properties: Object.freeze(schemaProperties),
    required: Object.freeze([...properties]),
  });
}

export const OPENAI_AGENT_TOOL_INPUT_PROPERTIES_V1: Readonly<
  Record<OpenAiAgentToolNameV1, readonly string[]>
> = Object.freeze(
  Object.fromEntries(
    TOOL_INPUT_DEFINITIONS.map((definition) => [
      definition.name,
      Object.freeze([...definition.required, ...definition.optional]),
    ]),
  ) as Record<OpenAiAgentToolNameV1, readonly string[]>,
);

export const OPENAI_AGENT_TOOL_INPUT_REQUIRED_PROPERTIES_V1: Readonly<
  Record<OpenAiAgentToolNameV1, readonly string[]>
> = Object.freeze(
  Object.fromEntries(
    TOOL_INPUT_DEFINITIONS.map((definition) => [
      definition.name,
      Object.freeze([...definition.required]),
    ]),
  ) as Record<OpenAiAgentToolNameV1, readonly string[]>,
);

const toolCallVariants: readonly JsonSchema[] = Object.freeze(
  TOOL_INPUT_DEFINITIONS.flatMap((definition) =>
    inputPropertyVariants(definition.required, definition.optional).map((properties) =>
      Object.freeze({
        type: 'object',
        additionalProperties: false,
        required: ['toolCallId', 'name', 'input'],
        properties: {
          toolCallId: {
            type: 'string',
            minLength: 1,
            maxLength: OPENAI_AGENT_MAX_TOOL_CALL_ID_LENGTH,
          },
          name: {
            type: 'string',
            maxLength: OPENAI_AGENT_MAX_TOOL_NAME_LENGTH,
            enum: [definition.name],
          },
          input: inputSchema(properties),
        },
      }),
    ),
  ),
);

const toolCallItemSchema: JsonSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['toolCallId', 'name', 'input'],
  properties: {
    toolCallId: {
      type: 'string',
      minLength: 1,
      maxLength: OPENAI_AGENT_MAX_TOOL_CALL_ID_LENGTH,
    },
    name: {
      type: 'string',
      maxLength: OPENAI_AGENT_MAX_TOOL_NAME_LENGTH,
      enum: OPENAI_AGENT_TOOL_NAMES_V1,
    },
    input: {
      anyOf: Object.freeze(
        TOOL_INPUT_DEFINITIONS.flatMap((definition) =>
          inputPropertyVariants(definition.required, definition.optional).map((properties) =>
            inputSchema(properties),
          ),
        ),
      ),
    },
  },
  anyOf: toolCallVariants,
});

export const OPENAI_AGENT_OUTPUT_JSON_SCHEMA: JsonSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['narrative', 'toolCalls'],
  properties: {
    narrative: {
      type: 'string',
      maxLength: OPENAI_AGENT_MAX_NARRATIVE_LENGTH,
    },
    toolCalls: {
      type: 'array',
      maxItems: OPENAI_AGENT_MAX_TOOL_CALLS,
      items: toolCallItemSchema,
    },
  },
});

export function openaiAgentTextFormatV1(): JsonSchema {
  return Object.freeze({
    format: Object.freeze({
      type: 'json_schema',
      name: OPENAI_AGENT_SCHEMA_NAME,
      strict: true,
      schema: OPENAI_AGENT_OUTPUT_JSON_SCHEMA,
    }),
  });
}
