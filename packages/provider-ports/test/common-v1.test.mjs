import assert from 'node:assert/strict';
import test from 'node:test';

const ports = await import('../src/v1.ts');

function validDescriptor(kind = 'object-storage') {
  return {
    kind,
    adapterKey: 'in-memory-v1',
    capabilities: ports.PROVIDER_OPERATIONS_BY_KIND_V1[kind].map((operation) => ({
      operation,
      idempotency: 'required',
      cancellation: 'cooperative',
      timeoutMs: 5_000,
      maxAttempts: 3,
    })),
    dataHandling: {
      regions: ['local'],
      contentRetention: kind === 'secrets' ? 'none' : 'durable',
      ...(kind === 'secrets' ? {} : { maximumRetentionSeconds: 86_400 }),
      trainingUse: kind === 'ai' ? 'prohibited' : 'not_applicable',
    },
    resilience: {
      failover: 'manual',
      degradedBehavior: 'fail_closed',
    },
    exit: {
      statePortability: kind === 'ocr' || kind === 'ai' || kind === 'telemetry' ? 'none' : 'full',
      exportFormat:
        kind === 'ocr' || kind === 'ai' || kind === 'telemetry'
          ? 'not-applicable'
          : `databreeze-${kind}-manifest-v1`,
      credentialRevocation: kind === 'secrets' ? 'supported' : 'not_applicable',
    },
  };
}

test('defines and deeply freezes complete provider metadata', () => {
  const descriptor = ports.defineProviderDescriptorV1(validDescriptor());

  assert.equal(descriptor.schemaVersion, 1);
  assert.equal(descriptor.kind, 'object-storage');
  assert.equal(descriptor.capabilities[0].operation, 'begin-multipart-upload');
  assert.equal(Object.isFrozen(descriptor), true);
  assert.equal(Object.isFrozen(descriptor.capabilities), true);
  assert.equal(Object.isFrozen(descriptor.dataHandling.regions), true);
  assert.throws(() => descriptor.capabilities.push({}), TypeError);
});

test('rejects duplicate capability operations', () => {
  const input = validDescriptor();
  input.capabilities.push({ ...input.capabilities[0] });

  assert.throws(
    () => ports.defineProviderDescriptorV1(input),
    (error) =>
      error instanceof ports.ProviderContractErrorV1 && error.code === 'INVALID_DESCRIPTOR',
  );
});

test('rejects incomplete retry, data-handling, resilience, and exit metadata', () => {
  const input = validDescriptor();
  delete input.capabilities[0].timeoutMs;
  delete input.dataHandling.trainingUse;
  delete input.resilience.degradedBehavior;
  delete input.exit.statePortability;

  assert.throws(
    () => ports.defineProviderDescriptorV1(input),
    (error) =>
      error instanceof ports.ProviderContractErrorV1 && error.code === 'INVALID_DESCRIPTOR',
  );
});

test('normalizes provider failures without retaining provider causes or secret values', () => {
  const secret = 'provider-token-that-must-not-escape';
  const input = {
    code: 'RATE_LIMITED',
    providerKind: 'email',
    operation: 'send-template',
    retryable: true,
    retryAfterMs: 2_000,
  };
  Object.defineProperty(input, 'providerCause', { value: new Error(secret), enumerable: true });
  const error = ports.createProviderFailureV1(input);

  assert.ok(error instanceof ports.ProviderOperationErrorV1);
  assert.deepEqual(JSON.parse(JSON.stringify(error)), {
    name: 'ProviderOperationErrorV1',
    code: 'RATE_LIMITED',
    providerKind: 'email',
    operation: 'send-template',
    retryable: true,
    retryAfterMs: 2_000,
    safeMessageKey: 'provider.rate_limited',
  });
  assert.doesNotMatch(error.message, new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(error), new RegExp(secret));
  assert.equal('cause' in error, false);
});

function context(overrides = {}) {
  return ports.createProviderInvocationContextV1({
    operation: 'extract',
    operationId: 'op-0001',
    correlationId: 'corr-0001',
    deadlineAt: '2026-08-01T10:00:05.000Z',
    timeoutMs: 5_000,
    abortSignal: { aborted: false },
    ...overrides,
  });
}

test('creates immutable invocation metadata with deadline, timeout, cancellation, and idempotency', () => {
  const invocation = context({ idempotencyKey: 'idem-0001' });
  assert.equal(Object.isFrozen(invocation), true);
  assert.equal(Object.isFrozen(invocation.abortSignal), true);
  assert.doesNotThrow(() =>
    ports.assertProviderInvocationActiveV1(invocation, '2026-08-01T10:00:00.000Z'),
  );
  assert.equal(ports.requireProviderIdempotencyV1(invocation), 'idem-0001');
});

test('rejects an aborted invocation with a normalized non-retryable error', () => {
  const invocation = context({ abortSignal: { aborted: true } });
  assert.throws(
    () => ports.assertProviderInvocationActiveV1(invocation, '2026-08-01T10:00:00.000Z'),
    (error) =>
      error instanceof ports.ProviderOperationErrorV1 &&
      error.code === 'ABORTED' &&
      error.retryable === false,
  );
});

test('observes cancellation that occurs after invocation context creation', () => {
  const abortSignal = { aborted: false };
  const invocation = context({ abortSignal });
  abortSignal.aborted = true;
  assert.throws(
    () => ports.assertProviderInvocationActiveV1(invocation, '2026-08-01T10:00:00.000Z'),
    (error) => error instanceof ports.ProviderOperationErrorV1 && error.code === 'ABORTED',
  );
});

test('rejects an expired invocation with a normalized timeout error', () => {
  const invocation = context();
  assert.throws(
    () => ports.assertProviderInvocationActiveV1(invocation, '2026-08-01T10:00:05.000Z'),
    (error) =>
      error instanceof ports.ProviderOperationErrorV1 &&
      error.code === 'TIMEOUT' &&
      error.retryable === true,
  );
});

test('requires an idempotency key at mutating adapter boundaries', () => {
  assert.throws(
    () => ports.requireProviderIdempotencyV1(context()),
    (error) => error instanceof ports.ProviderOperationErrorV1 && error.code === 'INVALID_REQUEST',
  );
});

test('defines provider health with safe reason codes and no raw detail channel', () => {
  const health = ports.defineProviderHealthV1({
    status: 'degraded',
    checkedAt: '2026-08-01T10:00:00.000Z',
    latencyMs: 125,
    safeReasonCodes: ['UPSTREAM_RATE_LIMITED'],
  });
  assert.deepEqual(health, {
    status: 'degraded',
    checkedAt: '2026-08-01T10:00:00.000Z',
    latencyMs: 125,
    safeReasonCodes: ['UPSTREAM_RATE_LIMITED'],
  });
  assert.equal(Object.isFrozen(health.safeReasonCodes), true);
});

test('creates opaque secret handles that redact serialization and expose no material or raw IDs', () => {
  const reference = ports.createSecretReferenceCapabilityV1().issuer.issue({
    namespace: 'production',
    pathSegments: ['email', 'credential'],
  });
  const handle = ports.defineSecretHandleV1({
    reference,
    expiresAt: '2026-08-01T10:05:00.000Z',
  });
  assert.equal(String(handle), '[REDACTED_SECRET_HANDLE]');
  assert.equal(JSON.stringify(handle), '"[REDACTED_SECRET_HANDLE]"');
  assert.equal(ports.secretHandleIdV1, undefined);
});
