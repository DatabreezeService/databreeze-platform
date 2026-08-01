import type {
  AiProviderPortV1,
  EmailProviderPortV1,
  ObjectStorageProviderPortV1,
  OcrProviderPortV1,
  PaymentsProviderPortV1,
  PushProviderPortV1,
  SecretsProviderPortV1,
  TelemetryProviderPortV1,
} from '@databreeze/provider-ports/v1';

declare const objectStorage: ObjectStorageProviderPortV1;
declare const email: EmailProviderPortV1;
declare const push: PushProviderPortV1;
declare const ocr: OcrProviderPortV1;
declare const ai: AiProviderPortV1;
declare const payments: PaymentsProviderPortV1;
declare const telemetry: TelemetryProviderPortV1;
declare const secrets: SecretsProviderPortV1;

void objectStorage.putImmutable;
void objectStorage.readRange;
void objectStorage.verifyDigest;
void objectStorage.applyRetention;
void objectStorage.deleteVerified;
void objectStorage.createReadGrant;
void email.sendTemplate;
void email.verifyDeliveryWebhook;
void push.send;
void push.verifyDeliveryWebhook;
void ocr.extract;
void ai.generateStructured;
void payments.createHostedSubscriptionCheckout;
void payments.createSubscriptionPortal;
void payments.upsertDatabreezeSubscription;
void payments.verifySubscriptionWebhook;
void payments.reconcileDatabreezeSubscription;
void telemetry.exportBatch;
void secrets.resolveHandle;
void secrets.revokeHandle;

for (const port of [objectStorage, email, push, ocr, ai, payments, telemetry, secrets]) {
  void port.descriptor;
  void port.checkHealth;
  void port.exportState;
}

// @ts-expect-error -- the billing port cannot charge customer funds.
void payments.chargeCustomer;
// @ts-expect-error -- the billing port cannot refund customer funds.
void payments.refundPayment;
// @ts-expect-error -- the billing port cannot transfer or settle customer funds.
void payments.transferFunds;
// @ts-expect-error -- the billing port cannot capture raw payment credentials.
void payments.attachPaymentMethod;
