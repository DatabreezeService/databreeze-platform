import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import { inspect } from 'node:util';
import test from 'node:test';

const ports = await import('../src/v1.ts');

function capability(operation, idempotency = 'supported') {
  return {
    operation,
    idempotency,
    cancellation: 'cooperative',
    timeoutMs: 5_000,
    maxAttempts: 3,
  };
}

function validDescriptor(kind = 'object-storage') {
  return {
    kind,
    adapterKey: `${kind}-memory-v1`,
    capabilities: ports.PROVIDER_OPERATIONS_BY_KIND_V1[kind].map((operation) =>
      capability(
        operation,
        operation.includes('begin') || operation.includes('complete') ? 'required' : 'supported',
      ),
    ),
    dataHandling: {
      regions: ['local'],
      contentRetention: kind === 'secrets' ? 'none' : 'durable',
      ...(kind === 'secrets' ? {} : { maximumRetentionSeconds: 86_400 }),
      trainingUse: kind === 'ai' ? 'prohibited' : 'not_applicable',
    },
    resilience: { failover: 'manual', degradedBehavior: 'fail_closed' },
    exit: {
      statePortability:
        kind === 'ocr' || kind === 'ai' || kind === 'telemetry' ? 'none' : 'manifest',
      exportFormat:
        kind === 'ocr' || kind === 'ai' || kind === 'telemetry'
          ? 'not-applicable'
          : `databreeze-${kind}-exit-v1`,
      credentialRevocation: kind === 'secrets' ? 'supported' : 'not_applicable',
    },
  };
}

test('provider descriptors are recursively closed and kind-specific', () => {
  const rootExtra = { ...validDescriptor(), rawProviderConfig: 'must-not-survive' };
  assert.throws(() => ports.defineProviderDescriptorV1(rootExtra), ports.ProviderContractErrorV1);

  const nestedExtra = validDescriptor();
  nestedExtra.dataHandling.rawRetentionPolicy = 'must-not-survive';
  assert.throws(() => ports.defineProviderDescriptorV1(nestedExtra), ports.ProviderContractErrorV1);

  const wrongOperation = validDescriptor('email');
  wrongOperation.capabilities[0].operation = 'charge-customer';
  assert.throws(
    () => ports.defineProviderDescriptorV1(wrongOperation),
    ports.ProviderContractErrorV1,
  );
});

test('revoked proxies become stable provider contract failures', () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  assert.throws(() => ports.defineProviderDescriptorV1(proxy), ports.ProviderContractErrorV1);
  const failure = ports.createProviderFailureV1(proxy);
  assert.equal(failure.code, 'UNKNOWN');
  assert.equal(failure.operation, 'contract-validation');
});

test('provider descriptor and health coherence fails closed', () => {
  const noneWithRetention = validDescriptor('secrets');
  noneWithRetention.dataHandling.maximumRetentionSeconds = 60;
  assert.throws(
    () => ports.defineProviderDescriptorV1(noneWithRetention),
    ports.ProviderContractErrorV1,
  );

  assert.throws(
    () =>
      ports.defineProviderHealthV1({
        status: 'healthy',
        checkedAt: '2026-08-01T10:00:00.000Z',
        safeReasonCodes: ['UPSTREAM_FAILED'],
      }),
    ports.ProviderContractErrorV1,
  );
  assert.throws(
    () =>
      ports.defineProviderHealthV1({
        status: 'unavailable',
        checkedAt: '2026-08-01T10:00:00.000Z',
        safeReasonCodes: [],
      }),
    ports.ProviderContractErrorV1,
  );
});

test('provider operation errors are factory-only and ignore hostile causes', () => {
  assert.throws(
    () =>
      new ports.ProviderOperationErrorV1({
        code: 'UNKNOWN',
        operation: 'extract',
        retryable: false,
      }),
    TypeError,
  );

  let getterCalls = 0;
  const input = {
    code: 'RATE_LIMITED',
    providerKind: 'email',
    operation: 'send-template',
    retryable: true,
    retryAfterMs: 2_000,
  };
  Object.defineProperty(input, 'providerCause', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('provider-cause-secret-X9Y8Z7');
    },
  });
  const normalized = ports.createProviderFailureV1(input);
  assert.equal(getterCalls, 0);
  assert.doesNotMatch(inspect(normalized), /provider-cause-secret-X9Y8Z7/u);
  assert.doesNotMatch(JSON.stringify(normalized), /provider-cause-secret-X9Y8Z7/u);
  assert.equal(normalized.safeMessageKey, 'provider.rate_limited');

  const attackerControlled = ports.createProviderFailureV1({
    code: 'UNAVAILABLE',
    operation: 'attacker/raw-operation-X9Y8Z7',
    retryable: true,
  });
  assert.equal(attackerControlled.operation, 'contract-validation');
  assert.doesNotMatch(JSON.stringify(attackerControlled), /X9Y8Z7/u);
});

function invocation(overrides = {}) {
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

test('canonical contract timestamp validation rejects impossible calendar dates', () => {
  assert.throws(
    () => invocation({ deadlineAt: '2026-02-30T10:00:05.000Z' }),
    (error) => error instanceof ports.ProviderOperationErrorV1 && error.code === 'INVALID_REQUEST',
  );

  const context = invocation();
  assert.throws(
    () => ports.assertProviderInvocationActiveV1(context, '2026-02-30T10:00:00.000Z'),
    (error) =>
      error instanceof ports.ProviderOperationErrorV1 &&
      error.code === 'INVALID_REQUEST' &&
      error.retryable === false,
  );
});

test('leap-second deadlines expire across UTC date and year rollovers', () => {
  for (const [deadlineAt, now] of [
    ['2016-12-31T23:59:60.000Z', '2017-01-01T00:00:00.000Z'],
    ['2016-12-31T23:59:60.500Z', '2017-01-01T00:00:00.500Z'],
  ]) {
    const context = invocation({ deadlineAt });
    assert.throws(
      () => ports.assertProviderInvocationActiveV1(context, now),
      (error) =>
        error instanceof ports.ProviderOperationErrorV1 &&
        error.code === 'TIMEOUT' &&
        error.retryable === true,
    );
  }

  const active = invocation({ deadlineAt: '2016-12-31T23:59:60.500Z' });
  assert.doesNotThrow(() =>
    ports.assertProviderInvocationActiveV1(active, '2017-01-01T00:00:00.499Z'),
  );
});

test('invocation validation is closed and revalidates the whole context', () => {
  assert.throws(
    () => invocation({ unexpected: 'raw' }),
    (error) => error instanceof ports.ProviderOperationErrorV1 && error.code === 'INVALID_REQUEST',
  );

  const context = invocation();
  const malformed = { ...context, deadlineAt: 'not-a-date' };
  assert.throws(
    () => ports.assertProviderInvocationActiveV1(malformed, '2026-08-01T10:00:00.000Z'),
    (error) => error instanceof ports.ProviderOperationErrorV1 && error.code === 'INVALID_REQUEST',
  );
});

test('secret references and handles reveal no metadata without their scoped capability', () => {
  const capability = ports.createSecretReferenceCapabilityV1();
  const foreignCapability = ports.createSecretReferenceCapabilityV1();
  const reference = capability.issuer.issue({
    namespace: 'production',
    pathSegments: ['email', 'credential'],
    version: 'active',
  });
  const handle = ports.defineSecretHandleV1({ reference, expiresAt: '2026-08-01T10:05:00.000Z' });

  assert.equal(ports.isSecretReferenceCapabilityV1(capability), true);
  assert.equal(ports.isSecretReferenceIssuerV1(capability.issuer), true);
  assert.equal(ports.isSecretReferenceV1(reference), true);
  assert.equal(ports.isSecretReferenceForCapabilityV1(capability, reference), true);
  assert.equal(ports.isSecretReferenceForCapabilityV1(foreignCapability, reference), false);
  assert.equal(ports.assertSecretReferenceCapabilityV1(capability), capability);
  assert.equal(ports.assertSecretReferenceForCapabilityV1(capability, reference), reference);
  assert.deepEqual(capability.resolver.resolve(reference), {
    namespace: 'production',
    pathSegments: ['email', 'credential'],
    version: 'active',
  });
  assert.throws(() => foreignCapability.resolver.resolve(reference), ports.ProviderContractErrorV1);
  assert.deepEqual(Reflect.ownKeys(reference), []);
  assert.deepEqual(Reflect.ownKeys(handle), []);
  assert.deepEqual(Object.getOwnPropertyDescriptors(reference), {});
  assert.deepEqual(Object.getOwnPropertyDescriptors(handle), {});
  assert.equal(reference.namespace, undefined);
  assert.equal(reference.pathSegments, undefined);
  assert.equal(reference.version, undefined);
  assert.equal(handle.reference, undefined);
  assert.equal(handle.expiresAt, undefined);
  assert.equal(String(reference), '[REDACTED_SECRET_REFERENCE]');
  assert.equal(String(handle), '[REDACTED_SECRET_HANDLE]');
  assert.equal(inspect(reference), '[REDACTED_SECRET_REFERENCE]');
  assert.equal(inspect(handle), '[REDACTED_SECRET_HANDLE]');
  assert.equal(JSON.stringify(reference), '"[REDACTED_SECRET_REFERENCE]"');
  assert.equal(JSON.stringify(handle), '"[REDACTED_SECRET_HANDLE]"');
  assert.equal(ports.defineSecretReferenceV1, undefined);
  assert.equal(ports.secretHandleIdV1, undefined);
  assert.equal(ports.secretReferenceHandleV1, undefined);
  assert.doesNotMatch(JSON.stringify({ reference, handle }), /production|email|credential|active/u);
});

test('secret provenance checks reject hostile and revoked values without invoking traps', () => {
  const marker = 'secret-provenance-marker-X9Y8Z7';
  let trapCalls = 0;
  const hostile = new Proxy(
    {},
    {
      get() {
        trapCalls += 1;
        throw new Error(marker);
      },
      ownKeys() {
        trapCalls += 1;
        throw new Error(marker);
      },
    },
  );
  const { proxy: revoked, revoke } = Proxy.revocable({}, {});
  revoke();

  for (const value of [undefined, null, 42, {}, hostile, revoked]) {
    assert.equal(ports.isSecretReferenceCapabilityV1(value), false);
    assert.equal(ports.isSecretReferenceIssuerV1(value), false);
    assert.equal(ports.isSecretReferenceV1(value), false);
  }
  assert.equal(trapCalls, 0);
  assert.throws(
    () => ports.assertSecretReferenceCapabilityV1(hostile),
    (error) => {
      assert.ok(error instanceof ports.ProviderContractErrorV1);
      assert.doesNotMatch(String(error), new RegExp(marker, 'u'));
      assert.doesNotMatch(JSON.stringify(error), new RegExp(marker, 'u'));
      assert.doesNotMatch(inspect(error), new RegExp(marker, 'u'));
      return true;
    },
  );
});

test('base ports have no generic arbitrary state export', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/ports-v1.ts', import.meta.url), 'utf8'),
  );
  assert.doesNotMatch(source, /exportState\s*\(/u);
  assert.doesNotMatch(source, /ProviderStateExportResultV1/u);
  assert.match(source, /ObjectStorageExitManifestV1/u);
  assert.match(source, /SubscriptionMigrationManifestV1/u);
  assert.match(source, /SecretsPortabilityManifestV1/u);
});

test('payment exit manifests are closed and contain only subscription migration metadata', () => {
  const manifest = ports.defineSubscriptionMigrationManifestV1({
    manifestFormat: 'databreeze-subscription-migration-v1',
    entries: [
      {
        organizationId: 'org-1',
        planVersionId: 'plan-v1',
        providerCustomerRef: 'customer-1',
        providerSubscriptionRef: 'subscription-1',
        state: 'active',
        effectiveAt: '2026-08-01T10:00:00.000Z',
      },
    ],
    complete: true,
  });
  assert.equal(manifest.entries[0].state, 'active');
  assert.throws(
    () =>
      ports.defineSubscriptionMigrationManifestV1({
        ...manifest,
        paymentMethod: 'raw-payment-material',
      }),
    ports.ProviderContractErrorV1,
  );
});

test('delivery and secrets exit manifests are closed and content-safe', () => {
  const delivery = ports.defineDeliverySuppressionManifestV1({
    manifestFormat: 'databreeze-delivery-suppression-v1',
    entries: [
      {
        recipientHandle: 'recipient-1',
        reason: 'hard_bounce',
        occurredAt: '2026-08-01T10:00:00.000Z',
      },
    ],
    complete: true,
  });
  assert.equal(delivery.entries.length, 1);

  assert.throws(
    () =>
      ports.defineSecretsPortabilityManifestV1({
        manifestFormat: 'databreeze-secrets-portability-v1',
        referenceCount: 1,
        activeHandleCount: 0,
        revocation: 'automatic',
        portability: 'references-only',
        secretMaterial: 'must-not-survive',
      }),
    ports.ProviderContractErrorV1,
  );
});

test('object storage uses bounded resumable multipart requests for 20 GiB objects', () => {
  assert.equal(ports.OBJECT_STORAGE_MAX_OBJECT_BYTES_V1, 20 * 1024 * 1024 * 1024);
  const plan = ports.defineObjectStorageMultipartPlanV1({
    objectKey: 'workspace/object-1',
    expectedSha256: 'a'.repeat(64),
    expectedByteLength: 20 * 1024 * 1024 * 1024,
    partSizeBytes: 8 * 1024 * 1024,
  });
  assert.equal(plan.maximumParts, 2_560);

  const original = new Uint8Array([1, 2, 3]);
  const part = ports.defineObjectStoragePartV1({
    partNumber: 1,
    content: original,
    sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
  });
  original[0] = 9;
  const firstRead = part.readContent();
  firstRead[1] = 9;
  assert.deepEqual(part.readContent(), new Uint8Array([1, 2, 3]));
  assert.equal(part.byteLength, 3);
  assert.equal(part.content, undefined);
  assert.equal(createHash('sha256').update(part.readContent()).digest('hex'), part.sha256);
  assert.throws(
    () =>
      ports.defineObjectStoragePartV1({
        partNumber: 1,
        content: new Uint8Array(64 * 1024 * 1024 + 1),
        sha256: 'b'.repeat(64),
      }),
    ports.ProviderContractErrorV1,
  );
});

test('multipart completion is factory-bound, exact, ordered, contiguous, and content-bound', () => {
  const partSizeBytes = ports.OBJECT_STORAGE_MIN_PART_BYTES_V1;
  const firstContent = new Uint8Array(partSizeBytes);
  const secondContent = new Uint8Array([1, 2, 3]);
  const fullContent = new Uint8Array(partSizeBytes + secondContent.byteLength);
  fullContent.set(secondContent, partSizeBytes);
  const digest = (content) => createHash('sha256').update(content).digest('hex');
  const plan = ports.defineObjectStorageMultipartPlanV1({
    objectKey: 'workspace/object-completion',
    expectedSha256: digest(fullContent),
    expectedByteLength: fullContent.byteLength,
    partSizeBytes,
  });
  const upload = ports.defineObjectStorageMultipartUploadV1({
    uploadRef: 'upload-1',
    plan,
  });
  const firstPart = ports.defineObjectStoragePartV1({
    partNumber: 1,
    content: firstContent,
    sha256: digest(firstContent),
  });
  const secondPart = ports.defineObjectStoragePartV1({
    partNumber: 2,
    content: secondContent,
    sha256: digest(secondContent),
  });
  const firstReceipt = ports.defineObjectStorageUploadedPartV1({
    upload,
    part: firstPart,
    receiptRef: 'receipt-1',
  });
  const secondReceipt = ports.defineObjectStorageUploadedPartV1({
    upload,
    part: secondPart,
    receiptRef: 'receipt-2',
  });
  const context = invocation({
    operation: 'complete-multipart-upload',
    idempotencyKey: 'idem-complete',
  });
  const request = ports.defineObjectStorageCompleteMultipartRequestV1({
    context,
    upload,
    orderedParts: [firstReceipt, secondReceipt],
  });
  assert.equal(request.expectedSha256, plan.expectedSha256);
  assert.equal(request.expectedByteLength, plan.expectedByteLength);

  for (const orderedParts of [
    [secondReceipt, firstReceipt],
    [firstReceipt, firstReceipt],
    [firstReceipt],
  ]) {
    assert.throws(
      () => ports.defineObjectStorageCompleteMultipartRequestV1({ context, upload, orderedParts }),
      ports.ProviderContractErrorV1,
    );
  }

  const foreignUpload = ports.defineObjectStorageMultipartUploadV1({
    uploadRef: 'upload-2',
    plan,
  });
  assert.throws(
    () =>
      ports.defineObjectStorageCompleteMultipartRequestV1({
        context,
        upload: foreignUpload,
        orderedParts: [firstReceipt, secondReceipt],
      }),
    ports.ProviderContractErrorV1,
  );
  assert.throws(
    () =>
      ports.defineObjectStorageCompleteMultipartRequestV1({
        context,
        upload,
        orderedParts: [firstReceipt, secondReceipt],
        expectedSha256: 'f'.repeat(64),
      }),
    ports.ProviderContractErrorV1,
  );
});

test('contract arrays reject non-index string and symbol properties', () => {
  const capabilities = validDescriptor().capabilities.slice();
  capabilities[Symbol('hidden')] = capability('put-object');
  assert.throws(
    () => ports.defineProviderDescriptorV1({ ...validDescriptor(), capabilities }),
    ports.ProviderContractErrorV1,
  );

  const entries = [
    {
      objectKey: 'workspace/object-1',
      versionRef: 'version-1',
      sha256: 'a'.repeat(64),
      byteLength: 1,
    },
  ];
  entries.extra = 'must-not-survive';
  assert.throws(
    () =>
      ports.defineObjectStorageExitManifestV1({
        manifestFormat: 'databreeze-object-storage-exit-v1',
        entries,
        complete: true,
      }),
    ports.ProviderContractErrorV1,
  );
});

test('email and push ports include typed suppression operations', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/ports-v1.ts', import.meta.url), 'utf8'),
  );
  assert.match(source, /suppressRecipient\s*\(/u);
});
