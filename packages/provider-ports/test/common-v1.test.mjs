import assert from 'node:assert/strict';
import test from 'node:test';

const ports = await import('../src/v1.ts');

function validDescriptor(kind = 'object-storage') {
  return {
    kind,
    adapterKey: 'in-memory-v1',
    capabilities: [
      {
        operation: 'put-immutable',
        idempotency: 'required',
        cancellation: 'cooperative',
        timeoutMs: 5_000,
        maxAttempts: 3,
      },
    ],
    dataHandling: {
      regions: ['local'],
      contentRetention: 'durable',
      maximumRetentionSeconds: 86_400,
      trainingUse: 'not_applicable',
    },
    resilience: {
      failover: 'manual',
      degradedBehavior: 'fail_closed',
    },
    exit: {
      statePortability: 'full',
      exportFormat: 'databreeze-object-manifest-v1',
      credentialRevocation: 'supported',
    },
  };
}

test('defines and deeply freezes complete provider metadata', () => {
  const descriptor = ports.defineProviderDescriptorV1(validDescriptor());

  assert.equal(descriptor.schemaVersion, 1);
  assert.equal(descriptor.kind, 'object-storage');
  assert.equal(descriptor.capabilities[0].operation, 'put-immutable');
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
  const error = ports.createProviderFailureV1({
    code: 'RATE_LIMITED',
    providerKind: 'email',
    operation: 'send-template',
    retryable: true,
    retryAfterMs: 2_000,
    safeMessageKey: 'provider.rate_limited',
    providerCause: new Error(secret),
  });

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

test('creates immutable invocation metadata with deadline, timeout, cancellation, and idempotency', () => {
  const context = ports.createProviderInvocationContextV1({
    operationId: 'op-0001',
    correlationId: 'corr-0001',
    deadlineAt: '2026-08-01T10:00:05.000Z',
    timeoutMs: 5_000,
    idempotencyKey: 'idem-0001',
    abortSignal: { aborted: false },
  });

  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.abortSignal), true);
  assert.doesNotThrow(() =>
    ports.assertProviderInvocationActiveV1(context, '2026-08-01T10:00:00.000Z'),
  );
  assert.doesNotThrow(() => ports.requireProviderIdempotencyV1(context));
});

test('rejects an aborted invocation with a normalized non-retryable error', () => {
  const context = ports.createProviderInvocationContextV1({
    operationId: 'op-aborted',
    correlationId: 'corr-aborted',
    deadlineAt: '2026-08-01T10:00:05.000Z',
    timeoutMs: 5_000,
    abortSignal: { aborted: true },
  });

  assert.throws(
    () => ports.assertProviderInvocationActiveV1(context, '2026-08-01T10:00:00.000Z'),
    (error) =>
      error instanceof ports.ProviderOperationErrorV1 &&
      error.code === 'ABORTED' &&
      error.retryable === false,
  );
});

test('observes cancellation that occurs after invocation context creation', () => {
  const abortSignal = { aborted: false };
  const context = ports.createProviderInvocationContextV1({
    operationId: 'op-later-abort',
    correlationId: 'corr-later-abort',
    deadlineAt: '2026-08-01T10:00:05.000Z',
    timeoutMs: 5_000,
    abortSignal,
  });

  abortSignal.aborted = true;

  assert.throws(
    () => ports.assertProviderInvocationActiveV1(context, '2026-08-01T10:00:00.000Z'),
    (error) => error instanceof ports.ProviderOperationErrorV1 && error.code === 'ABORTED',
  );
});

test('rejects an expired invocation with a normalized timeout error', () => {
  const context = ports.createProviderInvocationContextV1({
    operationId: 'op-timeout',
    correlationId: 'corr-timeout',
    deadlineAt: '2026-08-01T10:00:05.000Z',
    timeoutMs: 5_000,
    abortSignal: { aborted: false },
  });

  assert.throws(
    () => ports.assertProviderInvocationActiveV1(context, '2026-08-01T10:00:05.000Z'),
    (error) =>
      error instanceof ports.ProviderOperationErrorV1 &&
      error.code === 'TIMEOUT' &&
      error.retryable === true,
  );
});

test('requires idempotency only when an operation declares it', () => {
  const context = ports.createProviderInvocationContextV1({
    operationId: 'op-no-idempotency',
    correlationId: 'corr-no-idempotency',
    deadlineAt: '2026-08-01T10:00:05.000Z',
    timeoutMs: 5_000,
    abortSignal: { aborted: false },
  });

  assert.throws(
    () => ports.requireProviderIdempotencyV1(context),
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

test('creates opaque secret handles that redact serialization', () => {
  const handle = ports.defineSecretHandleV1({
    handleId: 'opaque-secret-handle',
    expiresAt: '2026-08-01T10:05:00.000Z',
  });

  assert.equal(String(handle), '[REDACTED_SECRET_HANDLE]');
  assert.equal(JSON.stringify(handle), '"[REDACTED_SECRET_HANDLE]"');
  assert.equal(ports.secretHandleIdV1(handle), 'opaque-secret-handle');
});
