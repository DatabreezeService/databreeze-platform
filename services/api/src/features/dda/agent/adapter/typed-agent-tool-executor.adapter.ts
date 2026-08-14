import type { DdaDashboardAuthoringCommand } from '@databreeze/contracts/v3';
import {
  AGENT_LEVEL_ORDER_V1,
  isMembershipAccessPresetV1,
  type AgentGrantLevelV1,
} from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  AgentAuthorityDecisionV1,
  AgentToolExecutorInputV1,
  AgentToolExecutorPortV1,
  AgentIamActionAuthorizationPortV1,
} from '../application/agent-runtime.port.js';
import { FailClosedAgentIamActionAuthorizationAdapter } from '../application/agent-runtime.port.js';
import {
  canonicalAgentInputFingerprintV1,
  FailClosedAgentConsequentialCommandAdapter,
  type AgentConsequentialCommandPortV1,
} from '../application/agent-consequential-command.port.js';
import type {
  AgentToolDescriptorV1,
  AgentToolExecutionResultV1,
  AgentTurnProblemCodeV1,
} from '../application/agent-tool.types.js';
import {
  UnavailableAgentAnalysisPlanInputPortV1,
  UnavailableAgentAnalysisPlanResolverPortV1,
  UnavailableAgentDatasetReaderPortV1,
  UnavailableAgentDashboardPreviewPortV1,
  UnavailableAgentDashboardValuePortV1,
  UnavailableAgentEvidenceResolverPortV1,
  UnavailableAgentEtlCorrectionPortV1,
  UnavailableAgentSourceOpenPortV1,
  type TypedAgentToolExecutorDependenciesV1,
} from '../application/typed-agent-tool-executor-dependencies.port.js';

const INPUT_FORBIDDEN_KEYS = new Set([
  'accessToken',
  'apiKey',
  'authToken',
  'authorization',
  'authorized',
  'code',
  'command',
  'credentials',
  'credential',
  'connectionString',
  'databaseUrl',
  'databaseClient',
  'generatedCode',
  'generatedSql',
  'absolutePath',
  'filePath',
  'localPath',
  'localFilePath',
  'originalPath',
  'sourcePath',
  'fileSystemPath',
  'numericValues',
  'password',
  'path',
  'query',
  'rawQuery',
  'resultCells',
  'resultValues',
  'secret',
  'secretKey',
  'sql',
  'storageCredential',
  'tenantScope',
  'token',
  'url',
  'uri',
]);

const OUTPUT_FORBIDDEN_KEYS = new Set([
  'accessToken',
  'apiKey',
  'authToken',
  'authorization',
  'code',
  'credentials',
  'credential',
  'connectionString',
  'databaseUrl',
  'databaseClient',
  'generatedCode',
  'generatedSql',
  'cells',
  'rowValues',
  'rows',
  'numericValue',
  'numericValues',
  'values',
  'absolutePath',
  'filePath',
  'localPath',
  'localFilePath',
  'originalPath',
  'sourcePath',
  'fileSystemPath',
  'password',
  'rawQuery',
  'ocrText',
  'sourceText',
  'tenantId',
  'tenantScope',
  'organizationId',
  'workspaceId',
  'projectId',
  'path',
  'secret',
  'secretKey',
  'sql',
  'storageCredential',
  'token',
  'url',
  'uri',
]);

const BOUNDED_ARRAY_KEYS = new Set([
  'cells',
  'evidenceRefs',
  'options',
  'records',
  'references',
  'rows',
]);

type AuthorizedDecisionResult =
  | {
      readonly accepted: true;
      readonly value: Extract<AgentAuthorityDecisionV1, { readonly allowed: true }>;
    }
  | { readonly accepted: false; readonly code: AgentTurnProblemCodeV1 };

type TimedResult<TValue> =
  | { readonly kind: 'VALUE'; readonly value: TValue }
  | { readonly kind: 'TIMEOUT' }
  | { readonly kind: 'ERROR' };

function rejected(code: AgentTurnProblemCodeV1): AgentToolExecutionResultV1 {
  return Object.freeze({ accepted: false as const, code });
}

function rejectedAuthorization(code: AgentTurnProblemCodeV1): AuthorizedDecisionResult {
  return Object.freeze({ accepted: false as const, code });
}

function accepted(value: unknown): AgentToolExecutionResultV1 {
  return Object.freeze({ accepted: true as const, value });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function validText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    !/\p{Cc}/u.test(value)
  );
}

function validIdentifier(value: unknown): value is string {
  return parseStableIdentifierV1(value).accepted;
}

function validInteger(
  value: unknown,
  minimum = 1,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
  );
}

function sameTenantScope(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right) || left['scopeType'] !== right['scopeType']) {
    return false;
  }
  for (const key of ['organizationId', 'workspaceId', 'projectId'] as const) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

function validContext(context: IamTenantContextV1): boolean {
  if (!isRecord(context)) return false;
  const scope = parseTenantScopeV1(context.tenantScope);
  return (
    scope.accepted &&
    validIdentifier(context.actorId) &&
    validIdentifier(context.correlationId) &&
    typeof context.idempotencyKey === 'string' &&
    validText(context.idempotencyKey, 200) &&
    validInteger(context.authorizationEpoch) &&
    context.mfaReenrollmentRequired === false
  );
}

function containsForbiddenKey(
  value: unknown,
  forbidden: ReadonlySet<string>,
  depth = 0,
  active = new WeakSet<object>(),
): boolean {
  if (depth > 8) return true;
  if (typeof value !== 'object' || value === null) return false;
  if (active.has(value)) return true;
  active.add(value);
  try {
    if (Array.isArray(value)) {
      return value.some((item) => containsForbiddenKey(item, forbidden, depth + 1, active));
    }
    for (const key of Object.keys(value)) {
      const lowerKey = key.toLowerCase();
      if (
        forbidden.has(key) ||
        forbidden.has(lowerKey) ||
        [...forbidden].some((candidate) => candidate.toLowerCase() === lowerKey)
      ) {
        return true;
      }
      if (
        containsForbiddenKey((value as Record<string, unknown>)[key], forbidden, depth + 1, active)
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  } finally {
    active.delete(value);
  }
}

function validateParameters(
  value: unknown,
): value is Readonly<Record<string, string | number | boolean>> {
  if (!isRecord(value) || Object.keys(value).length > 32) return false;
  return Object.entries(value).every(([key, item]) => {
    if (!validText(key, 96)) return false;
    if (typeof item === 'string') return validText(item, 256);
    if (typeof item === 'boolean') return true;
    return typeof item === 'number' && Number.isFinite(item) && Number.isSafeInteger(item);
  });
}

function validateToolInput(
  descriptor: AgentToolDescriptorV1,
  input: unknown,
): AgentTurnProblemCodeV1 | undefined {
  if (!isRecord(input)) return 'MALFORMED_TOOL_CALL';
  if (containsForbiddenKey(input, INPUT_FORBIDDEN_KEYS)) return 'MALFORMED_TOOL_CALL';

  const allowedKeys = new Set(descriptor.inputSchema.properties);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) return 'MALFORMED_TOOL_CALL';
  if (descriptor.inputSchema.requiredProperties.some((key) => !hasOwn(input, key))) {
    return descriptor.requiresUserConfirmation
      ? 'UNCONFIRMED_DASHBOARD_APPLY'
      : 'MALFORMED_TOOL_CALL';
  }

  switch (descriptor.name) {
    case 'dataset.describe':
      return validIdentifier(input['datasetId']) && Object.keys(input).length === 1
        ? undefined
        : 'MALFORMED_TOOL_CALL';
    case 'dataset.sample': {
      if (!validIdentifier(input['datasetId'])) return 'MALFORMED_TOOL_CALL';
      if (hasOwn(input, 'limit') && !validInteger(input['limit'], 0, 50)) {
        return typeof input['limit'] === 'number' &&
          Number.isSafeInteger(input['limit']) &&
          input['limit'] > 50
          ? 'OVER_BOUND_SAMPLE'
          : 'MALFORMED_TOOL_CALL';
      }
      if (
        hasOwn(input, 'columns') &&
        (!Array.isArray(input['columns']) ||
          input['columns'].length > 64 ||
          input['columns'].some((column) => !validText(column, 96)))
      ) {
        return 'MALFORMED_TOOL_CALL';
      }
      return undefined;
    }
    case 'analysis.plan':
      return validIdentifier(input['datasetId']) && validText(input['question'], 4_000)
        ? undefined
        : 'MALFORMED_TOOL_CALL';
    case 'analysis.execute':
      if (
        !validIdentifier(input['planId']) ||
        !validIdentifier(input['datasetId']) ||
        !validIdentifier(input['datasetVersionId'])
      ) {
        return 'MALFORMED_TOOL_CALL';
      }
      if (hasOwn(input, 'parameters') && !validateParameters(input['parameters'])) {
        return 'MALFORMED_TOOL_CALL';
      }
      return undefined;
    case 'dashboard.propose':
      if (!validIdentifier(input['dashboardId']) || !validText(input['question'], 4_000)) {
        return 'MALFORMED_TOOL_CALL';
      }
      for (const key of ['analysisPlanVersionId', 'targetPageId', 'targetWidgetId']) {
        if (hasOwn(input, key) && !validIdentifier(input[key])) return 'MALFORMED_TOOL_CALL';
      }
      return undefined;
    case 'dashboard.applyConfirmed':
      if (
        !validIdentifier(input['previewCommandId']) ||
        input['userConfirmation'] !== true ||
        !validInteger(input['expectedVersion']) ||
        !validInteger(input['revision']) ||
        !validText(input['idempotencyKey'], 200)
      ) {
        return input['userConfirmation'] !== true
          ? 'UNCONFIRMED_DASHBOARD_APPLY'
          : 'MALFORMED_TOOL_CALL';
      }
      return undefined;
    case 'dashboard.explainValue':
      if (!validIdentifier(input['dashboardId']) || !validIdentifier(input['widgetId'])) {
        return 'MALFORMED_TOOL_CALL';
      }
      return hasOwn(input, 'cellId') && !validIdentifier(input['cellId'])
        ? 'MALFORMED_TOOL_CALL'
        : undefined;
    case 'evidence.resolve':
      return validIdentifier(input['evidenceId']) ? undefined : 'MALFORMED_TOOL_CALL';
    case 'source.open':
      return validIdentifier(input['sourceId']) ? undefined : 'MALFORMED_TOOL_CALL';
    case 'etl.proposeCorrection':
      return validIdentifier(input['datasetId']) &&
        validIdentifier(input['issueId']) &&
        validText(input['correction'], 4_000)
        ? undefined
        : 'MALFORMED_TOOL_CALL';
    default:
      return 'UNKNOWN_TOOL';
  }
}

function mapDependencyFailure(code: unknown): AgentTurnProblemCodeV1 {
  if (code === 'UNAUTHORIZED' || code === 'UNAUTHORIZED_DATA') return 'UNAUTHORIZED';
  if (code === 'NOT_FOUND') return 'UNAUTHORIZED';
  if (code === 'STALE_INPUT' || code === 'REVISION_CONFLICT' || code === 'COMMAND_CONFLICT') {
    return 'STALE_CONTEXT';
  }
  return 'PROVIDER_FAILURE';
}

function normalizeDependencyResult(
  value: unknown,
):
  | { readonly accepted: true; readonly value: unknown }
  | { readonly accepted: false; readonly code: AgentTurnProblemCodeV1 } {
  if (isRecord(value) && typeof value['accepted'] === 'boolean') {
    if (value['accepted'] === true) return { accepted: true, value: value['value'] };
    return { accepted: false, code: mapDependencyFailure(value['code']) };
  }
  return { accepted: true, value };
}

function byteLength(value: unknown): number | undefined {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : Buffer.byteLength(serialized, 'utf8');
  } catch {
    return undefined;
  }
}

function hasOverBoundArray(value: unknown, maximumRows: number, depth = 0): boolean {
  if (depth > 8 || typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasOverBoundArray(item, maximumRows, depth + 1));
  }
  try {
    return Object.entries(value).some(([key, child]) => {
      if (BOUNDED_ARRAY_KEYS.has(key) && Array.isArray(child) && child.length > maximumRows) {
        return true;
      }
      return hasOverBoundArray(child, maximumRows, depth + 1);
    });
  } catch {
    return true;
  }
}

function validOutput(value: unknown, descriptor: AgentToolDescriptorV1): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, descriptor.outputSchema.properties) &&
    descriptor.outputSchema.requiredProperties.every((key) => hasOwn(value, key)) &&
    !containsForbiddenKey(value, OUTPUT_FORBIDDEN_KEYS) &&
    validOpaqueReferences(value) &&
    !hasUnsafeOutputText(value) &&
    !hasOverBoundArray(value, descriptor.maximumRows) &&
    (byteLength(value) ?? Number.MAX_SAFE_INTEGER) <= descriptor.maximumBytes
  );
}

function validOpaqueReferences(value: unknown, depth = 0): boolean {
  if (depth > 8 || typeof value !== 'object' || value === null) return depth <= 8;
  if (Array.isArray(value)) return value.every((item) => validOpaqueReferences(item, depth + 1));
  return Object.entries(value).every(([key, child]) => {
    if (key.toLowerCase().endsWith('id') && !validIdentifier(child)) return false;
    if (key.toLowerCase().endsWith('ids')) {
      if (!Array.isArray(child) || child.some((item) => !validIdentifier(item))) return false;
    }
    return validOpaqueReferences(child, depth + 1);
  });
}

function hasUnsafeOutputString(value: string): boolean {
  return (
    /(?:^|\b)(?:sk|pk|rk)-[a-z0-9_-]{8,}/iu.test(value) ||
    /(?:[a-z]:\\|\\\\|\/private\/|\/Users\/|\/home\/)/u.test(value)
  );
}

function hasUnsafeOutputText(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return hasUnsafeOutputString(value);
  if (depth > 8 || typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some((item) => hasUnsafeOutputText(item, depth + 1));
  return Object.values(value).some((child) => {
    return hasUnsafeOutputText(child, depth + 1);
  });
}

function safeEvidenceRefs(value: unknown): readonly Record<string, unknown>[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 24) return undefined;
  const result: Record<string, unknown>[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      if (!validIdentifier(item)) return undefined;
      result.push({ evidenceId: item, kind: 'RESULT_CELL' });
      continue;
    }
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ['evidenceId', 'kind']) ||
      !validIdentifier(item['evidenceId']) ||
      (item['kind'] !== 'RESULT_CELL' && item['kind'] !== 'SOURCE' && item['kind'] !== 'EXTRACTION')
    ) {
      return undefined;
    }
    result.push({ evidenceId: item['evidenceId'], kind: item['kind'] });
  }
  return Object.freeze(result);
}

function safeSchema(value: unknown): readonly Record<string, string>[] | undefined {
  if (!Array.isArray(value) || value.length > 256) return undefined;
  const result: Record<string, string>[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ['field', 'type']) ||
      !validText(item['field'], 128) ||
      !validText(item['type'], 64)
    ) {
      return undefined;
    }
    result.push({ field: item['field'], type: item['type'] });
  }
  return Object.freeze(result);
}

function safeText(value: unknown, maximum: number): string | undefined {
  return validText(value, maximum) ? value : undefined;
}

function safeReference(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(value) || Object.keys(value).length > 8) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase().endsWith('id')) {
      if (!validIdentifier(child)) return undefined;
      result[key] = child;
      continue;
    }
    if (key === 'kind') {
      if (!validText(child, 64)) return undefined;
      result[key] = child;
      continue;
    }
    return undefined;
  }
  return Object.freeze(result);
}

function safeOptions(value: unknown): readonly Record<string, unknown>[] | undefined {
  if (!Array.isArray(value) || value.length > 4) return undefined;
  const result: Record<string, unknown>[] = [];
  for (const item of value) {
    if (!isRecord(item) || !validIdentifier(item['optionId'])) return undefined;
    const option: Record<string, unknown> = { optionId: item['optionId'] };
    if (item['title'] !== undefined) {
      const title = safeText(item['title'], 256);
      if (title === undefined) return undefined;
      option['title'] = title;
    }
    result.push(option);
  }
  return Object.freeze(result);
}

function validInternalAnalysisCells(value: unknown, maximumRows: number): boolean {
  if (!Array.isArray(value) || value.length > maximumRows) return false;
  const allowedKeys = new Set([
    'cellId',
    'field',
    'value',
    'unit',
    'planVersionId',
    'metricVersionId',
  ]);
  return value.every((cell) => {
    if (!isRecord(cell) || !hasOnlyKeys(cell, [...allowedKeys])) return false;
    if (!validIdentifier(cell['cellId']) || !validText(cell['field'], 128)) return false;
    if (cell['unit'] !== undefined && !validText(cell['unit'], 64)) return false;
    if (cell['planVersionId'] !== undefined && !validIdentifier(cell['planVersionId'])) {
      return false;
    }
    if (cell['metricVersionId'] !== undefined && !validIdentifier(cell['metricVersionId'])) {
      return false;
    }
    const cellValue = cell['value'];
    return (
      cellValue === null ||
      typeof cellValue === 'boolean' ||
      (typeof cellValue === 'number' && Number.isFinite(cellValue)) ||
      (typeof cellValue === 'string' &&
        validText(cellValue, 256) &&
        !hasUnsafeOutputString(cellValue))
    );
  });
}

function allowedInternalOutputKeys(descriptor: AgentToolDescriptorV1): readonly string[] {
  switch (descriptor.name) {
    case 'dataset.describe':
      return ['datasetId', 'schema', 'evidenceRefs'];
    case 'dataset.sample':
      return ['datasetId', 'sampleId', 'resultId', 'columns', 'evidenceRefs'];
    case 'analysis.plan':
      return ['plan', 'planId', 'planVersionId', 'datasetVersionId', 'preview', 'evidenceRefs'];
    case 'analysis.execute':
      return ['resultId', 'cells', 'evidenceRefs', 'provenance'];
    case 'dashboard.propose':
      return ['proposalId', 'options', 'evidenceRefs', 'previewOnly', 'publishes'];
    case 'dashboard.applyConfirmed':
      return ['commandId', 'revision', 'evidenceRefs', 'publishes'];
    case 'dashboard.explainValue':
      return ['explanation', 'evidenceRefs'];
    case 'evidence.resolve':
      return ['evidenceId', 'kind', 'reference'];
    case 'source.open':
      return ['sourceId', 'kind', 'iaeContentReferenceId', 'evidenceRefs', 'view', 'localPath'];
    case 'etl.proposeCorrection':
      return ['proposalId', 'state', 'evidenceRefs', 'plan'];
    default:
      return [];
  }
}

function normalizeToolOutput(
  descriptor: AgentToolDescriptorV1,
  input: Readonly<Record<string, unknown>>,
  value: unknown,
): unknown {
  if (!isRecord(value)) return undefined;
  if (!hasOnlyKeys(value, allowedInternalOutputKeys(descriptor))) return undefined;
  const valueForForbiddenKeyCheck =
    descriptor.name === 'analysis.execute'
      ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'cells'))
      : descriptor.name === 'source.open'
        ? Object.fromEntries(
            Object.entries(value).filter(
              ([key]) => !['localPath', 'path', 'filePath', 'view'].includes(key),
            ),
          )
        : value;
  if (containsForbiddenKey(valueForForbiddenKeyCheck, OUTPUT_FORBIDDEN_KEYS)) return undefined;
  const evidenceRefs = safeEvidenceRefs(value['evidenceRefs']);
  switch (descriptor.name) {
    case 'dataset.describe': {
      const schema = safeSchema(value['schema']);
      return validIdentifier(input['datasetId']) && schema && evidenceRefs
        ? { datasetId: input['datasetId'], schema, evidenceRefs }
        : undefined;
    }
    case 'dataset.sample': {
      const sampleId = value['sampleId'] ?? value['resultId'];
      const columns = value['columns'] ?? input['columns'] ?? [];
      return validIdentifier(input['datasetId']) &&
        validIdentifier(sampleId) &&
        Array.isArray(columns) &&
        columns.every((column) => validText(column, 128)) &&
        evidenceRefs
        ? {
            datasetId: input['datasetId'],
            sampleId,
            columns: Object.freeze([...columns]),
            evidenceRefs,
          }
        : undefined;
    }
    case 'analysis.plan': {
      const plan = isRecord(value['plan']) ? value['plan'] : value;
      const planId = plan['planId'] ?? value['planId'];
      const planVersionId = plan['planVersionId'] ?? value['planVersionId'];
      const datasetVersionId = plan['datasetVersionId'] ?? value['datasetVersionId'];
      return validIdentifier(planId) &&
        validIdentifier(planVersionId) &&
        validIdentifier(input['datasetId']) &&
        validIdentifier(datasetVersionId) &&
        evidenceRefs
        ? {
            planId,
            planVersionId,
            datasetId: input['datasetId'],
            datasetVersionId,
            preview: { available: true },
            evidenceRefs,
          }
        : undefined;
    }
    case 'analysis.execute': {
      const resultId = value['resultId'];
      const provenance = value['provenance'];
      if (!validIdentifier(resultId) || !isRecord(provenance) || !evidenceRefs) return undefined;
      if (
        !validIdentifier(provenance['planVersionId']) ||
        !validIdentifier(provenance['datasetVersionId']) ||
        !validText(provenance['engineVersion'], 128)
      ) {
        return undefined;
      }
      return {
        resultId,
        evidenceRefs,
        provenance: {
          planVersionId: provenance['planVersionId'],
          datasetVersionId: provenance['datasetVersionId'],
          engineVersion: provenance['engineVersion'],
        },
      };
    }
    case 'dashboard.propose': {
      const proposalId = value['proposalId'];
      const options = safeOptions(value['options']);
      return validIdentifier(proposalId) && options && evidenceRefs
        ? { proposalId, options, evidenceRefs }
        : undefined;
    }
    case 'dashboard.applyConfirmed':
      return validIdentifier(value['commandId']) && validInteger(value['revision']) && evidenceRefs
        ? { commandId: value['commandId'], revision: value['revision'], evidenceRefs }
        : undefined;
    case 'dashboard.explainValue': {
      const explanation = safeText(value['explanation'], 4_000);
      return explanation !== undefined && evidenceRefs ? { explanation, evidenceRefs } : undefined;
    }
    case 'evidence.resolve': {
      const reference = safeReference(value['reference']);
      return value['evidenceId'] === input['evidenceId'] &&
        validIdentifier(value['evidenceId']) &&
        validText(value['kind'], 64) &&
        reference !== undefined
        ? { evidenceId: value['evidenceId'], kind: value['kind'], reference }
        : undefined;
    }
    case 'source.open':
      return value['sourceId'] === input['sourceId'] &&
        validIdentifier(value['sourceId']) &&
        validText(value['kind'], 64) &&
        (value['iaeContentReferenceId'] === undefined ||
          validIdentifier(value['iaeContentReferenceId'])) &&
        evidenceRefs
        ? {
            sourceId: value['sourceId'],
            kind: value['kind'],
            ...(value['iaeContentReferenceId'] === undefined
              ? {}
              : { iaeContentReferenceId: value['iaeContentReferenceId'] }),
            evidenceRefs,
          }
        : undefined;
    case 'etl.proposeCorrection':
      return validIdentifier(value['proposalId']) && validText(value['state'], 64) && evidenceRefs
        ? { proposalId: value['proposalId'], state: value['state'], evidenceRefs }
        : undefined;
    default:
      return undefined;
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === new Set(right).size &&
    left.every((item) => right.includes(item))
  );
}

function authorityLevelAtLeast(left: AgentGrantLevelV1, right: AgentGrantLevelV1): boolean {
  return AGENT_LEVEL_ORDER_V1[left] >= AGENT_LEVEL_ORDER_V1[right];
}

function collectReferenceIds(
  value: unknown,
  output: StableIdentifierV1[] = [],
): readonly StableIdentifierV1[] {
  if (output.length >= 24 || typeof value !== 'object' || value === null) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectReferenceIds(item, output);
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase().endsWith('id') && validIdentifier(child)) {
      const parsed = parseStableIdentifierV1(child);
      if (parsed.accepted && !output.includes(parsed.value)) output.push(parsed.value);
    }
    collectReferenceIds(child, output);
    if (output.length >= 24) break;
  }
  return output;
}

async function withTimeout<TValue>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<TValue>,
): Promise<TimedResult<TValue>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = Promise.resolve()
    .then(() => operation(controller.signal))
    .then(
      (value): TimedResult<TValue> => ({ kind: 'VALUE', value }),
      (): TimedResult<TValue> => ({ kind: 'ERROR' }),
    );
  const timeout = new Promise<TimedResult<TValue>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'TIMEOUT' });
    }, timeoutMs);
  });
  const result = await Promise.race([work, timeout]);
  if (timer !== undefined) clearTimeout(timer);
  return result;
}

function normalizeAnalysisPlan(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  const planValue = isRecord(value['plan']) ? value['plan'] : value;
  const planId = planValue['planId'] ?? value['planId'];
  const planVersionId = planValue['planVersionId'] ?? value['planVersionId'];
  const datasetVersionId = planValue['datasetVersionId'] ?? value['datasetVersionId'];
  const preview = value['preview'] ?? planValue['preview'];
  if (
    !validIdentifier(planId) ||
    !validIdentifier(planVersionId) ||
    !validIdentifier(datasetVersionId) ||
    preview === undefined
  ) {
    return undefined;
  }
  const evidenceRefs: readonly unknown[] = Array.isArray(value['evidenceRefs'])
    ? (value['evidenceRefs'] as readonly unknown[])
    : [];
  return Object.freeze({
    planId,
    planVersionId,
    datasetVersionId,
    preview: true,
    evidenceRefs: Object.freeze([...evidenceRefs]),
  });
}

/**
 * DDA-060: closed, server-owned execution gateway for the ten registered agent tools.
 *
 * The adapter deliberately depends on application services and narrow public ports only. It
 * never receives a database client, a repository, a provider credential, a path, or a model query.
 */
export class TypedAgentToolExecutorAdapter implements AgentToolExecutorPortV1 {
  private readonly deps: TypedAgentToolExecutorDependenciesV1;
  private readonly iamActionAuthorization: AgentIamActionAuthorizationPortV1;
  private readonly consequentialCommand: AgentConsequentialCommandPortV1;

  public constructor(dependencies: TypedAgentToolExecutorDependenciesV1) {
    this.deps = Object.freeze({
      ...dependencies,
      dataset: dependencies.dataset ?? new UnavailableAgentDatasetReaderPortV1(),
      analysisPlanInput:
        dependencies.analysisPlanInput ?? new UnavailableAgentAnalysisPlanInputPortV1(),
      analysisPlanResolver:
        dependencies.analysisPlanResolver ?? new UnavailableAgentAnalysisPlanResolverPortV1(),
      dashboardPreview:
        dependencies.dashboardPreview ?? new UnavailableAgentDashboardPreviewPortV1(),
      dashboardValue: dependencies.dashboardValue ?? new UnavailableAgentDashboardValuePortV1(),
      evidence: dependencies.evidence ?? new UnavailableAgentEvidenceResolverPortV1(),
      source: dependencies.source ?? new UnavailableAgentSourceOpenPortV1(),
      etl: dependencies.etl ?? new UnavailableAgentEtlCorrectionPortV1(),
    });
    this.iamActionAuthorization =
      dependencies.iamActionAuthorization ?? new FailClosedAgentIamActionAuthorizationAdapter();
    this.consequentialCommand =
      dependencies.consequentialCommand ?? new FailClosedAgentConsequentialCommandAdapter();
  }

  public async execute(input: AgentToolExecutorInputV1): Promise<AgentToolExecutionResultV1> {
    try {
      if (
        !isRecord(input) ||
        !validContext(input.context) ||
        !validText(input.correlationId, 200) ||
        !isRecord(input.authority)
      ) {
        return rejected('UNAUTHORIZED');
      }

      const descriptor = input.descriptor;
      if (!isRecord(descriptor)) return rejected('UNAUTHORIZED');
      const resolved = this.deps.registry.resolve(String(descriptor['name']));
      if (!resolved.accepted) return rejected('UNKNOWN_TOOL');
      if (resolved.value !== input.descriptor) return rejected('UNAUTHORIZED');

      const inputProblem = validateToolInput(resolved.value, input.input);
      if (inputProblem !== undefined) return rejected(inputProblem);

      const datasetIds = this.inputDatasetIds(input.input);
      const action = await this.authorizeIamAction(
        input.context,
        resolved.value,
        this.inputResourceIds(input.input),
      );
      if (!action.allowed) return rejected(action.code);
      const authority = await this.reauthorize(input, resolved.value, datasetIds);
      if (!authority.accepted) return authority;

      if (resolved.value.sideEffectClass === 'MUTATION') {
        const committed = await this.consequentialCommand.execute({
          context: input.context,
          descriptor: resolved.value,
          input: input.input,
          idempotencyKey: input.input['idempotencyKey'] as string,
          inputFingerprint: canonicalAgentInputFingerprintV1(input.input),
          correlationId: input.correlationId,
          audit: (outcome) => this.audit(input, resolved.value, outcome),
          perform: () =>
            this.dispatchAndValidate(input, resolved.value, input.input, authority.value),
        });
        if (!committed.accepted) return committed;
        return validOutput(committed.value, resolved.value)
          ? committed
          : rejected('PROVIDER_FAILURE');
      }

      if (!(await this.audit(input, resolved.value, 'ATTEMPTED'))) {
        return rejected('PROVIDER_FAILURE');
      }
      const executed = await this.dispatchAndValidate(
        input,
        resolved.value,
        input.input,
        authority.value,
      );
      if (!executed.accepted) return executed;
      if (!(await this.audit(input, resolved.value, 'SUCCEEDED'))) {
        return rejected('PROVIDER_FAILURE');
      }
      return executed;
    } catch {
      return rejected('PROVIDER_FAILURE');
    }
  }

  private inputDatasetIds(input: Readonly<Record<string, unknown>>): readonly string[] {
    const datasetId = input['datasetId'];
    return validIdentifier(datasetId) ? [datasetId] : [];
  }

  private async reauthorize(
    input: AgentToolExecutorInputV1,
    descriptor: AgentToolDescriptorV1,
    datasetIds: readonly string[],
  ): Promise<AuthorizedDecisionResult> {
    const caller = input.authority;
    if (
      caller.allowed !== true ||
      !isMembershipAccessPresetV1(caller.accessPreset) ||
      !Object.prototype.hasOwnProperty.call(caller, 'deniedDatasetIds') ||
      !Array.isArray(caller.deniedDatasetIds) ||
      caller.deniedDatasetIds.some((datasetId) => !validIdentifier(datasetId)) ||
      !Object.prototype.hasOwnProperty.call(AGENT_LEVEL_ORDER_V1, caller.effectiveAgentLevel)
    ) {
      return rejectedAuthorization('UNAUTHORIZED');
    }

    let fresh: AgentAuthorityDecisionV1;
    try {
      fresh = await this.deps.authority.authorize({
        context: input.context,
        descriptor,
        datasetIds,
        input: input.input,
        confirmationPresent:
          descriptor.requiresUserConfirmation && input.input['userConfirmation'] === true,
      });
    } catch {
      return rejectedAuthorization('UNAUTHORIZED');
    }
    if (!fresh.allowed) return rejectedAuthorization(fresh.code);
    if (
      !isMembershipAccessPresetV1(fresh.accessPreset) ||
      !Array.isArray(fresh.deniedDatasetIds) ||
      fresh.deniedDatasetIds.some((datasetId) => !validIdentifier(datasetId)) ||
      !Object.prototype.hasOwnProperty.call(AGENT_LEVEL_ORDER_V1, fresh.effectiveAgentLevel) ||
      !authorityLevelAtLeast(fresh.effectiveAgentLevel, descriptor.requiredAgentLevel) ||
      (fresh.accessPreset === 'VIEWER' && descriptor.sideEffectClass !== 'READ') ||
      !sameStringSet(fresh.deniedDatasetIds, caller.deniedDatasetIds) ||
      fresh.effectiveAgentLevel !== caller.effectiveAgentLevel ||
      fresh.accessPreset !== caller.accessPreset
    ) {
      return rejectedAuthorization('UNAUTHORIZED');
    }

    if (datasetIds.some((datasetId) => fresh.deniedDatasetIds.includes(datasetId))) {
      return rejectedAuthorization('DATASET_RESTRICTED');
    }
    return Object.freeze({ accepted: true, value: fresh });
  }

  private async dispatchAndValidate(
    input: AgentToolExecutorInputV1,
    descriptor: AgentToolDescriptorV1,
    toolInput: Readonly<Record<string, unknown>>,
    authority: Extract<AgentAuthorityDecisionV1, { readonly allowed: true }>,
  ): Promise<AgentToolExecutionResultV1> {
    const executed = await this.dispatch(input.context, descriptor, toolInput, authority);
    if (!executed.accepted) return executed;
    const normalized = normalizeToolOutput(descriptor, toolInput, executed.value);
    if (normalized === undefined || !validOutput(normalized, descriptor)) {
      return rejected('PROVIDER_FAILURE');
    }
    return accepted(normalized);
  }

  private async authorizeIamAction(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    resourceIds: readonly string[],
  ): Promise<
    { readonly allowed: true } | { readonly allowed: false; readonly code: 'UNAUTHORIZED' }
  > {
    try {
      return await this.iamActionAuthorization.authorize({ context, descriptor, resourceIds });
    } catch {
      return Object.freeze({ allowed: false, code: 'UNAUTHORIZED' as const });
    }
  }

  private inputResourceIds(input: Readonly<Record<string, unknown>>): readonly string[] {
    const values: string[] = [];
    for (const [key, value] of Object.entries(input)) {
      if (key === 'idempotencyKey' || key === 'parameters') continue;
      if (key.endsWith('Id') && validIdentifier(value)) values.push(value);
      if (key.endsWith('Ids') && Array.isArray(value)) {
        for (const item of value) if (validIdentifier(item)) values.push(item);
      }
    }
    return Object.freeze([...new Set(values)]);
  }

  private async dispatch(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
    authority: Extract<AgentAuthorityDecisionV1, { readonly allowed: true }>,
  ): Promise<AgentToolExecutionResultV1> {
    switch (descriptor.name) {
      case 'dataset.describe':
        return this.datasetDescribe(context, descriptor, input);
      case 'dataset.sample':
        return this.datasetSample(context, descriptor, input);
      case 'analysis.plan':
        return this.analysisPlan(context, descriptor, input);
      case 'analysis.execute':
        return this.analysisExecute(context, descriptor, input, authority);
      case 'dashboard.propose':
        return this.dashboardPropose(context, descriptor, input);
      case 'dashboard.applyConfirmed':
        return this.dashboardApply(context, descriptor, input, authority);
      case 'dashboard.explainValue':
        return this.dashboardExplainValue(context, descriptor, input);
      case 'evidence.resolve':
        return this.evidenceResolve(context, descriptor, input);
      case 'source.open':
        return this.sourceOpen(context, descriptor, input);
      case 'etl.proposeCorrection':
        return this.etlProposeCorrection(context, descriptor, input);
      default:
        return rejected('UNKNOWN_TOOL');
    }
  }

  private async datasetDescribe(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
  ): Promise<AgentToolExecutionResultV1> {
    return this.callDependency(descriptor, (signal) =>
      this.deps.dataset!.describe({
        context,
        datasetId: input['datasetId'] as string,
        signal,
      }),
    );
  }

  private async datasetSample(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
  ): Promise<AgentToolExecutionResultV1> {
    return this.callDependency(descriptor, (signal) =>
      this.deps.dataset!.sample({
        context,
        datasetId: input['datasetId'] as string,
        limit: (input['limit'] as number | undefined) ?? descriptor.maximumRows,
        columns: (input['columns'] as readonly string[] | undefined) ?? [],
        signal,
      }),
    );
  }

  private async analysisPlan(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
  ): Promise<AgentToolExecutionResultV1> {
    if (!this.deps.analysisPlanInput || !this.deps.analysisProposalService) {
      return rejected('PROVIDER_FAILURE');
    }
    const proposalInput = await this.callDependency(descriptor, (signal) =>
      this.deps.analysisPlanInput!.resolve({
        context,
        datasetId: input['datasetId'] as string,
        question: input['question'] as string,
        signal,
      }),
    );
    if (!proposalInput.accepted) return proposalInput;
    const proposalInputValue = proposalInput.value;
    if (
      !isRecord(proposalInputValue) ||
      containsForbiddenKey(proposalInputValue, INPUT_FORBIDDEN_KEYS)
    ) {
      return rejected('PROVIDER_FAILURE');
    }
    const proposal = await this.callDependency(descriptor, () =>
      this.deps.analysisProposalService!.propose(context, proposalInputValue),
    );
    if (!proposal.accepted) return proposal;
    const normalized = normalizeAnalysisPlan(proposal.value);
    return normalized === undefined ? rejected('PROVIDER_FAILURE') : accepted(normalized);
  }

  private async analysisExecute(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
    authority: Extract<AgentAuthorityDecisionV1, { readonly allowed: true }>,
  ): Promise<AgentToolExecutionResultV1> {
    if (!this.deps.analysisPlanResolver || !this.deps.deterministicResults) {
      return rejected('PROVIDER_FAILURE');
    }
    const resolvedPlan = await this.callDependency(descriptor, (signal) =>
      this.deps.analysisPlanResolver!.resolve({
        context,
        planId: input['planId'] as string,
        signal,
      }),
    );
    if (!resolvedPlan.accepted || !isRecord(resolvedPlan.value)) return resolvedPlan;
    const resolvedBinding = resolvedPlan.value;
    const planValue = resolvedBinding['plan'];
    const logicalDatasetId = resolvedBinding['datasetId'];
    const exactDatasetVersionId = isRecord(planValue) ? planValue['datasetVersionId'] : undefined;
    if (!isRecord(planValue)) return rejected('PROVIDER_FAILURE');
    if (
      !sameTenantScope(planValue['tenantScope'], context.tenantScope) ||
      (planValue['planId'] !== input['planId'] && planValue['planVersionId'] !== input['planId']) ||
      !validIdentifier(logicalDatasetId) ||
      !validIdentifier(exactDatasetVersionId) ||
      planValue['datasetVersionId'] !== exactDatasetVersionId ||
      input['datasetId'] !== logicalDatasetId ||
      input['datasetVersionId'] !== exactDatasetVersionId
    ) {
      return rejected('UNAUTHORIZED');
    }

    const refreshed = await this.reauthorize(
      {
        context,
        descriptor,
        input,
        authority,
        correlationId: context.correlationId,
      },
      descriptor,
      [logicalDatasetId],
    );
    if (!refreshed.accepted) return refreshed;

    const deterministic = await this.callDependency(descriptor, () =>
      this.deps.deterministicResults!.execute({
        plan: planValue as never,
        tenantScope: context.tenantScope,
      }),
    );
    if (!deterministic.accepted || !isRecord(deterministic.value)) return deterministic;
    if (typeof deterministic.value['status'] === 'string') {
      return rejected(mapDependencyFailure(deterministic.value['status']));
    }
    const cells = deterministic.value['cells'];
    const resultId = deterministic.value['resultId'];
    const provenance = deterministic.value['provenance'];
    if (
      !validInternalAnalysisCells(cells, descriptor.maximumRows) ||
      !validIdentifier(resultId) ||
      !isRecord(provenance)
    ) {
      return rejected('PROVIDER_FAILURE');
    }
    if (
      provenance['planVersionId'] !== planValue['planVersionId'] ||
      provenance['datasetVersionId'] !== exactDatasetVersionId
    ) {
      return rejected('PROVIDER_FAILURE');
    }
    return accepted({
      resultId,
      cells,
      evidenceRefs: [],
      provenance,
    });
  }

  private async dashboardPropose(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
  ): Promise<AgentToolExecutionResultV1> {
    if (!this.deps.dashboardProposalService) return rejected('PROVIDER_FAILURE');
    const request: Record<string, unknown> = {
      dashboardId: input['dashboardId'],
      question: input['question'],
      locale: 'vi',
    };
    for (const key of ['analysisPlanVersionId', 'targetPageId', 'targetWidgetId']) {
      if (hasOwn(input, key)) request[key] = input[key];
    }
    const proposal = await this.callDependency(descriptor, () =>
      this.deps.dashboardProposalService!.propose(context, request as never),
    );
    if (!proposal.accepted || !isRecord(proposal.value)) return proposal;
    if (proposal.value['previewOnly'] !== true || proposal.value['publishes'] !== false) {
      return rejected('PROVIDER_FAILURE');
    }
    return accepted(proposal.value);
  }

  private async dashboardApply(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
    authority: Extract<AgentAuthorityDecisionV1, { readonly allowed: true }>,
  ): Promise<AgentToolExecutionResultV1> {
    if (!this.deps.dashboardDraftService) return rejected('PROVIDER_FAILURE');
    const preview = await this.callDependency(descriptor, (signal) =>
      this.deps.dashboardPreview!.resolve({
        context,
        previewCommandId: input['previewCommandId'] as string,
        signal,
      }),
    );
    if (!preview.accepted || !isRecord(preview.value)) return preview;
    const command = preview.value as unknown as Record<string, unknown>;
    if (
      command['previewCommandId'] !== input['previewCommandId'] ||
      command['expectedVersion'] !== input['expectedVersion'] ||
      command['revision'] !== input['revision'] ||
      command['idempotencyKey'] !== input['idempotencyKey'] ||
      !isRecord(command['command'])
    ) {
      return rejected('UNAUTHORIZED');
    }
    const rawDatasetIds = command['datasetIds'];
    if (rawDatasetIds !== undefined && !Array.isArray(rawDatasetIds)) {
      return rejected('PROVIDER_FAILURE');
    }
    const datasetIds = (rawDatasetIds ?? []).filter((id): id is string => validIdentifier(id));
    const rawDatasetIdCount = Array.isArray(rawDatasetIds) ? rawDatasetIds.length : 0;
    if (datasetIds.length !== rawDatasetIdCount) {
      return rejected('PROVIDER_FAILURE');
    }
    if (datasetIds.length > 0) {
      const refreshed = await this.reauthorize(
        {
          context,
          descriptor,
          input,
          authority,
          correlationId: context.correlationId,
        },
        descriptor,
        datasetIds,
      );
      if (!refreshed.accepted) return refreshed;
    }
    const applied = await this.callDependency(descriptor, () =>
      this.deps.dashboardDraftService!.applyAuthoringCommand(
        context,
        command['command'] as DdaDashboardAuthoringCommand,
      ),
    );
    if (!applied.accepted) return applied;
    if (isRecord(applied.value) && applied.value['publishes'] !== false) {
      return rejected('PROVIDER_FAILURE');
    }
    return applied;
  }

  private async dashboardExplainValue(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
  ): Promise<AgentToolExecutionResultV1> {
    return this.callDependency(descriptor, (signal) =>
      this.deps.dashboardValue!.explainValue({
        context,
        dashboardId: input['dashboardId'] as string,
        widgetId: input['widgetId'] as string,
        ...(input['cellId'] === undefined ? {} : { cellId: input['cellId'] as string }),
        signal,
      }),
    );
  }

  private async evidenceResolve(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
  ): Promise<AgentToolExecutionResultV1> {
    return this.callDependency(descriptor, (signal) =>
      this.deps.evidence!.resolve({
        context,
        evidenceId: input['evidenceId'] as string,
        signal,
      }),
    );
  }

  private async sourceOpen(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
  ): Promise<AgentToolExecutionResultV1> {
    return this.callDependency(descriptor, (signal) =>
      this.deps.source!.open({
        context,
        sourceId: input['sourceId'] as string,
        signal,
      }),
    );
  }

  private async etlProposeCorrection(
    context: IamTenantContextV1,
    descriptor: AgentToolDescriptorV1,
    input: Readonly<Record<string, unknown>>,
  ): Promise<AgentToolExecutionResultV1> {
    const proposed = await this.callDependency(descriptor, (signal) =>
      this.deps.etl!.proposeCorrection({
        context,
        datasetId: input['datasetId'] as string,
        issueId: input['issueId'] as string,
        correction: input['correction'] as string,
        signal,
      }),
    );
    if (!proposed.accepted) return proposed;
    if (isRecord(proposed.value) && proposed.value['state'] === 'ACCEPTED') {
      return rejected('PROVIDER_FAILURE');
    }
    return proposed;
  }

  private async callDependency(
    descriptor: AgentToolDescriptorV1,
    operation: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<AgentToolExecutionResultV1> {
    if (descriptor.sideEffectClass === 'MUTATION') {
      try {
        const value = await operation(new AbortController().signal);
        const normalized = normalizeDependencyResult(value);
        return normalized.accepted ? accepted(normalized.value) : rejected(normalized.code);
      } catch {
        return rejected('PROVIDER_FAILURE');
      }
    }
    const timed = await withTimeout(descriptor.timeoutMs, operation);
    if (timed.kind === 'TIMEOUT') return rejected('PROVIDER_TIMEOUT');
    if (timed.kind === 'ERROR') return rejected('PROVIDER_FAILURE');
    const normalized = normalizeDependencyResult(timed.value);
    return normalized.accepted ? accepted(normalized.value) : rejected(normalized.code);
  }

  private async audit(
    input: AgentToolExecutorInputV1,
    descriptor: AgentToolDescriptorV1,
    outcome: 'ATTEMPTED' | 'SUCCEEDED',
  ): Promise<boolean> {
    if (!this.deps.audit) return false;
    if (descriptor.sideEffectClass === 'MUTATION') {
      try {
        await this.deps.audit.emitContentSafeSummary({
          tenantScope: input.context.tenantScope,
          action: `DDA_AGENT_TOOL_${descriptor.name}`,
          outcome,
          correlationId: input.correlationId,
          references: collectReferenceIds(input.input),
        });
        return true;
      } catch {
        return false;
      }
    }
    const timed = await withTimeout(descriptor.timeoutMs, async () => {
      await this.deps.audit!.emitContentSafeSummary({
        tenantScope: input.context.tenantScope,
        action: `DDA_AGENT_TOOL_${descriptor.name}`,
        outcome,
        correlationId: input.correlationId,
        references: collectReferenceIds(input.input),
      });
    });
    return timed.kind === 'VALUE';
  }
}

export {
  TypedAgentToolExecutorAdapter as AgentToolExecutorAdapter,
  TypedAgentToolExecutorAdapter as TypedAgentToolExecutorV1,
};
