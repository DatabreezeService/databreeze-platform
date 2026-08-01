import { ProviderContractErrorV1, requireProviderIdempotencyV1 } from './common-v1.ts';
import { parseV1Contract } from '@databreeze/contracts/v1';
import type {
  ProviderDescriptorV1,
  ProviderHealthV1,
  ProviderInvocationContextV1,
  ProviderKindV1,
  SecretHandleV1,
  SecretReferenceV1,
} from './common-v1.ts';

export const OBJECT_STORAGE_MIN_PART_BYTES_V1 = 8 * 1024 * 1024;
export const OBJECT_STORAGE_MAX_PART_BYTES_V1 = 64 * 1024 * 1024;
export const OBJECT_STORAGE_MAX_OBJECT_BYTES_V1 = 20 * 1024 * 1024 * 1024;
export const OBJECT_STORAGE_MAX_PARTS_V1 = 10_000;

const sha256Pattern = /^[a-f0-9]{64}$/;
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/;
const UTC_TIMESTAMP_SCHEMA_ID = 'https://schemas.databreeze.dev/contracts/v1/utc-timestamp';

function isSafeReference(value: unknown): value is string {
  return typeof value === 'string' && safeReferencePattern.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && sha256Pattern.test(value);
}

function isPositiveInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= maximum;
}

function readClosedRecord(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const allowed = new Set(allowedKeys);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  try {
    if (Array.isArray(value)) return undefined;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !allowed.has(key)) return undefined;
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) return undefined;
      result[key] = descriptor.value;
    }
  } catch {
    return undefined;
  }
  return result;
}

function readArray(value: unknown, maximum: number): readonly unknown[] | undefined {
  let descriptors: Record<string, PropertyDescriptor>;
  try {
    if (!Array.isArray(value)) return undefined;
    descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  } catch {
    return undefined;
  }
  const length = descriptors['length']?.value as unknown;
  if (!Number.isSafeInteger(length) || (length as number) < 0 || (length as number) > maximum) {
    return undefined;
  }
  const result: unknown[] = [];
  for (let index = 0; index < (length as number); index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !('value' in descriptor)) return undefined;
    result.push(descriptor.value);
  }
  if (
    Object.keys(descriptors).some((key) => key !== 'length' && Number(key) >= (length as number))
  ) {
    return undefined;
  }
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export interface ProviderPortV1<K extends ProviderKindV1> {
  descriptor(): ProviderDescriptorV1<K>;
  checkHealth(context: ProviderInvocationContextV1): Promise<ProviderHealthV1>;
}

export interface ObjectStorageMultipartPlanInputV1 {
  readonly objectKey: string;
  readonly expectedSha256: string;
  readonly expectedByteLength: number;
  readonly partSizeBytes: number;
}

export interface ObjectStorageMultipartPlanV1 extends ObjectStorageMultipartPlanInputV1 {
  readonly maximumParts: number;
}

export function defineObjectStorageMultipartPlanV1(
  input: ObjectStorageMultipartPlanInputV1,
): ObjectStorageMultipartPlanV1 {
  const record = readClosedRecord(input, [
    'objectKey',
    'expectedSha256',
    'expectedByteLength',
    'partSizeBytes',
  ]);
  if (
    record === undefined ||
    !isSafeReference(record['objectKey']) ||
    !isSha256(record['expectedSha256']) ||
    !isPositiveInteger(record['expectedByteLength'], OBJECT_STORAGE_MAX_OBJECT_BYTES_V1) ||
    !isPositiveInteger(record['partSizeBytes'], OBJECT_STORAGE_MAX_PART_BYTES_V1) ||
    record['partSizeBytes'] < OBJECT_STORAGE_MIN_PART_BYTES_V1
  ) {
    throw new ProviderContractErrorV1();
  }
  const maximumParts = Math.ceil(record['expectedByteLength'] / record['partSizeBytes']);
  if (maximumParts > OBJECT_STORAGE_MAX_PARTS_V1) throw new ProviderContractErrorV1();
  return Object.freeze({
    objectKey: record['objectKey'],
    expectedSha256: record['expectedSha256'],
    expectedByteLength: record['expectedByteLength'],
    partSizeBytes: record['partSizeBytes'],
    maximumParts,
  });
}

export interface ObjectStoragePartInputV1 {
  readonly partNumber: number;
  readonly content: Uint8Array;
  readonly sha256: string;
}

export type ObjectStoragePartV1 = ObjectStoragePartInputV1;

export function defineObjectStoragePartV1(input: ObjectStoragePartInputV1): ObjectStoragePartV1 {
  const record = readClosedRecord(input, ['partNumber', 'content', 'sha256']);
  if (
    record === undefined ||
    !isPositiveInteger(record['partNumber'], OBJECT_STORAGE_MAX_PARTS_V1) ||
    !(record['content'] instanceof Uint8Array) ||
    record['content'].byteLength === 0 ||
    record['content'].byteLength > OBJECT_STORAGE_MAX_PART_BYTES_V1 ||
    !isSha256(record['sha256'])
  ) {
    throw new ProviderContractErrorV1();
  }
  return Object.freeze({
    partNumber: record['partNumber'],
    content: record['content'],
    sha256: record['sha256'],
  });
}

export interface ObjectStorageBeginMultipartRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly plan: ObjectStorageMultipartPlanV1;
}

export interface ObjectStorageBeginMultipartResultV1 {
  readonly uploadRef: string;
  readonly acceptedPartSizeBytes: number;
  readonly maximumParts: number;
}

export interface ObjectStorageUploadPartRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly uploadRef: string;
  readonly part: ObjectStoragePartV1;
}

export interface ObjectStorageUploadedPartV1 {
  readonly partNumber: number;
  readonly sha256: string;
  readonly byteLength: number;
  readonly receiptRef: string;
}

export interface ObjectStorageCompleteMultipartRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly uploadRef: string;
  readonly orderedParts: readonly ObjectStorageUploadedPartV1[];
  readonly expectedSha256: string;
  readonly expectedByteLength: number;
}

export interface ObjectStorageAbortMultipartRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly uploadRef: string;
}

export interface ObjectStoragePutResultV1 {
  readonly objectRef: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface ObjectStorageRangeRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly objectRef: string;
  readonly offset: number;
  readonly length: number;
}

export interface ObjectStorageDigestRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly objectRef: string;
  readonly expectedSha256: string;
}

export interface ObjectStorageRetentionRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly objectRef: string;
  readonly retainUntil: string;
}

export interface ObjectStorageDeleteRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly objectRef: string;
  readonly expectedSha256: string;
}

export interface ObjectStorageReadGrantRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly objectRef: string;
  readonly disposition: 'inline' | 'attachment';
  readonly expiresAt: string;
}

export interface ObjectStorageReadGrantV1 {
  readonly grantRef: string;
  readonly expiresAt: string;
}

export interface ObjectStorageExitRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly cursor?: string;
  readonly limit: number;
}

export interface ObjectStorageExitEntryV1 {
  readonly objectRef: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly retentionState: 'none' | 'active' | 'expired';
}

export interface ObjectStorageExitManifestV1 {
  readonly manifestFormat: 'databreeze-object-storage-exit-v1';
  readonly entries: readonly ObjectStorageExitEntryV1[];
  readonly nextCursor?: string;
  readonly complete: boolean;
}

export function defineObjectStorageExitManifestV1(
  input: ObjectStorageExitManifestV1,
): ObjectStorageExitManifestV1 {
  const record = readClosedRecord(input, ['manifestFormat', 'entries', 'nextCursor', 'complete']);
  const rawEntries = record === undefined ? undefined : readArray(record['entries'], 1_000);
  if (
    record === undefined ||
    record['manifestFormat'] !== 'databreeze-object-storage-exit-v1' ||
    rawEntries === undefined ||
    typeof record['complete'] !== 'boolean' ||
    (record['nextCursor'] !== undefined && !isSafeReference(record['nextCursor'])) ||
    (record['complete'] && record['nextCursor'] !== undefined) ||
    (!record['complete'] && record['nextCursor'] === undefined)
  ) {
    throw new ProviderContractErrorV1();
  }
  const entries = rawEntries.map((rawEntry) => {
    const entry = readClosedRecord(rawEntry, [
      'objectRef',
      'sha256',
      'byteLength',
      'retentionState',
    ]);
    if (
      entry === undefined ||
      !isSafeReference(entry['objectRef']) ||
      !isSha256(entry['sha256']) ||
      !isPositiveInteger(entry['byteLength'], OBJECT_STORAGE_MAX_OBJECT_BYTES_V1) ||
      !(['none', 'active', 'expired'] as const).includes(entry['retentionState'] as never)
    ) {
      throw new ProviderContractErrorV1();
    }
    return {
      objectRef: entry['objectRef'],
      sha256: entry['sha256'],
      byteLength: entry['byteLength'],
      retentionState: entry['retentionState'] as ObjectStorageExitEntryV1['retentionState'],
    };
  });
  return deepFreeze({
    manifestFormat: 'databreeze-object-storage-exit-v1',
    entries,
    ...(record['nextCursor'] === undefined ? {} : { nextCursor: record['nextCursor'] }),
    complete: record['complete'],
  });
}

export interface ObjectStorageProviderPortV1 extends ProviderPortV1<'object-storage'> {
  beginMultipartUpload(
    request: ObjectStorageBeginMultipartRequestV1,
  ): Promise<ObjectStorageBeginMultipartResultV1>;
  uploadPart(request: ObjectStorageUploadPartRequestV1): Promise<ObjectStorageUploadedPartV1>;
  completeMultipartUpload(
    request: ObjectStorageCompleteMultipartRequestV1,
  ): Promise<ObjectStoragePutResultV1>;
  abortMultipartUpload(
    request: ObjectStorageAbortMultipartRequestV1,
  ): Promise<Readonly<{ aborted: boolean }>>;
  readRange(request: ObjectStorageRangeRequestV1): Promise<Uint8Array>;
  verifyDigest(request: ObjectStorageDigestRequestV1): Promise<Readonly<{ verified: boolean }>>;
  applyRetention(request: ObjectStorageRetentionRequestV1): Promise<Readonly<{ applied: boolean }>>;
  deleteVerified(request: ObjectStorageDeleteRequestV1): Promise<Readonly<{ deleted: boolean }>>;
  createReadGrant(request: ObjectStorageReadGrantRequestV1): Promise<ObjectStorageReadGrantV1>;
  exportObjectManifest(request: ObjectStorageExitRequestV1): Promise<ObjectStorageExitManifestV1>;
}

export interface ExternalDeliveryWebhookRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

export interface ExternalDeliveryEventV1 {
  readonly providerMessageRef: string;
  readonly status: 'accepted' | 'delivered' | 'bounced' | 'failed' | 'suppressed';
  readonly occurredAt: string;
  readonly eventId: string;
}

export interface EmailTemplateRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly recipientHandle: string;
  readonly locale: 'vi-VN' | 'en';
  readonly templateKey: string;
  readonly safeParameters: Readonly<Record<string, string | number | boolean>>;
}

export interface DeliverySuppressionRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly recipientHandle: string;
  readonly reason: 'hard_bounce' | 'complaint' | 'administrator';
  readonly occurredAt: string;
}

export interface DeliverySuppressionManifestRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly cursor?: string;
  readonly limit: number;
}

export interface DeliverySuppressionManifestV1 {
  readonly manifestFormat: 'databreeze-delivery-suppression-v1';
  readonly entries: readonly Readonly<{
    recipientHandle: string;
    reason: 'hard_bounce' | 'complaint' | 'administrator';
    occurredAt: string;
  }>[];
  readonly nextCursor?: string;
  readonly complete: boolean;
}

export function defineDeliverySuppressionManifestV1(
  input: DeliverySuppressionManifestV1,
): DeliverySuppressionManifestV1 {
  const record = readClosedRecord(input, ['manifestFormat', 'entries', 'nextCursor', 'complete']);
  const rawEntries = record === undefined ? undefined : readArray(record['entries'], 1_000);
  if (
    record === undefined ||
    record['manifestFormat'] !== 'databreeze-delivery-suppression-v1' ||
    rawEntries === undefined ||
    typeof record['complete'] !== 'boolean' ||
    (record['nextCursor'] !== undefined && !isSafeReference(record['nextCursor'])) ||
    (record['complete'] && record['nextCursor'] !== undefined) ||
    (!record['complete'] && record['nextCursor'] === undefined)
  ) {
    throw new ProviderContractErrorV1();
  }
  const entries = rawEntries.map((rawEntry) => {
    const entry = readClosedRecord(rawEntry, ['recipientHandle', 'reason', 'occurredAt']);
    if (
      entry === undefined ||
      !isSafeReference(entry['recipientHandle']) ||
      !(['hard_bounce', 'complaint', 'administrator'] as const).includes(
        entry['reason'] as never,
      ) ||
      !parseV1Contract(UTC_TIMESTAMP_SCHEMA_ID, entry['occurredAt']).accepted
    ) {
      throw new ProviderContractErrorV1();
    }
    return {
      recipientHandle: entry['recipientHandle'],
      reason: entry['reason'] as DeliverySuppressionRequestV1['reason'],
      occurredAt: entry['occurredAt'] as string,
    };
  });
  return deepFreeze({
    manifestFormat: 'databreeze-delivery-suppression-v1',
    entries,
    ...(record['nextCursor'] === undefined ? {} : { nextCursor: record['nextCursor'] }),
    complete: record['complete'],
  });
}

export interface EmailProviderPortV1 extends ProviderPortV1<'email'> {
  sendTemplate(request: EmailTemplateRequestV1): Promise<Readonly<{ providerMessageRef: string }>>;
  verifyDeliveryWebhook(
    request: ExternalDeliveryWebhookRequestV1,
  ): Promise<ExternalDeliveryEventV1>;
  suppressRecipient(
    request: DeliverySuppressionRequestV1,
  ): Promise<Readonly<{ suppressed: boolean }>>;
  exportSuppressionManifest(
    request: DeliverySuppressionManifestRequestV1,
  ): Promise<DeliverySuppressionManifestV1>;
}

export interface PushRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly recipientTokenHandle: string;
  readonly locale: 'vi-VN' | 'en';
  readonly messageKey: string;
  readonly opaqueDeepLinkToken: string;
  readonly safeParameters: Readonly<Record<string, string | number | boolean>>;
}

export interface PushProviderPortV1 extends ProviderPortV1<'push'> {
  send(request: PushRequestV1): Promise<Readonly<{ providerMessageRef: string }>>;
  verifyDeliveryWebhook(
    request: ExternalDeliveryWebhookRequestV1,
  ): Promise<ExternalDeliveryEventV1>;
  suppressRecipient(
    request: DeliverySuppressionRequestV1,
  ): Promise<Readonly<{ suppressed: boolean }>>;
  exportSuppressionManifest(
    request: DeliverySuppressionManifestRequestV1,
  ): Promise<DeliverySuppressionManifestV1>;
}

export interface ProviderContentReferenceV1 {
  readonly handle: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface OcrRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly input: ProviderContentReferenceV1;
  readonly localeHints: readonly string[];
  readonly outputSchemaId: string;
}

export interface OcrResultV1 {
  readonly text: string;
  readonly confidence: number;
  readonly evidenceRegions: readonly Readonly<Record<string, string | number>>[];
  readonly providerModelRef: string;
}

export interface OcrProviderPortV1 extends ProviderPortV1<'ocr'> {
  extract(request: OcrRequestV1): Promise<OcrResultV1>;
}

export interface AiStructuredRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly taskType: string;
  readonly modelPolicyRef: string;
  readonly inputRefs: readonly ProviderContentReferenceV1[];
  readonly outputSchemaId: string;
  readonly deterministicPlanRequired: boolean;
}

export interface AiStructuredResultV1 {
  readonly output: Readonly<Record<string, unknown>>;
  readonly confidence: number;
  readonly providerModelRef: string;
  readonly configurationRef: string;
}

export interface AiProviderPortV1 extends ProviderPortV1<'ai'> {
  generateStructured(request: AiStructuredRequestV1): Promise<AiStructuredResultV1>;
}

export interface DatabreezeSubscriptionRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly organizationId: string;
  readonly planVersionId: string;
  readonly externalPriceRef: string;
}

export interface HostedSubscriptionCheckoutRequestV1 extends DatabreezeSubscriptionRequestV1 {
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export interface SubscriptionPortalRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly organizationId: string;
  readonly providerCustomerRef: string;
  readonly returnUrl: string;
}

export interface SubscriptionProviderReferenceV1 {
  readonly providerCustomerRef: string;
  readonly providerSubscriptionRef?: string;
  readonly hostedUrl?: string;
}

export interface SubscriptionWebhookEventV1 {
  readonly eventId: string;
  readonly providerObjectRef: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly payloadDigest: string;
}

export interface SubscriptionReconciliationV1 {
  readonly providerObjectRef: string;
  readonly state: 'trialing' | 'active' | 'past_due' | 'cancel_at_period_end' | 'cancelled';
  readonly effectiveAt: string;
  readonly externalPriceRef: string;
}

export interface SubscriptionMigrationManifestRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly cursor?: string;
  readonly limit: number;
}

export interface SubscriptionMigrationEntryV1 {
  readonly organizationId: string;
  readonly planVersionId: string;
  readonly providerCustomerRef: string;
  readonly providerSubscriptionRef?: string;
  readonly state: SubscriptionReconciliationV1['state'];
  readonly effectiveAt: string;
}

export interface SubscriptionMigrationManifestV1 {
  readonly manifestFormat: 'databreeze-subscription-migration-v1';
  readonly entries: readonly SubscriptionMigrationEntryV1[];
  readonly nextCursor?: string;
  readonly complete: boolean;
}

export function defineSubscriptionMigrationManifestV1(
  input: SubscriptionMigrationManifestV1,
): SubscriptionMigrationManifestV1 {
  const record = readClosedRecord(input, ['manifestFormat', 'entries', 'nextCursor', 'complete']);
  const rawEntries = record === undefined ? undefined : readArray(record['entries'], 1_000);
  if (
    record === undefined ||
    record['manifestFormat'] !== 'databreeze-subscription-migration-v1' ||
    rawEntries === undefined ||
    typeof record['complete'] !== 'boolean' ||
    (record['nextCursor'] !== undefined && !isSafeReference(record['nextCursor'])) ||
    (record['complete'] && record['nextCursor'] !== undefined) ||
    (!record['complete'] && record['nextCursor'] === undefined)
  ) {
    throw new ProviderContractErrorV1();
  }
  const entries = rawEntries.map((rawEntry) => {
    const entry = readClosedRecord(rawEntry, [
      'organizationId',
      'planVersionId',
      'providerCustomerRef',
      'providerSubscriptionRef',
      'state',
      'effectiveAt',
    ]);
    if (
      entry === undefined ||
      !isSafeReference(entry['organizationId']) ||
      !isSafeReference(entry['planVersionId']) ||
      !isSafeReference(entry['providerCustomerRef']) ||
      (entry['providerSubscriptionRef'] !== undefined &&
        !isSafeReference(entry['providerSubscriptionRef'])) ||
      !(['trialing', 'active', 'past_due', 'cancel_at_period_end', 'cancelled'] as const).includes(
        entry['state'] as never,
      ) ||
      !parseV1Contract(UTC_TIMESTAMP_SCHEMA_ID, entry['effectiveAt']).accepted
    ) {
      throw new ProviderContractErrorV1();
    }
    return {
      organizationId: entry['organizationId'],
      planVersionId: entry['planVersionId'],
      providerCustomerRef: entry['providerCustomerRef'],
      ...(entry['providerSubscriptionRef'] === undefined
        ? {}
        : { providerSubscriptionRef: entry['providerSubscriptionRef'] }),
      state: entry['state'] as SubscriptionMigrationEntryV1['state'],
      effectiveAt: entry['effectiveAt'] as string,
    };
  });
  return deepFreeze({
    manifestFormat: 'databreeze-subscription-migration-v1',
    entries,
    ...(record['nextCursor'] === undefined ? {} : { nextCursor: record['nextCursor'] }),
    complete: record['complete'],
  });
}

export interface PaymentsProviderPortV1 extends ProviderPortV1<'payments'> {
  createHostedSubscriptionCheckout(
    request: HostedSubscriptionCheckoutRequestV1,
  ): Promise<SubscriptionProviderReferenceV1>;
  createSubscriptionPortal(
    request: SubscriptionPortalRequestV1,
  ): Promise<SubscriptionProviderReferenceV1>;
  upsertDatabreezeSubscription(
    request: DatabreezeSubscriptionRequestV1,
  ): Promise<SubscriptionProviderReferenceV1>;
  verifySubscriptionWebhook(
    request: ExternalDeliveryWebhookRequestV1,
  ): Promise<SubscriptionWebhookEventV1>;
  reconcileDatabreezeSubscription(
    request: Readonly<{
      context: ProviderInvocationContextV1;
      providerSubscriptionRef: string;
    }>,
  ): Promise<SubscriptionReconciliationV1>;
  exportSubscriptionMigration(
    request: SubscriptionMigrationManifestRequestV1,
  ): Promise<SubscriptionMigrationManifestV1>;
}

export interface SafeTelemetryRecordV1 {
  readonly signal: 'metric' | 'trace' | 'log';
  readonly name: string;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly safeAttributes: Readonly<Record<string, string | number | boolean>>;
}

export interface TelemetryProviderPortV1 extends ProviderPortV1<'telemetry'> {
  exportBatch(
    request: Readonly<{
      context: ProviderInvocationContextV1;
      batchId: string;
      records: readonly SafeTelemetryRecordV1[];
    }>,
  ): Promise<Readonly<{ accepted: number; rejected: number }>>;
}

export type SecretPurposeV1 =
  | 'provider-authentication'
  | 'webhook-verification'
  | 'encryption-key'
  | 'signing-key';

export interface SecretReferenceRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly reference: SecretReferenceV1;
  readonly purpose: SecretPurposeV1;
  readonly expiresAt: string;
}

export interface SecretsPortabilityManifestRequestV1 {
  readonly context: ProviderInvocationContextV1;
}

export interface SecretsPortabilityManifestV1 {
  readonly manifestFormat: 'databreeze-secrets-portability-v1';
  readonly referenceCount: number;
  readonly activeHandleCount: number;
  readonly revocation: 'automatic' | 'manual';
  readonly portability: 'references-only' | 'rebind-required';
}

export function defineSecretsPortabilityManifestV1(
  input: SecretsPortabilityManifestV1,
): SecretsPortabilityManifestV1 {
  const record = readClosedRecord(input, [
    'manifestFormat',
    'referenceCount',
    'activeHandleCount',
    'revocation',
    'portability',
  ]);
  if (
    record === undefined ||
    record['manifestFormat'] !== 'databreeze-secrets-portability-v1' ||
    !Number.isSafeInteger(record['referenceCount']) ||
    (record['referenceCount'] as number) < 0 ||
    !Number.isSafeInteger(record['activeHandleCount']) ||
    (record['activeHandleCount'] as number) < 0 ||
    !(['automatic', 'manual'] as const).includes(record['revocation'] as never) ||
    !(['references-only', 'rebind-required'] as const).includes(record['portability'] as never)
  ) {
    throw new ProviderContractErrorV1();
  }
  return Object.freeze({
    manifestFormat: 'databreeze-secrets-portability-v1',
    referenceCount: record['referenceCount'] as number,
    activeHandleCount: record['activeHandleCount'] as number,
    revocation: record['revocation'] as SecretsPortabilityManifestV1['revocation'],
    portability: record['portability'] as SecretsPortabilityManifestV1['portability'],
  });
}

export interface SecretsProviderPortV1 extends ProviderPortV1<'secrets'> {
  resolveHandle(request: SecretReferenceRequestV1): Promise<SecretHandleV1>;
  revokeHandle(
    request: Readonly<{
      context: ProviderInvocationContextV1;
      handle: SecretHandleV1;
    }>,
  ): Promise<Readonly<{ revoked: boolean }>>;
  describePortability(
    request: SecretsPortabilityManifestRequestV1,
  ): Promise<SecretsPortabilityManifestV1>;
}

export function assertMutatingProviderRequestV1(context: ProviderInvocationContextV1): string {
  return requireProviderIdempotencyV1(context);
}
