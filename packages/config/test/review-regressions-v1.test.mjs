import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import test from 'node:test';

import { ConfigValidationErrorV1, loadRuntimeConfigV1 } from '../src/runtime-config/v1.ts';

function issue(error, path, code) {
  return (
    error instanceof ConfigValidationErrorV1 &&
    error.issues.some((entry) => entry.path === path && entry.code === code)
  );
}

function expectSafeConfigFailure(run, path, code, exposed = []) {
  assert.throws(run, (error) => {
    assert.ok(issue(error, path, code), inspect(error));
    for (const value of exposed) {
      assert.doesNotMatch(String(error), new RegExp(value, 'u'));
      assert.doesNotMatch(JSON.stringify(error), new RegExp(value, 'u'));
      assert.doesNotMatch(inspect(error), new RegExp(value, 'u'));
    }
    assert.ok(error.issues.every((entry) => entry.path.length <= 80));
    return true;
  });
}

test('an environment mode change replaces the lower-precedence provider record', () => {
  const disabledEmail = loadRuntimeConfigV1({
    environment: {
      DATABREEZE_PROFILE: 'development',
      DATABREEZE_EMAIL_MODE: 'disabled',
    },
  });
  assert.deepEqual(disabledEmail.providers.email, { mode: 'disabled' });

  const disabledTelemetry = loadRuntimeConfigV1({
    environment: {
      DATABREEZE_PROFILE: 'development',
      DATABREEZE_TELEMETRY_MODE: 'disabled',
    },
  });
  assert.deepEqual(disabledTelemetry.providers.telemetry, { mode: 'disabled' });

  expectSafeConfigFailure(
    () =>
      loadRuntimeConfigV1({
        environment: {
          DATABREEZE_PROFILE: 'development',
          DATABREEZE_OBJECT_STORAGE_MODE: 'remote',
        },
      }),
    'providers.objectStorage.endpointUrl',
    'required',
  );
  expectSafeConfigFailure(
    () =>
      loadRuntimeConfigV1({
        environment: {
          DATABREEZE_PROFILE: 'development',
          DATABREEZE_SECRETS_MODE: 'remote',
        },
      }),
    'providers.secrets.namespace',
    'required',
  );
});

const activeEnvironmentByProvider = {
  email: {
    DATABREEZE_EMAIL_MODE: 'local',
    DATABREEZE_EMAIL_ENDPOINT_URL: 'smtp://127.0.0.1:1025',
    DATABREEZE_EMAIL_FROM_ADDRESS: 'notify@databreeze.local',
  },
  push: {
    DATABREEZE_PUSH_MODE: 'remote',
    DATABREEZE_PUSH_ENDPOINT_URL: 'https://push.example.test',
    DATABREEZE_PUSH_APPLICATION_ID: 'databreeze',
    DATABREEZE_PUSH_CREDENTIAL_REF: 'secret://development/push/credential',
  },
  ocr: {
    DATABREEZE_OCR_MODE: 'local',
    DATABREEZE_OCR_ENDPOINT_URL: 'http://127.0.0.1:8181',
  },
  ai: {
    DATABREEZE_AI_MODE: 'local',
    DATABREEZE_AI_ENDPOINT_URL: 'http://127.0.0.1:8282',
  },
  payments: {
    DATABREEZE_PAYMENTS_MODE: 'remote',
    DATABREEZE_PAYMENTS_ENDPOINT_URL: 'https://payments.example.test',
    DATABREEZE_PAYMENTS_CREDENTIAL_REF: 'secret://development/payments/credential',
    DATABREEZE_PAYMENTS_WEBHOOK_SECRET_REF: 'secret://development/payments/webhook',
  },
  telemetry: {
    DATABREEZE_TELEMETRY_MODE: 'local',
    DATABREEZE_TELEMETRY_ENDPOINT_URL: 'http://127.0.0.1:4318',
  },
};

for (const [provider, providerEnvironment] of Object.entries(activeEnvironmentByProvider)) {
  test(`an override mode change replaces the environment ${provider} record`, () => {
    const config = loadRuntimeConfigV1({
      environment: { DATABREEZE_PROFILE: 'development', ...providerEnvironment },
      overrides: { providers: { [provider]: { mode: 'disabled' } } },
    });
    assert.deepEqual(config.providers[provider], { mode: 'disabled' });
  });
}

test('override mode replacement also closes object-storage and secrets variants', () => {
  expectSafeConfigFailure(
    () =>
      loadRuntimeConfigV1({
        environment: { DATABREEZE_PROFILE: 'development' },
        overrides: { providers: { objectStorage: { mode: 'remote' } } },
      }),
    'providers.objectStorage.endpointUrl',
    'required',
  );

  const secrets = loadRuntimeConfigV1({
    environment: {
      DATABREEZE_PROFILE: 'development',
      DATABREEZE_SECRETS_MODE: 'remote',
      DATABREEZE_SECRETS_ENDPOINT_URL: 'https://secrets.example.test',
      DATABREEZE_SECRETS_NAMESPACE: 'remote',
    },
    overrides: { providers: { secrets: { mode: 'memory', namespace: 'local' } } },
  });
  assert.deepEqual(secrets.providers.secrets, { mode: 'memory', namespace: 'local' });
});

test('configuration snapshots data properties without invoking accessors', () => {
  let getterCalls = 0;
  const environment = {};
  Object.defineProperty(environment, 'DATABREEZE_PROFILE', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('environment-getter-secret');
    },
  });

  expectSafeConfigFailure(
    () => loadRuntimeConfigV1({ environment }),
    'environment.invalid_input',
    'invalid_string',
    ['environment-getter-secret'],
  );
  assert.equal(getterCalls, 0);

  const overrides = { providers: {} };
  Object.defineProperty(overrides.providers, 'ai', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('override-getter-secret');
    },
  });
  expectSafeConfigFailure(
    () =>
      loadRuntimeConfigV1({
        environment: { DATABREEZE_PROFILE: 'development' },
        overrides,
      }),
    'overrides.invalid_input',
    'invalid_string',
    ['override-getter-secret'],
  );
  assert.equal(getterCalls, 0);
});

test('configuration converts proxy and malformed tuple failures to bounded redacted diagnostics', () => {
  const exposed = 'proxy-own-keys-secret';
  const environment = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error(exposed);
      },
    },
  );
  expectSafeConfigFailure(
    () => loadRuntimeConfigV1({ environment }),
    'environment.invalid_input',
    'invalid_string',
    [exposed],
  );

  expectSafeConfigFailure(
    () =>
      loadRuntimeConfigV1({
        environment: [
          ['DATABREEZE_PROFILE', 'development'],
          [42, { value: 'must-not-leak' }],
        ],
      }),
    'environment.invalid_entry',
    'invalid_string',
    ['must-not-leak'],
  );
});

test('configuration snapshots the load request itself and bounds repeated diagnostics', () => {
  let getterCalls = 0;
  const input = {};
  Object.defineProperty(input, 'environment', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('load-request-secret-X9Y8Z7');
    },
  });
  expectSafeConfigFailure(
    () => loadRuntimeConfigV1(input),
    'configuration.invalid_input',
    'invalid_string',
    ['load-request-secret-X9Y8Z7'],
  );
  assert.equal(getterCalls, 0);

  assert.throws(
    () =>
      loadRuntimeConfigV1({
        environment: [
          ['DATABREEZE_PROFILE', 'development'],
          ...Array.from({ length: 500 }, () => [42, 'invalid']),
        ],
      }),
    (error) => error instanceof ConfigValidationErrorV1 && error.issues.length <= 100,
  );
});

test('unknown attacker-controlled keys never become diagnostic field names', () => {
  const exposedEnvironmentKey = 'DATABREEZE_TOKEN_X9Y8Z7';
  expectSafeConfigFailure(
    () =>
      loadRuntimeConfigV1({
        environment: {
          DATABREEZE_PROFILE: 'development',
          [exposedEnvironmentKey]: 'raw-value-X9Y8Z7',
        },
      }),
    'environment.unknown_key',
    'unknown_key',
    [exposedEnvironmentKey, 'raw-value-X9Y8Z7'],
  );

  const exposedOverrideKey = 'privateKey_X9Y8Z7';
  expectSafeConfigFailure(
    () =>
      loadRuntimeConfigV1({
        environment: { DATABREEZE_PROFILE: 'development' },
        overrides: { providers: { ai: { mode: 'disabled', [exposedOverrideKey]: 'raw' } } },
      }),
    'overrides.unknown_key',
    'unknown_key',
    [exposedOverrideKey],
  );
});

for (const reference of [
  'secret://production/.',
  'secret://production/..',
  'secret://production/a//b',
  'secret://production/a/',
  'secret://production/a/../b',
  'secret://production/a/./b',
]) {
  test(`rejects non-canonical secret reference ${reference}`, () => {
    expectSafeConfigFailure(
      () =>
        loadRuntimeConfigV1({
          environment: {
            DATABREEZE_PROFILE: 'development',
            DATABREEZE_PUSH_MODE: 'remote',
            DATABREEZE_PUSH_ENDPOINT_URL: 'https://push.example.test',
            DATABREEZE_PUSH_APPLICATION_ID: 'databreeze',
            DATABREEZE_PUSH_CREDENTIAL_REF: reference,
          },
        }),
      'providers.push.credentialRef',
      'invalid_secret_reference',
      [reference.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')],
    );
  });
}

test('returns a canonical structured secret reference without a raw extractor', async () => {
  const runtime = await import('../src/runtime-config/v1.ts');
  const config = loadRuntimeConfigV1({
    environment: {
      DATABREEZE_PROFILE: 'development',
      DATABREEZE_PUSH_MODE: 'remote',
      DATABREEZE_PUSH_ENDPOINT_URL: 'https://push.example.test',
      DATABREEZE_PUSH_APPLICATION_ID: 'databreeze',
      DATABREEZE_PUSH_CREDENTIAL_REF: 'secret://development/push/credential#active',
    },
  });
  const reference = config.providers.push.credentialRef;
  assert.deepEqual(reference.pathSegments, ['push', 'credential']);
  assert.equal(reference.namespace, 'development');
  assert.equal(reference.version, 'active');
  assert.equal(runtime.secretReferenceHandleV1, undefined);
  assert.equal(runtime.createSecretReferenceV1, undefined);
  assert.equal(JSON.stringify(reference), '"[REDACTED_SECRET_REFERENCE]"');
});
