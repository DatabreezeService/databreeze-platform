import assert from 'node:assert/strict';
import test from 'node:test';

import { ConfigValidationErrorV1, loadRuntimeConfigV1 } from '../src/runtime-config/v1.ts';
import { createSecretReferenceCapabilityV1 } from '@databreeze/provider-ports/v1';

const secretReferenceCapability = createSecretReferenceCapabilityV1();

function nonLocalEnvironment(profile) {
  return [
    ['DATABREEZE_PROFILE', profile],
    ['DATABREEZE_OBJECT_STORAGE_MODE', 'remote'],
    ['DATABREEZE_OBJECT_STORAGE_ENDPOINT_URL', 'https://objects.example.test'],
    ['DATABREEZE_OBJECT_STORAGE_REGION', 'sg-1'],
    ['DATABREEZE_OBJECT_STORAGE_BUCKET', `databreeze-${profile}`],
    ['DATABREEZE_OBJECT_STORAGE_CREDENTIAL_REF', `secret://${profile}/object-storage`],
    ['DATABREEZE_OBJECT_STORAGE_FORCE_PATH_STYLE', 'false'],
    ['DATABREEZE_EMAIL_MODE', 'disabled'],
    ['DATABREEZE_PUSH_MODE', 'disabled'],
    ['DATABREEZE_OCR_MODE', 'disabled'],
    ['DATABREEZE_AI_MODE', 'disabled'],
    ['DATABREEZE_PAYMENTS_MODE', 'disabled'],
    ['DATABREEZE_TELEMETRY_MODE', 'disabled'],
    ['DATABREEZE_SECRETS_MODE', 'remote'],
    ['DATABREEZE_SECRETS_ENDPOINT_URL', 'https://secrets.example.test'],
    ['DATABREEZE_SECRETS_NAMESPACE', `databreeze-${profile}`],
  ];
}

function expectConfigIssue(action, expectedPath, expectedCode) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof ConfigValidationErrorV1);
    assert.ok(
      error.issues.some((issue) => issue.path === expectedPath && issue.code === expectedCode),
      `expected ${expectedCode} at ${expectedPath}, received ${JSON.stringify(error.issues)}`,
    );
    return true;
  });
}

test('requires an explicit runtime profile', () => {
  expectConfigIssue(() => loadRuntimeConfigV1({ environment: [] }), 'profile', 'required');
});

test('loads safe development defaults only after development is explicit', () => {
  const config = loadRuntimeConfigV1({
    environment: [['DATABREEZE_PROFILE', 'development']],
  });

  assert.equal(config.profile, 'development');
  assert.deepEqual(config.providerPolicy, { timeoutMs: 10_000, maxAttempts: 3 });
  assert.deepEqual(config.providers.objectStorage, {
    mode: 'local',
    endpointUrl: 'http://127.0.0.1:9000',
    region: 'local',
    bucket: 'databreeze-development',
    forcePathStyle: true,
  });
  assert.equal(config.providers.email.mode, 'local');
  assert.equal(config.providers.push.mode, 'disabled');
  assert.equal(config.providers.ocr.mode, 'disabled');
  assert.equal(config.providers.ai.mode, 'disabled');
  assert.equal(config.providers.payments.mode, 'disabled');
  assert.equal(config.providers.telemetry.mode, 'local');
  assert.deepEqual(config.providers.secrets, { mode: 'memory', namespace: 'development' });
});

test('loads deterministic test defaults distinct from development', () => {
  const config = loadRuntimeConfigV1({ environment: { DATABREEZE_PROFILE: 'test' } });

  assert.equal(config.profile, 'test');
  assert.equal(config.providers.objectStorage.bucket, 'databreeze-test');
  assert.equal(config.providers.email.mode, 'disabled');
  assert.equal(config.providers.telemetry.mode, 'disabled');
  assert.deepEqual(config.providers.secrets, { mode: 'memory', namespace: 'test' });
});

for (const profile of ['preview', 'staging', 'production']) {
  test(`loads an explicitly complete ${profile} profile`, () => {
    const config = loadRuntimeConfigV1({
      environment: nonLocalEnvironment(profile),
      secretReferenceCapability,
    });

    assert.equal(config.profile, profile);
    assert.equal(config.providers.objectStorage.mode, 'remote');
    assert.equal(config.providers.objectStorage.bucket, `databreeze-${profile}`);
    assert.deepEqual(
      secretReferenceCapability.resolver.resolve(config.providers.objectStorage.credentialRef),
      { namespace: profile, pathSegments: ['object-storage'] },
    );
    assert.deepEqual(config.providers.secrets, {
      mode: 'remote',
      endpointUrl: 'https://secrets.example.test',
      namespace: `databreeze-${profile}`,
    });
  });
}

for (const profile of ['preview', 'staging', 'production']) {
  test(`${profile} fails closed when provider selections are absent`, () => {
    expectConfigIssue(
      () => loadRuntimeConfigV1({ environment: [['DATABREEZE_PROFILE', profile]] }),
      'providers.objectStorage.mode',
      'required',
    );
  });
}

test('applies explicit overrides over environment and environment over local defaults', () => {
  const config = loadRuntimeConfigV1({
    environment: [
      ['DATABREEZE_PROFILE', 'development'],
      ['DATABREEZE_PROVIDER_TIMEOUT_MS', '2000'],
      ['DATABREEZE_EMAIL_MODE', 'disabled'],
    ],
    overrides: {
      providerPolicy: { timeoutMs: 3_000, maxAttempts: 4 },
      providers: {
        email: {
          mode: 'local',
          endpointUrl: 'smtp://localhost:2525',
          fromAddress: 'notify@databreeze.local',
        },
      },
    },
  });

  assert.deepEqual(config.providerPolicy, { timeoutMs: 3_000, maxAttempts: 4 });
  assert.deepEqual(config.providers.email, {
    mode: 'local',
    endpointUrl: 'smtp://localhost:2525',
    fromAddress: 'notify@databreeze.local',
  });
});

test('rejects duplicate environment entries instead of choosing one', () => {
  expectConfigIssue(
    () =>
      loadRuntimeConfigV1({
        environment: [
          ['DATABREEZE_PROFILE', 'development'],
          ['DATABREEZE_PROFILE', 'production'],
        ],
      }),
    'environment.duplicate_key',
    'duplicate',
  );
});

test('rejects unknown DataBreeze environment keys but ignores host environment keys', () => {
  expectConfigIssue(
    () =>
      loadRuntimeConfigV1({
        environment: [
          ['PATH', 'not-product-configuration'],
          ['DATABREEZE_PROFILE', 'development'],
          ['DATABREEZE_UNKNOWN_OPTION', 'true'],
        ],
      }),
    'environment.unknown_key',
    'unknown_key',
  );
});

test('rejects unknown nested override keys', () => {
  expectConfigIssue(
    () =>
      loadRuntimeConfigV1({
        environment: [['DATABREEZE_PROFILE', 'development']],
        overrides: { providers: { ai: { mode: 'disabled', apiKey: 'not-allowed' } } },
      }),
    'overrides.unknown_key',
    'unknown_key',
  );
});

for (const value of ['1e3', '01000', ' 1000', '1000 ']) {
  test(`rejects ambiguous integer coercion from ${JSON.stringify(value)}`, () => {
    expectConfigIssue(
      () =>
        loadRuntimeConfigV1({
          environment: [
            ['DATABREEZE_PROFILE', 'development'],
            ['DATABREEZE_PROVIDER_TIMEOUT_MS', value],
          ],
        }),
      'providerPolicy.timeoutMs',
      'invalid_integer',
    );
  });
}

for (const value of ['1', 'TRUE', 'yes', 'false ']) {
  test(`rejects ambiguous boolean coercion from ${JSON.stringify(value)}`, () => {
    expectConfigIssue(
      () =>
        loadRuntimeConfigV1({
          environment: [
            ['DATABREEZE_PROFILE', 'development'],
            ['DATABREEZE_OBJECT_STORAGE_FORCE_PATH_STYLE', value],
          ],
        }),
      'providers.objectStorage.forcePathStyle',
      'invalid_boolean',
    );
  });
}

test('rejects non-loopback cleartext origins even in development', () => {
  expectConfigIssue(
    () =>
      loadRuntimeConfigV1({
        environment: [
          ['DATABREEZE_PROFILE', 'development'],
          ['DATABREEZE_OBJECT_STORAGE_ENDPOINT_URL', 'http://objects.example.test'],
        ],
      }),
    'providers.objectStorage.endpointUrl',
    'unsafe_url',
  );
});

test('rejects cleartext origins in production even when loopback', () => {
  const environment = nonLocalEnvironment('production').map(([key, value]) =>
    key === 'DATABREEZE_OBJECT_STORAGE_ENDPOINT_URL'
      ? [key, 'http://127.0.0.1:9000']
      : [key, value],
  );

  expectConfigIssue(
    () => loadRuntimeConfigV1({ environment }),
    'providers.objectStorage.endpointUrl',
    'unsafe_url',
  );
});

test('rejects URL credentials without echoing them in the error', () => {
  const exposed = 'top-secret-password';

  assert.throws(
    () =>
      loadRuntimeConfigV1({
        environment: [
          ['DATABREEZE_PROFILE', 'development'],
          ['DATABREEZE_OBJECT_STORAGE_ENDPOINT_URL', `http://user:${exposed}@127.0.0.1:9000`],
        ],
      }),
    (error) => {
      assert.ok(error instanceof ConfigValidationErrorV1);
      assert.doesNotMatch(error.message, new RegExp(exposed));
      assert.doesNotMatch(JSON.stringify(error), new RegExp(exposed));
      return true;
    },
  );
});

test('rejects endpoint query credentials without echoing them in the error', () => {
  const exposed = 'query-token-that-must-not-escape';

  assert.throws(
    () =>
      loadRuntimeConfigV1({
        environment: [
          ['DATABREEZE_PROFILE', 'development'],
          ['DATABREEZE_OBJECT_STORAGE_ENDPOINT_URL', `http://127.0.0.1:9000?token=${exposed}`],
        ],
      }),
    (error) => {
      assert.ok(error instanceof ConfigValidationErrorV1);
      assert.ok(
        error.issues.some(
          (issue) =>
            issue.path === 'providers.objectStorage.endpointUrl' && issue.code === 'unsafe_url',
        ),
      );
      assert.doesNotMatch(error.message, new RegExp(exposed));
      assert.doesNotMatch(JSON.stringify(error), new RegExp(exposed));
      return true;
    },
  );
});

for (const reference of ['', 'super-secret-value', 'secret://production/changeme']) {
  test(`rejects empty, raw, or placeholder credential input ${JSON.stringify(reference)}`, () => {
    const environment = nonLocalEnvironment('production').map(([key, value]) =>
      key === 'DATABREEZE_OBJECT_STORAGE_CREDENTIAL_REF' ? [key, reference] : [key, value],
    );

    assert.throws(
      () => loadRuntimeConfigV1({ environment }),
      (error) => {
        assert.ok(error instanceof ConfigValidationErrorV1);
        assert.ok(
          error.issues.some(
            (issue) =>
              issue.path === 'providers.objectStorage.credentialRef' &&
              issue.code === 'invalid_secret_reference',
          ),
        );
        if (reference.length > 0) {
          assert.doesNotMatch(error.message, new RegExp(reference.replaceAll('/', '\\/')));
          assert.doesNotMatch(JSON.stringify(error), new RegExp(reference.replaceAll('/', '\\/')));
        }
        return true;
      },
    );
  });
}

test('redacts valid secret references during string and JSON serialization', () => {
  const config = loadRuntimeConfigV1({
    environment: nonLocalEnvironment('production'),
    secretReferenceCapability,
  });
  const reference = config.providers.objectStorage.credentialRef;

  assert.equal(String(reference), '[REDACTED_SECRET_REFERENCE]');
  assert.equal(JSON.stringify(reference), '"[REDACTED_SECRET_REFERENCE]"');
  assert.doesNotMatch(JSON.stringify(config), /secret:\/\//);
});

test('returns a deeply immutable configuration graph', () => {
  const config = loadRuntimeConfigV1({
    environment: [['DATABREEZE_PROFILE', 'development']],
  });

  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.providers), true);
  assert.equal(Object.isFrozen(config.providers.objectStorage), true);
  assert.equal(Object.isFrozen(config.providerPolicy), true);
  assert.throws(() => {
    config.providers.objectStorage.bucket = 'mutated';
  }, TypeError);
  assert.equal(config.providers.objectStorage.bucket, 'databreeze-development');
});

test('rejects settings on a provider explicitly disabled in a strict profile', () => {
  const environment = [
    ...nonLocalEnvironment('staging'),
    ['DATABREEZE_AI_ENDPOINT_URL', 'https://ai.example.test'],
  ];

  expectConfigIssue(
    () => loadRuntimeConfigV1({ environment }),
    'providers.ai.endpointUrl',
    'forbidden_when_disabled',
  );
});
