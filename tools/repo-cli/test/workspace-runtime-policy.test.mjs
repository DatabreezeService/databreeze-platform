import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const expectedRuntimeVersions = {
  nodejs: '24.17.0',
  pnpm: '11.18.0',
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
    onFail: 'download',
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

test('Turbo child tasks use the repository-pinned package manager when PATH contains another pnpm', () => {
  const fakeBin = mkdtempSync(path.join(os.tmpdir(), 'databreeze-fake-pnpm-'));
  try {
    if (process.platform === 'win32') {
      writeFileSync(path.join(fakeBin, 'pnpm.cmd'), '@echo off\r\necho 99.0.0\r\n', 'utf8');
    } else {
      const fakePnpm = path.join(fakeBin, 'pnpm');
      writeFileSync(fakePnpm, '#!/bin/sh\necho 99.0.0\n', 'utf8');
      chmodSync(fakePnpm, 0o755);
    }

    const launcher = path.join(repositoryRoot, 'tools', 'repo-cli', 'src', 'run-pinned-turbo.mjs');
    const output = execFileSync(process.execPath, [launcher, '--verify-only'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    }).trim();

    assert.equal(output, expectedRuntimeVersions.pnpm);
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
  }
});
