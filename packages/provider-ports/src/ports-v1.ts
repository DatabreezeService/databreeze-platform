import type {
  ProviderDescriptorV1,
  ProviderHealthV1,
  ProviderInvocationContextV1,
  ProviderKindV1,
  SecretHandleV1,
} from './common-v1.ts';

export interface ProviderStateExportRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly cursor?: string;
  readonly limit: number;
}

export interface ProviderStateExportResultV1 {
  readonly manifestFormat: string;
  readonly entries: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly nextCursor?: string;
  readonly complete: boolean;
}

export interface ProviderPortV1<K extends ProviderKindV1> {
  descriptor(): ProviderDescriptorV1<K>;
  checkHealth(context: ProviderInvocationContextV1): Promise<ProviderHealthV1>;
  exportState(request: ProviderStateExportRequestV1): Promise<ProviderStateExportResultV1>;
}

export interface ObjectStoragePutRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly objectKey: string;
  readonly content: Uint8Array;
  readonly sha256: string;
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

export interface ObjectStorageProviderPortV1 extends ProviderPortV1<'object-storage'> {
  putImmutable(request: ObjectStoragePutRequestV1): Promise<ObjectStoragePutResultV1>;
  readRange(request: ObjectStorageRangeRequestV1): Promise<Uint8Array>;
  verifyDigest(request: ObjectStorageDigestRequestV1): Promise<Readonly<{ verified: boolean }>>;
  applyRetention(request: ObjectStorageRetentionRequestV1): Promise<Readonly<{ applied: boolean }>>;
  deleteVerified(request: ObjectStorageDeleteRequestV1): Promise<Readonly<{ deleted: boolean }>>;
  createReadGrant(request: ObjectStorageReadGrantRequestV1): Promise<ObjectStorageReadGrantV1>;
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

export interface EmailProviderPortV1 extends ProviderPortV1<'email'> {
  sendTemplate(request: EmailTemplateRequestV1): Promise<Readonly<{ providerMessageRef: string }>>;
  verifyDeliveryWebhook(
    request: ExternalDeliveryWebhookRequestV1,
  ): Promise<ExternalDeliveryEventV1>;
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

export interface SecretReferenceRequestV1 {
  readonly context: ProviderInvocationContextV1;
  readonly reference: string;
  readonly purpose: string;
  readonly expiresAt: string;
}

export interface SecretsProviderPortV1 extends ProviderPortV1<'secrets'> {
  resolveHandle(request: SecretReferenceRequestV1): Promise<SecretHandleV1>;
  revokeHandle(
    request: Readonly<{
      context: ProviderInvocationContextV1;
      handle: SecretHandleV1;
    }>,
  ): Promise<Readonly<{ revoked: boolean }>>;
}
