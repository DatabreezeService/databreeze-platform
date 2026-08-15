import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEV_COMMANDS,
  DEV_WORKING_DIRECTORIES,
  DEV_WEB_PREREQUISITE,
  localDevelopmentEnvironment,
  renderDevelopmentInstructions,
} from '../src/dev-stack.mjs';

test('local development commands keep infrastructure in Docker and app processes on the host', () => {
  assert.deepEqual(DEV_COMMANDS, {
    infra: ['local:services', 'start'],
    api: ['--filter', '@databreeze/api', 'dev'],
    web: ['--filter', '@databreeze/web', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'],
  });

  assert.deepEqual(localDevelopmentEnvironment(), {
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: '3000',
    VITE_DATABREEZE_API_PROXY_TARGET: 'http://127.0.0.1:3000',
  });
});

test('development instructions are explicit about the HMR URL and Docker-only services', () => {
  const instructions = renderDevelopmentInstructions();

  assert.match(instructions, /http:\/\/127\.0\.0\.1:5173\/vi-VN\/workspace/u);
  assert.match(instructions, /Vite HMR/u);
  assert.match(instructions, /PostgreSQL.*Redis.*MinIO.*Mailpit/isu);
  assert.match(instructions, /do not use.*8443.*source editing/isu);
});

test('web development builds runtime domain exports before starting Vite', () => {
  assert.deepEqual(DEV_WEB_PREREQUISITE, ['--filter', '@databreeze/domain', 'build']);
});

test('web development starts from its package directory so workspace dependencies resolve', () => {
  assert.equal(DEV_WORKING_DIRECTORIES.web, 'apps/web');
});
