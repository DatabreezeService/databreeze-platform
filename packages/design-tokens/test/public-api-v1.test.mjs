import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('design tokens expose only versioned TypeScript CSS and Android contracts', async () => {
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.exports['.'], undefined);
  assert.deepEqual(manifest.exports['./v1'], {
    types: './tokens/generated/typescript/v1.ts',
    import: './dist/v1.js',
  });
  assert.equal(manifest.exports['./css/v1'], './tokens/generated/css/v1.css');
  assert.equal(
    manifest.exports['./android/v1'],
    './tokens/generated/android/values/databreeze_tokens_v1.xml',
  );

  const generated = await import('../tokens/generated/typescript/v1.ts');
  assert.equal(generated.designTokenVersion, 1);
  assert.ok(Object.isFrozen(generated.designTokenEntriesV1));
  assert.equal(
    generated.designTokenEntriesV1.find((token) => token.name === 'sizing.controlMinimum').value,
    44,
  );
});
