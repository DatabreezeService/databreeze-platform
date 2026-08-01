import type { SecretReferenceIssuerV1, SecretReferenceV1 } from '@databreeze/provider-ports/v1';

export type { SecretReferenceIssuerV1, SecretReferenceV1 } from '@databreeze/provider-ports/v1';

export const RUNTIME_CONFIG_SCHEMA_VERSION_V1 = 1 as const;

export type RuntimeProfileV1 = 'development' | 'test' | 'preview' | 'staging' | 'production';

export type ConfigIssueCodeV1 =
  | 'duplicate'
  | 'forbidden_when_disabled'
  | 'invalid_boolean'
  | 'invalid_email'
  | 'invalid_integer'
  | 'invalid_mode'
  | 'invalid_profile'
  | 'invalid_secret_reference'
  | 'invalid_secret_namespace'
  | 'invalid_string'
  | 'required'
  | 'unknown_key'
  | 'unsafe_url';

export interface ConfigIssueV1 {
  readonly path: string;
  readonly code: ConfigIssueCodeV1;
}

export class ConfigValidationErrorV1 extends Error {
  public readonly issues: readonly ConfigIssueV1[];

  public constructor(issues: readonly ConfigIssueV1[]) {
    super('Runtime configuration is invalid.');
    this.name = 'ConfigValidationErrorV1';
    this.issues = Object.freeze(
      issues
        .slice(0, 100)
        .map((issue) => Object.freeze({ path: issue.path.slice(0, 80), code: issue.code })),
    );
    Object.freeze(this);
  }

  public toJSON(): Readonly<{ name: string; issues: readonly ConfigIssueV1[] }> {
    return Object.freeze({ name: this.name, issues: this.issues });
  }
}

export interface ProviderPolicyConfigV1 {
  readonly timeoutMs: number;
  readonly maxAttempts: number;
}

export interface DisabledProviderConfigV1 {
  readonly mode: 'disabled';
}

export interface ObjectStorageConfigV1 {
  readonly mode: 'local' | 'remote';
  readonly endpointUrl: string;
  readonly region: string;
  readonly bucket: string;
  readonly credentialRef?: SecretReferenceV1;
  readonly forcePathStyle: boolean;
}

export interface ActiveEmailConfigV1 {
  readonly mode: 'local' | 'remote';
  readonly endpointUrl: string;
  readonly fromAddress: string;
  readonly credentialRef?: SecretReferenceV1;
}

export type EmailConfigV1 = DisabledProviderConfigV1 | ActiveEmailConfigV1;

export interface ActivePushConfigV1 {
  readonly mode: 'remote';
  readonly endpointUrl: string;
  readonly applicationId: string;
  readonly credentialRef: SecretReferenceV1;
}

export type PushConfigV1 = DisabledProviderConfigV1 | ActivePushConfigV1;

export interface ActiveDocumentProviderConfigV1 {
  readonly mode: 'local' | 'remote';
  readonly endpointUrl: string;
  readonly credentialRef?: SecretReferenceV1;
}

export type OcrConfigV1 = DisabledProviderConfigV1 | ActiveDocumentProviderConfigV1;
export type AiConfigV1 = DisabledProviderConfigV1 | ActiveDocumentProviderConfigV1;

export interface ActivePaymentsConfigV1 {
  readonly mode: 'remote';
  readonly endpointUrl: string;
  readonly credentialRef: SecretReferenceV1;
  readonly webhookSecretRef: SecretReferenceV1;
}

export type PaymentsConfigV1 = DisabledProviderConfigV1 | ActivePaymentsConfigV1;

export interface ActiveTelemetryConfigV1 {
  readonly mode: 'local' | 'remote';
  readonly endpointUrl: string;
  readonly credentialRef?: SecretReferenceV1;
}

export type TelemetryConfigV1 = DisabledProviderConfigV1 | ActiveTelemetryConfigV1;

export interface MemorySecretsConfigV1 {
  readonly mode: 'memory';
  readonly namespace: string;
}

export interface RemoteSecretsConfigV1 {
  readonly mode: 'remote';
  readonly endpointUrl: string;
  readonly namespace: string;
}

export type SecretsConfigV1 = MemorySecretsConfigV1 | RemoteSecretsConfigV1;

export interface ProviderRuntimeConfigV1 {
  readonly objectStorage: ObjectStorageConfigV1;
  readonly email: EmailConfigV1;
  readonly push: PushConfigV1;
  readonly ocr: OcrConfigV1;
  readonly ai: AiConfigV1;
  readonly payments: PaymentsConfigV1;
  readonly telemetry: TelemetryConfigV1;
  readonly secrets: SecretsConfigV1;
}

export interface RuntimeConfigV1 {
  readonly schemaVersion: typeof RUNTIME_CONFIG_SCHEMA_VERSION_V1;
  readonly profile: RuntimeProfileV1;
  readonly providerPolicy: ProviderPolicyConfigV1;
  readonly providers: ProviderRuntimeConfigV1;
}

export type EnvironmentEntriesV1 =
  | Readonly<Record<string, string | undefined>>
  | readonly (readonly [string, string | undefined])[];

export interface LoadRuntimeConfigInputV1 {
  readonly environment?: EnvironmentEntriesV1;
  readonly overrides?: unknown;
  readonly secretReferenceIssuer?: SecretReferenceIssuerV1;
}
