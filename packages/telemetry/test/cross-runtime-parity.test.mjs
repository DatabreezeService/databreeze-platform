import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const packageRoot = new URL('../', import.meta.url);
const schema = JSON.parse(await readFile(new URL('schemas/v1.json', packageRoot), 'utf8'));
const typescriptSource = await readFile(new URL('src/v1.ts', packageRoot), 'utf8');
const pythonSource = await readFile(
  new URL('../../services/engine/src/databreeze_engine/telemetry.py', packageRoot),
  'utf8',
);
const androidSource = await readFile(
  new URL(
    '../../apps/android/app/src/main/java/com/databreeze/android/telemetry/TelemetryContract.kt',
    packageRoot,
  ),
  'utf8',
);

function quotedValues(section) {
  return [...section.matchAll(/"([^"\n]+)"|'([^'\n]+)'/gu)].map((match) => match[1] ?? match[2]);
}

function sourceList(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `missing ${end}`);
  return quotedValues(source.slice(startIndex, endIndex));
}

test('TypeScript, Python, and Android use the canonical safe attribute set', () => {
  const expected = [...schema.safeAttributeKeys].sort();
  assert.deepEqual(Object.keys(schema.properties.attributes.properties).sort(), expected);
  assert.deepEqual(
    sourceList(typescriptSource, 'SAFE_ATTRIBUTE_KEYS_V1', '] as const').sort(),
    expected,
  );
  assert.deepEqual(
    sourceList(pythonSource, 'SAFE_ATTRIBUTE_KEYS = frozenset(', '    }\n)').sort(),
    expected,
  );
  assert.deepEqual(
    sourceList(androidSource, 'SafeAttributeKeys = setOf(', '    )').sort(),
    expected,
  );
});

test('canonical record fields require correlation and preserve optional trace context', () => {
  assert.deepEqual(schema.required, [
    'schemaVersion',
    'timestamp',
    'level',
    'event',
    'component',
    'correlationId',
    'attributes',
  ]);
  assert.deepEqual(Object.keys(schema.properties).sort(), [
    'attributes',
    'component',
    'correlationId',
    'event',
    'level',
    'schemaVersion',
    'spanId',
    'timestamp',
    'traceFlags',
    'traceId',
  ]);
});
