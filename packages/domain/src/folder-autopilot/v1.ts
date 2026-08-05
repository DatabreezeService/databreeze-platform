import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** FA-001..FA-019: typed, preview-first folder automation contracts. */
export const FOLDER_AUTOPILOT_SCHEMA_VERSION_V1 = 1 as const;

export type FolderAutopilotActionV1 = 'COPY' | 'MOVE' | 'RENAME' | 'ROUTE';
export type FolderAutopilotRecipeStateV1 = 'DRAFT' | 'PUBLISHED' | 'RETIRED';

export interface FolderAutopilotFilterV1 {
  readonly extensions?: readonly string[];
  readonly prefix?: string;
  readonly maxBytes?: number;
}

export interface FolderAutopilotStepV1 {
  readonly stepId: StableIdentifierV1;
  readonly action: FolderAutopilotActionV1;
  readonly destinationTemplate: string;
  readonly approvalRequired: boolean;
}

export interface FolderAutopilotRecipeV1 {
  readonly schemaVersion: typeof FOLDER_AUTOPILOT_SCHEMA_VERSION_V1;
  readonly recipeId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly version: number;
  readonly name: string;
  readonly filter: FolderAutopilotFilterV1;
  readonly steps: readonly FolderAutopilotStepV1[];
  readonly inputDeviceGrantId: StableIdentifierV1;
  readonly outputDeviceGrantId: StableIdentifierV1;
  readonly capabilityDigest: string;
  readonly recipeHash: string;
  readonly state: FolderAutopilotRecipeStateV1;
}

export interface FolderAutopilotFileV1 {
  readonly fileId: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly contentSha256: string;
}

export interface FolderAutopilotOperationV1 {
  readonly operationId: string;
  readonly fileId: string;
  readonly action: FolderAutopilotActionV1;
  readonly source: string;
  readonly destination: string;
  readonly sourceSha256: string;
  readonly approvalRequired: boolean;
}

export interface FolderAutopilotPreviewV1 {
  readonly schemaVersion: typeof FOLDER_AUTOPILOT_SCHEMA_VERSION_V1;
  readonly planId: string;
  readonly recipeId: StableIdentifierV1;
  readonly recipeVersion: number;
  readonly operations: readonly FolderAutopilotOperationV1[];
  readonly skippedFileIds: readonly string[];
  readonly requiresApproval: boolean;
  readonly planFingerprint: string;
}

export interface FolderAutopilotExecutionV1 {
  readonly status: 'APPLIED' | 'BLOCKED' | 'FAILED';
  readonly files: Readonly<Record<string, FolderAutopilotFileV1>>;
  readonly appliedOperationIds: readonly string[];
  readonly errors: readonly string[];
}

export type FolderAutopilotResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: FolderAutopilotErrorCodeV1 };

export type FolderAutopilotErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TEXT'
  | 'INVALID_HASH'
  | 'INVALID_VERSION'
  | 'INVALID_FILTER'
  | 'INVALID_STEP'
  | 'DUPLICATE_STEP'
  | 'INVALID_BINDING'
  | 'INVALID_FILE';

function rejected(code: FolderAutopilotErrorCodeV1): FolderAutopilotResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function identifier(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function scope(input: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function text(input: unknown, maximum: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maximum) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 ? normalized : undefined;
}

function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input)
    ? input.toLowerCase()
    : undefined;
}

function relativePath(input: unknown): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > 260) return undefined;
  const normalized = input.normalize('NFC').replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return undefined;
  const parts = normalized.split('/');
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) return undefined;
  return normalized;
}

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function renderDestination(template: string, source: string): string | undefined {
  const rendered = template
    .replaceAll('{{name}}', baseName(source))
    .replaceAll('{{stem}}', baseName(source).replace(/\.[^.]+$/u, ''))
    .replaceAll('{{ext}}', extensionOf(source));
  return relativePath(rendered);
}

function stableFingerprint(parts: readonly string[]): string {
  let hashValue = 2166136261;
  const input = parts.join('|');
  for (let index = 0; index < input.length; index += 1) {
    hashValue ^= input.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return `fa-${(hashValue >>> 0).toString(16).padStart(8, '0')}`;
}

export function createFolderAutopilotRecipeV1(input: {
  readonly recipeId: unknown;
  readonly tenantScope: unknown;
  readonly version: unknown;
  readonly name: unknown;
  readonly filter: unknown;
  readonly steps: unknown;
  readonly inputDeviceGrantId: unknown;
  readonly outputDeviceGrantId: unknown;
  readonly capabilityDigest: unknown;
  readonly recipeHash: unknown;
}): FolderAutopilotResultV1<FolderAutopilotRecipeV1> {
  const recipeId = identifier(input.recipeId);
  const tenantScope = scope(input.tenantScope);
  const name = text(input.name, 128);
  const inputDeviceGrantId = identifier(input.inputDeviceGrantId);
  const outputDeviceGrantId = identifier(input.outputDeviceGrantId);
  const capabilityDigest = hash(input.capabilityDigest);
  const recipeHash = hash(input.recipeHash);
  if (!recipeId || !inputDeviceGrantId || !outputDeviceGrantId)
    return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!name) return rejected('INVALID_TEXT');
  if (!Number.isSafeInteger(input.version) || (input.version as number) < 1)
    return rejected('INVALID_VERSION');
  if (!capabilityDigest || !recipeHash) return rejected('INVALID_HASH');
  if (!input.filter || typeof input.filter !== 'object' || Array.isArray(input.filter))
    return rejected('INVALID_FILTER');
  const rawFilter = input.filter as Record<string, unknown>;
  const extensions = rawFilter['extensions'];
  const prefix = rawFilter['prefix'] === undefined ? undefined : relativePath(rawFilter['prefix']);
  const maxBytes = rawFilter['maxBytes'];
  if (
    extensions !== undefined &&
    (!Array.isArray(extensions) ||
      extensions.length > 64 ||
      extensions.some((value) => !text(value, 16)))
  )
    return rejected('INVALID_FILTER');
  if (rawFilter['prefix'] !== undefined && !prefix) return rejected('INVALID_FILTER');
  if (
    maxBytes !== undefined &&
    (typeof maxBytes !== 'number' || !Number.isSafeInteger(maxBytes) || maxBytes < 0)
  )
    return rejected('INVALID_FILTER');
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > 64)
    return rejected('INVALID_STEP');
  const steps: FolderAutopilotStepV1[] = [];
  const stepIds = new Set<string>();
  for (const candidate of input.steps) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      return rejected('INVALID_STEP');
    const record = candidate as Record<string, unknown>;
    const stepId = identifier(record['stepId']);
    const action = record['action'];
    const destinationTemplate = text(record['destinationTemplate'], 260);
    if (!stepId || !destinationTemplate) return rejected('INVALID_STEP');
    if (stepIds.has(stepId)) return rejected('DUPLICATE_STEP');
    if (action !== 'COPY' && action !== 'MOVE' && action !== 'RENAME' && action !== 'ROUTE')
      return rejected('INVALID_STEP');
    if (!renderDestination(destinationTemplate, 'sample.xlsx')) return rejected('INVALID_STEP');
    stepIds.add(stepId);
    steps.push(
      Object.freeze({
        stepId,
        action,
        destinationTemplate,
        approvalRequired: record['approvalRequired'] === true,
      }),
    );
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: FOLDER_AUTOPILOT_SCHEMA_VERSION_V1,
      recipeId,
      tenantScope,
      version: input.version as number,
      name,
      filter: Object.freeze({
        ...(extensions === undefined
          ? {}
          : {
              extensions: Object.freeze(
                (extensions as string[]).map((value) => value.replace(/^\./u, '').toLowerCase()),
              ),
            }),
        ...(prefix === undefined ? {} : { prefix }),
        ...(maxBytes === undefined ? {} : { maxBytes }),
      }),
      steps: Object.freeze(steps),
      inputDeviceGrantId,
      outputDeviceGrantId,
      capabilityDigest,
      recipeHash,
      state: 'DRAFT',
    }),
  });
}

export function previewFolderAutopilotRecipeV1(
  recipe: FolderAutopilotRecipeV1,
  files: readonly FolderAutopilotFileV1[],
): FolderAutopilotResultV1<FolderAutopilotPreviewV1> {
  const operations: FolderAutopilotOperationV1[] = [];
  const skippedFileIds: string[] = [];
  for (const file of files) {
    if (
      !text(file.fileId, 128) ||
      !relativePath(file.relativePath) ||
      !hash(file.contentSha256) ||
      !Number.isSafeInteger(file.sizeBytes) ||
      file.sizeBytes < 0
    )
      return rejected('INVALID_FILE');
    const extension = extensionOf(file.relativePath);
    const allowedExtensions = recipe.filter.extensions;
    if (recipe.filter.prefix && !file.relativePath.startsWith(recipe.filter.prefix)) {
      skippedFileIds.push(file.fileId);
      continue;
    }
    if (recipe.filter.maxBytes !== undefined && file.sizeBytes > recipe.filter.maxBytes) {
      skippedFileIds.push(file.fileId);
      continue;
    }
    if (
      allowedExtensions &&
      allowedExtensions.length > 0 &&
      !allowedExtensions.includes(extension)
    ) {
      skippedFileIds.push(file.fileId);
      continue;
    }
    let source = file.relativePath;
    for (const step of recipe.steps) {
      const destination = renderDestination(step.destinationTemplate, source);
      if (!destination || destination === source) return rejected('INVALID_STEP');
      operations.push(
        Object.freeze({
          operationId: stableFingerprint([
            recipe.recipeId,
            String(recipe.version),
            file.fileId,
            step.stepId,
            source,
            destination,
          ]),
          fileId: file.fileId,
          action: step.action,
          source,
          destination,
          sourceSha256: file.contentSha256,
          approvalRequired: step.approvalRequired,
        }),
      );
      source = destination;
    }
  }
  const planFingerprint = stableFingerprint(
    operations.map(
      (operation) =>
        `${operation.operationId}:${operation.source}:${operation.destination}:${operation.sourceSha256}`,
    ),
  );
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: FOLDER_AUTOPILOT_SCHEMA_VERSION_V1,
      planId: `plan-${planFingerprint}`,
      recipeId: recipe.recipeId,
      recipeVersion: recipe.version,
      operations: Object.freeze(operations),
      skippedFileIds: Object.freeze(skippedFileIds),
      requiresApproval: operations.some((operation) => operation.approvalRequired),
      planFingerprint,
    }),
  });
}

export function applyFolderAutopilotPreviewV1(
  preview: FolderAutopilotPreviewV1,
  currentFiles: Readonly<Record<string, FolderAutopilotFileV1>>,
  options: { readonly approvalGranted?: boolean } = {},
): FolderAutopilotExecutionV1 {
  const clone = (): Record<string, FolderAutopilotFileV1> =>
    Object.fromEntries(
      Object.entries(currentFiles).map(([key, value]) => [key, Object.freeze({ ...value })]),
    );
  if (preview.requiresApproval && options.approvalGranted !== true)
    return Object.freeze({
      status: 'BLOCKED',
      files: clone(),
      appliedOperationIds: [],
      errors: ['APPROVAL_REQUIRED'],
    });
  const errors: string[] = [];
  const simulated = clone();
  for (const operation of preview.operations) {
    const source = simulated[operation.source];
    if (!source) errors.push(`SOURCE_MISSING:${operation.source}`);
    else if (source.contentSha256 !== operation.sourceSha256)
      errors.push(`SOURCE_CHANGED:${operation.source}`);
    if (simulated[operation.destination] && operation.destination !== operation.source)
      errors.push(`DESTINATION_EXISTS:${operation.destination}`);
    if (source && source.contentSha256 === operation.sourceSha256) {
      delete simulated[operation.source];
      simulated[operation.destination] = Object.freeze({
        ...source,
        relativePath: operation.destination,
      });
      if (operation.action === 'COPY' || operation.action === 'ROUTE')
        simulated[operation.source] = source;
    }
  }
  if (errors.length > 0)
    return Object.freeze({
      status: 'FAILED',
      files: clone(),
      appliedOperationIds: [],
      errors: Object.freeze(errors),
    });
  return Object.freeze({
    status: 'APPLIED',
    files: Object.freeze(simulated),
    appliedOperationIds: Object.freeze(
      preview.operations.map((operation) => operation.operationId),
    ),
    errors: [],
  });
}
