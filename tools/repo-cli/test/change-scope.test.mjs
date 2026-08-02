import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('infrastructure changes are shared quality-gate inputs', () => {
  const source = readFileSync(
    path.join(repositoryRoot, 'tools', 'repo-cli', 'src', 'detect-change-scope.mjs'),
    'utf8',
  );
  assert.match(source, /'infrastructure\/'/u);
  assert.match(source, /infrastructure: matches\(\['infrastructure\/'\]\)/u);
});
