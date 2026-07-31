import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedPython = resolve(packageRoot, 'generated/python');
const pyproject = readFileSync(resolve(generatedPython, 'pyproject.toml'), 'utf8');
const dependenciesSection = /dependencies\s*=\s*\[([\s\S]*?)\]/u.exec(pyproject);
assert.ok(dependenciesSection, 'generated pyproject.toml must declare project dependencies');
const dependencies = [...dependenciesSection[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
assert.deepEqual(dependencies, [
  'pydantic==2.13.4',
  'rfc3339-validator==0.1.4',
  'rfc3986-validator==0.1.1',
]);

const cases = [
  { format: 'uri-reference', value: 'abc]' },
  { format: 'uri-reference', value: 'http://example.com/[]' },
  { format: 'uri-reference', value: 'foo#bar#baz' },
  { format: 'date-time', value: '2016-12-31T23:59:60Z' },
  { format: 'date-time', value: '2016-12-31T12:34:60Z' },
  { format: 'date-time', value: '2016-12-31T23:60:00Z' },
  { format: 'uuid', value: 'urn:uuid:018f47f2-5ee1-7d8d-a4c2-8f0e19e4cc01' },
];
const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
const ajvValidators = {
  'date-time': ajv.compile({ type: 'string', format: 'date-time', pattern: 'Z$' }),
  'uri-reference': ajv.compile({ type: 'string', format: 'uri-reference' }),
  uuid: ajv.compile({ type: 'string', format: 'uuid' }),
};
const expected = cases.map(({ format, value }) => ({
  accepted: ajvValidators[format](value),
  returnedOriginal: ajvValidators[format](value) ? true : null,
}));
assert.deepEqual(
  expected.map(({ accepted }) => accepted),
  [false, false, false, true, false, false, true],
  'canonical Ajv expectations changed',
);

const pythonProgram = [
  'import importlib.util',
  'import json',
  'import sys',
  'sys.dont_write_bytecode = True',
  'sys.path.insert(0, sys.argv[1])',
  'spec = importlib.util.spec_from_file_location("generated_validation", sys.argv[2])',
  'module = importlib.util.module_from_spec(spec)',
  'spec.loader.exec_module(module)',
  'cases = json.loads(sys.argv[3])',
  'function_names = {"date-time": "validate_utc_timestamp", "uri-reference": "validate_uri_reference", "uuid": "validate_uuid"}',
  'results = []',
  'for case in cases:',
  '    function = getattr(module, function_names[case["format"]])',
  '    try:',
  '        result = function(case["value"])',
  '        results.append({"accepted": True, "returnedOriginal": result == case["value"]})',
  '    except (TypeError, ValueError):',
  '        results.append({"accepted": False, "returnedOriginal": None})',
  'print(json.dumps(results))',
].join('\n');

const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'databreeze-python-formats-'));
try {
  const dependenciesRoot = resolve(temporaryRoot, 'site-packages');
  const install = spawnSync(
    'python',
    [
      '-m',
      'pip',
      'install',
      '--disable-pip-version-check',
      '--quiet',
      '--target',
      dependenciesRoot,
      ...dependencies,
    ],
    { cwd: packageRoot, encoding: 'utf8' },
  );
  assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);

  const validationPath = resolve(generatedPython, 'databreeze_contracts/v1/_validation.py');
  const probe = spawnSync(
    'python',
    ['-c', pythonProgram, dependenciesRoot, validationPath, JSON.stringify(cases)],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    },
  );
  assert.equal(probe.status, 0, `${probe.stdout}\n${probe.stderr}`);
  assert.deepEqual(JSON.parse(probe.stdout), expected);
  console.log(`Python format runtime parity probe passed for ${cases.length} cases.`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
