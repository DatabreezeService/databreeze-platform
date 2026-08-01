import assert from 'node:assert/strict';

const telemetry = await import('../dist/v1.js');

assert.equal(telemetry.TELEMETRY_SCHEMA_VERSION_V1, 1);
assert.equal(typeof telemetry.sanitizeTelemetryAttributesV1, 'function');
assert.equal(typeof telemetry.createStructuredLoggerV1, 'function');
assert.equal(typeof telemetry.correlationHeadersV1, 'function');
