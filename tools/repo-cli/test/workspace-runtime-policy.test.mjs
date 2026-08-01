import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const expectedRuntimeVersions = {
  nodejs: '24.17.0',
  pnpm: '11.19.0',
  python: '3.13.0',
  java: 'temurin-21',
  postgres: '17',
  redis: '7.4',
};

function run(command, args) {
  const commandLine = [command, ...args].join(' ');
  const executable = process.platform === 'win32' ? 'cmd.exe' : command;
  const executableArgs = process.platform === 'win32' ? ['/d', '/s', '/c', commandLine] : args;

  return execFileSync(executable, executableArgs, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

function readToolVersions() {
  return Object.fromEntries(
    readFileSync(path.join(repositoryRoot, '.tool-versions'), 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split(/\s+/, 2)),
  );
}

test('discovers the root workspace and enforces the repository runtime policy', () => {
  for (const requiredFile of [
    'package.json',
    'pnpm-workspace.yaml',
    '.node-version',
    '.tool-versions',
  ]) {
    assert.equal(existsSync(path.join(repositoryRoot, requiredFile)), true);
  }

  const packageManifest = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
  );
  const discoveredPackages = JSON.parse(
    run('corepack', ['pnpm', '--recursive', 'list', '--depth', '-1', '--json']),
  ).map(({ name }) => name);

  assert.ok(discoveredPackages.includes('@databreeze/platform'));
  assert.equal(
    run('corepack', ['pnpm', 'exec', 'node', '--version']),
    `v${expectedRuntimeVersions.nodejs}`,
  );
  assert.equal(run('corepack', ['pnpm', '--version']), expectedRuntimeVersions.pnpm);
  assert.equal(packageManifest.packageManager, `pnpm@${expectedRuntimeVersions.pnpm}`);
  assert.deepEqual(packageManifest.devEngines?.runtime, {
    name: 'node',
    version: expectedRuntimeVersions.nodejs,
    onFail: 'error',
  });
  assert.equal(run('corepack', ['pnpm', 'config', 'get', 'engineStrict']), 'true');
  assert.equal(run('corepack', ['pnpm', 'config', 'get', 'pmOnFail']), 'download');
  assert.equal(existsSync(path.join(repositoryRoot, '.npmrc')), false);
  assert.equal(
    readFileSync(path.join(repositoryRoot, '.node-version'), 'utf8').trim(),
    expectedRuntimeVersions.nodejs,
  );
  assert.deepEqual(readToolVersions(), expectedRuntimeVersions);
});
