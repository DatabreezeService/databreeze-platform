import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkCiPolicy } from '../src/check-ci-policy.mjs';

test('repository workflows are present, pinned, and least privilege', () => {
  assert.deepEqual(checkCiPolicy(process.cwd()), { workflowCount: 3 });
});

test('CI policy requires checkout credentials to be discarded', () => {
  const workflow = fs.readFileSync(path.join(process.cwd(), '.github/workflows/quality.yml'), 'utf8');
  assert.match(workflow, /persist-credentials:\s*false/u);
});

test('CI policy rejects floating actions and pull request target execution', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'databreeze-ci-policy-'));
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  const workflows = {
    'quality.yml': 'name: q\npermissions:\n  contents: read\njobs: {}\n',
    'security.yml': [
      'name: s',
      'permissions:',
      '  contents: read',
      'jobs:',
      '  scan:',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - run: pnpm audit && check-secret-patterns.mjs check-license-policy.mjs check-container-policy.mjs generate-sbom.mjs',
    ].join('\n'),
    'release.yml':
      'name: r\npermissions:\n  contents: read\n  id-token: write\n  pull-requests: write\nrun: generate-provenance.mjs\n',
  };
  for (const [name, text] of Object.entries(workflows))
    fs.writeFileSync(path.join(root, '.github/workflows', name), text);
  assert.throws(() => checkCiPolicy(root), /unpinned action/u);
});

test('CI policy rejects runner jobs without a timeout', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'databreeze-ci-timeout-'));
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  const checkout = 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683';
  const workflows = {
    'quality.yml': [
      'name: q',
      'permissions:',
      '  contents: read',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-24.04',
      '    steps:',
      `      - uses: ${checkout}`,
      '        with:',
      '          persist-credentials: false',
    ].join('\n'),
    'security.yml': [
      'name: s',
      'permissions:',
      '  contents: read',
      'jobs:',
      '  scan:',
      '    runs-on: ubuntu-24.04',
      '    timeout-minutes: 10',
      '    steps:',
      `      - uses: ${checkout}`,
      '        with:',
      '          persist-credentials: false',
      '      - run: pnpm audit && check-secret-patterns.mjs check-license-policy.mjs check-container-policy.mjs generate-sbom.mjs',
    ].join('\n'),
    'release.yml': [
      'name: r',
      'permissions:',
      '  contents: read',
      '  id-token: write',
      'jobs:',
      '  release:',
      '    runs-on: ubuntu-24.04',
      '    timeout-minutes: 10',
      '    steps:',
      `      - uses: ${checkout}`,
      '        with:',
      '          persist-credentials: false',
      '      - run: generate-provenance.mjs',
    ].join('\n'),
  };
  for (const [name, text] of Object.entries(workflows))
    fs.writeFileSync(path.join(root, '.github/workflows', name), text);
  assert.throws(() => checkCiPolicy(root), /timeout-minutes/u);
});
