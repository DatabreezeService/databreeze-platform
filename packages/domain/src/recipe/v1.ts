import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';
import type { TypedActionDefinitionV1 } from '../jobs/v1.js';

/** JRA-003, JRA-004, JRA-015, and JRA-030: governed recipes and signed publication envelopes. */
export const RECIPE_SCHEMA_VERSION_V1 = 1 as const;

export type RecipeVersionStateV1 = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export type RecipeTriggerTypeV1 =
  | 'MANUAL'
  | 'SCHEDULE'
  | 'ARTIFACT_CREATED'
  | 'FOLDER_EVENT'
  | 'WEBHOOK'
  | 'APPROVED_API';

export interface RecipeVersionV1 {
  readonly schemaVersion: typeof RECIPE_SCHEMA_VERSION_V1;
  readonly recipeId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly version: number;
  readonly name: string;
  readonly description?: string;
  readonly actionDefinitions: readonly TypedActionDefinitionV1[];
  readonly recipeHash: string;
  readonly state: RecipeVersionStateV1;
  readonly createdAt: StrictUtcTimestampV1;
  readonly publishedAt?: StrictUtcTimestampV1;
}

export interface RecipeTriggerV1 {
  readonly schemaVersion: typeof RECIPE_SCHEMA_VERSION_V1;
  readonly triggerId: StableIdentifierV1;
  readonly recipeId: StableIdentifierV1;
  readonly recipeVersion: number;
  readonly tenantScope: TenantScopeV1;
  readonly triggerType: RecipeTriggerTypeV1;
  readonly deduplicationKey: string;
  readonly authorizationContextHash: string;
  readonly enabled: boolean;
}

export interface RecipePublicationEnvelopeV1 {
  readonly schemaVersion: typeof RECIPE_SCHEMA_VERSION_V1;
  readonly recipeId: StableIdentifierV1;
  readonly recipeVersion: number;
  readonly recipeHash: string;
  readonly actionHandlerDigests: readonly string[];
  readonly actionSchemaIds: readonly string[];
  readonly dsmDefinitionHashes: readonly string[];
  readonly policyReferenceHashes: readonly string[];
  readonly validFrom: StrictUtcTimestampV1;
  readonly validUntil: StrictUtcTimestampV1;
  readonly signerKeyVersion: string;
  readonly signature: string;
}

export type RecipeResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: RecipeErrorCodeV1 };

export type RecipeErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_TEXT'
  | 'INVALID_VERSION'
  | 'INVALID_ACTIONS'
  | 'INVALID_HASH'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_STATE'
  | 'INVALID_TRIGGER'
  | 'INVALID_NUMBER'
  | 'INVALID_ENVELOPE'
  | 'INVALID_WINDOW';

function rejected<TValue>(code: RecipeErrorCodeV1): RecipeResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function scope(input: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input) ? input : undefined;
}

function text(input: unknown, maximum: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maximum) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined;
}

function boundedVersion(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 && input <= 10_000
    ? input
    : undefined;
}

function hashList(input: unknown): readonly string[] | undefined {
  if (!Array.isArray(input) || input.length > 256) return undefined;
  const values = input.map(hash);
  if (values.some((value) => value === undefined)) return undefined;
  return Object.freeze([...values] as string[]);
}

function textList(input: unknown): readonly string[] | undefined {
  if (!Array.isArray(input) || input.length > 256) return undefined;
  const values = input.map((value) => text(value, 256));
  if (values.some((value) => value === undefined)) return undefined;
  return Object.freeze([...new Set(values as string[])]);
}

function actions(input: unknown): readonly TypedActionDefinitionV1[] | undefined {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) return undefined;
  if (
    input.some(
      (candidate) =>
        !candidate ||
        typeof candidate !== 'object' ||
        typeof (candidate as TypedActionDefinitionV1).actionType !== 'string' ||
        typeof (candidate as TypedActionDefinitionV1).version !== 'number' ||
        typeof (candidate as TypedActionDefinitionV1).handlerDigest !== 'string',
    )
  )
    return undefined;
  return Object.freeze(
    (input as TypedActionDefinitionV1[]).map((action) =>
      Object.freeze({
        ...action,
        requiredCapabilities: Object.freeze([...action.requiredCapabilities]),
      }),
    ),
  );
}

export function createRecipeVersionV1(input: {
  readonly recipeId: unknown;
  readonly tenantScope: unknown;
  readonly version: unknown;
  readonly name: unknown;
  readonly description?: unknown;
  readonly actionDefinitions: unknown;
  readonly recipeHash: unknown;
  readonly createdAt: unknown;
}): RecipeResultV1<RecipeVersionV1> {
  const recipeId = stable(input.recipeId);
  const tenantScope = scope(input.tenantScope);
  const version = boundedVersion(input.version);
  const name = text(input.name, 160);
  const description = input.description === undefined ? undefined : text(input.description, 2_000);
  const actionDefinitions = actions(input.actionDefinitions);
  const recipeHash = hash(input.recipeHash);
  const createdAt = timestamp(input.createdAt);
  if (!recipeId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (version === undefined) return rejected('INVALID_VERSION');
  if (!name || (input.description !== undefined && !description)) return rejected('INVALID_TEXT');
  if (!actionDefinitions) return rejected('INVALID_ACTIONS');
  if (!recipeHash) return rejected('INVALID_HASH');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: RECIPE_SCHEMA_VERSION_V1,
      recipeId,
      tenantScope,
      version,
      name,
      ...(description ? { description } : {}),
      actionDefinitions,
      recipeHash,
      state: 'DRAFT' as const,
      createdAt,
    }),
  });
}

export function publishRecipeVersionV1(
  recipe: RecipeVersionV1,
  publishedAtInput: unknown,
): RecipeResultV1<RecipeVersionV1> {
  if (recipe.state !== 'DRAFT') return rejected('INVALID_STATE');
  const publishedAt = timestamp(publishedAtInput);
  if (!publishedAt || Date.parse(publishedAt) < Date.parse(recipe.createdAt))
    return rejected('INVALID_TIMESTAMP');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({ ...recipe, state: 'PUBLISHED' as const, publishedAt }),
  });
}

export function createRecipeTriggerV1(input: {
  readonly triggerId: unknown;
  readonly recipeId: unknown;
  readonly recipeVersion: unknown;
  readonly tenantScope: unknown;
  readonly triggerType: unknown;
  readonly deduplicationKey: unknown;
  readonly authorizationContextHash: unknown;
  readonly enabled: unknown;
}): RecipeResultV1<RecipeTriggerV1> {
  const triggerId = stable(input.triggerId);
  const recipeId = stable(input.recipeId);
  const recipeVersion = boundedVersion(input.recipeVersion);
  const tenantScope = scope(input.tenantScope);
  const deduplicationKey = text(input.deduplicationKey, 200);
  const authorizationContextHash = hash(input.authorizationContextHash);
  if (!triggerId || !recipeId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (recipeVersion === undefined) return rejected('INVALID_VERSION');
  if (!deduplicationKey) return rejected('INVALID_TEXT');
  if (!authorizationContextHash) return rejected('INVALID_HASH');
  if (
    input.triggerType !== 'MANUAL' &&
    input.triggerType !== 'SCHEDULE' &&
    input.triggerType !== 'ARTIFACT_CREATED' &&
    input.triggerType !== 'FOLDER_EVENT' &&
    input.triggerType !== 'WEBHOOK' &&
    input.triggerType !== 'APPROVED_API'
  )
    return rejected('INVALID_TRIGGER');
  if (typeof input.enabled !== 'boolean') return rejected('INVALID_TRIGGER');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: RECIPE_SCHEMA_VERSION_V1,
      triggerId,
      recipeId,
      recipeVersion,
      tenantScope,
      triggerType: input.triggerType as RecipeTriggerTypeV1,
      deduplicationKey,
      authorizationContextHash,
      enabled: input.enabled,
    }),
  });
}

export function createRecipePublicationEnvelopeV1(input: {
  readonly recipeId: unknown;
  readonly recipeVersion: unknown;
  readonly recipeHash: unknown;
  readonly actionHandlerDigests: unknown;
  readonly actionSchemaIds: unknown;
  readonly dsmDefinitionHashes: unknown;
  readonly policyReferenceHashes: unknown;
  readonly validFrom: unknown;
  readonly validUntil: unknown;
  readonly signerKeyVersion: unknown;
  readonly signature: unknown;
}): RecipeResultV1<RecipePublicationEnvelopeV1> {
  const recipeId = stable(input.recipeId);
  const recipeVersion = boundedVersion(input.recipeVersion);
  const recipeHash = hash(input.recipeHash);
  const actionHandlerDigests = hashList(input.actionHandlerDigests);
  const actionSchemaIds = textList(input.actionSchemaIds);
  const dsmDefinitionHashes = hashList(input.dsmDefinitionHashes);
  const policyReferenceHashes = hashList(input.policyReferenceHashes);
  const validFrom = timestamp(input.validFrom);
  const validUntil = timestamp(input.validUntil);
  const signerKeyVersion = text(input.signerKeyVersion, 128);
  const signature = text(input.signature, 4_096);
  if (!recipeId) return rejected('INVALID_IDENTIFIER');
  if (recipeVersion === undefined) return rejected('INVALID_VERSION');
  if (!recipeHash || !actionHandlerDigests || !dsmDefinitionHashes || !policyReferenceHashes)
    return rejected('INVALID_HASH');
  if (!actionSchemaIds) return rejected('INVALID_TEXT');
  if (!validFrom || !validUntil) return rejected('INVALID_TIMESTAMP');
  if (Date.parse(validUntil) <= Date.parse(validFrom)) return rejected('INVALID_WINDOW');
  if (!signerKeyVersion || !signature) return rejected('INVALID_ENVELOPE');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: RECIPE_SCHEMA_VERSION_V1,
      recipeId,
      recipeVersion,
      recipeHash,
      actionHandlerDigests,
      actionSchemaIds,
      dsmDefinitionHashes,
      policyReferenceHashes,
      validFrom,
      validUntil,
      signerKeyVersion,
      signature,
    }),
  });
}
