import { ProviderOperationErrorV1 } from '@databreeze/provider-ports/v1';
import type {
  AiProviderPortV1,
  EmailProviderPortV1,
  ObjectStorageProviderPortV1,
  OcrProviderPortV1,
  PaymentsProviderPortV1,
  PushProviderPortV1,
  SecretsProviderPortV1,
  TelemetryProviderPortV1,
  SecretReferenceV1,
} from '@databreeze/provider-ports/v1';

const unavailable = (): Promise<never> => Promise.reject(new Error('compile-only adapter'));

const completeEmailAdapter = {
  descriptor: (): never => {
    throw new Error('compile-only adapter');
  },
  checkHealth: unavailable,
  sendTemplate: unavailable,
  verifyDeliveryWebhook: unavailable,
  suppressRecipient: unavailable,
  exportSuppressionManifest: unavailable,
} satisfies EmailProviderPortV1;

void completeEmailAdapter;

// @ts-expect-error -- secret references are branded values created by the validated factory.
const structurallyForgedSecretReference: SecretReferenceV1 = {};
void structurallyForgedSecretReference;

// @ts-expect-error -- provider operation errors are created only by createProviderFailureV1.
new ProviderOperationErrorV1({
  code: 'UNKNOWN',
  operation: 'contract-validation',
  retryable: false,
});

declare const objectStorage: ObjectStorageProviderPortV1;
declare const email: EmailProviderPortV1;
declare const push: PushProviderPortV1;
declare const ocr: OcrProviderPortV1;
declare const ai: AiProviderPortV1;
declare const payments: PaymentsProviderPortV1;
declare const telemetry: TelemetryProviderPortV1;
declare const secrets: SecretsProviderPortV1;

void objectStorage.beginMultipartUpload;
void objectStorage.uploadPart;
void objectStorage.completeMultipartUpload;
void objectStorage.abortMultipartUpload;
void objectStorage.readRange;
void objectStorage.verifyDigest;
void objectStorage.applyRetention;
void objectStorage.deleteVerified;
void objectStorage.createReadGrant;
void objectStorage.exportObjectManifest;
void email.sendTemplate;
void email.verifyDeliveryWebhook;
void email.suppressRecipient;
void email.exportSuppressionManifest;
void push.send;
void push.verifyDeliveryWebhook;
void push.suppressRecipient;
void push.exportSuppressionManifest;
void ocr.extract;
void ai.generateStructured;
void payments.createHostedSubscriptionCheckout;
void payments.createSubscriptionPortal;
void payments.upsertDatabreezeSubscription;
void payments.verifySubscriptionWebhook;
void payments.reconcileDatabreezeSubscription;
void payments.exportSubscriptionMigration;
void telemetry.exportBatch;
void secrets.resolveHandle;
void secrets.revokeHandle;
void secrets.describePortability;

for (const port of [objectStorage, email, push, ocr, ai, payments, telemetry, secrets]) {
  void port.descriptor;
  void port.checkHealth;
}

// @ts-expect-error -- provider families expose only their content-safe, typed exit contract.
void objectStorage.exportState;
// @ts-expect-error -- immutable storage is streamed in bounded parts, never a whole-object buffer.
void objectStorage.putImmutable;

// @ts-expect-error -- the billing port cannot charge customer funds.
void payments.chargeCustomer;
// @ts-expect-error -- the billing port cannot refund customer funds.
void payments.refundPayment;
// @ts-expect-error -- the billing port cannot transfer or settle customer funds.
void payments.transferFunds;
// @ts-expect-error -- the billing port cannot capture raw payment credentials.
void payments.attachPaymentMethod;
