import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { resolvePythonInterpreter } from './test-runtime-tools.mjs';

test('resolves an available Python 3 interpreter for contract probes', () => {
  const interpreter = resolvePythonInterpreter();
  const result = spawnSync(interpreter, ['--version'], { encoding: 'utf8' });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}${result.stderr}`, /^Python 3\./u);
});

test('reports every attempted interpreter when Python 3 is unavailable', () => {
  assert.throws(
    () => resolvePythonInterpreter(['databreeze-missing-python-a', 'databreeze-missing-python-b']),
    /Python 3 interpreter is required; tried: databreeze-missing-python-a, databreeze-missing-python-b/u,
  );
});
