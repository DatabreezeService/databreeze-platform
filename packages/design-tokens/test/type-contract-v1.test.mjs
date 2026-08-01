import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const typeScriptCli = resolve(packageRoot, '../../node_modules/typescript/bin/tsc');

test('the public TypeScript contract is deeply readonly and literal-discriminated', () => {
  const result = spawnSync(
    process.execPath,
    [
      typeScriptCli,
      '--noEmit',
      '--allowImportingTsExtensions',
      '--strict',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2024',
      'test/type-contract-v1.ts',
    ],
    { cwd: packageRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
