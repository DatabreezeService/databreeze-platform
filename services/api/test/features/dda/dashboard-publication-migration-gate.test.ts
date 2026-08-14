import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

function assetPath(name: string): string {
  const candidates = [
    resolve(process.cwd(), 'scripts', name),
    resolve(process.cwd(), 'services/api/scripts', name),
  ];
  return candidates.find((candidate) => candidate.length > 0) ?? candidates[0]!;
}

void test('[DDA-025][DDA-029][AUD-003] deployment gate executes SQL, records a success receipt, and blocks promotion on preflight or later validation failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dda-publication-gate-'));
  try {
    const fakePsql = join(directory, 'fake-psql.cmd');
    await writeFile(
      fakePsql,
      '@echo off\r\nif "%DDA_GATE_FAIL%"=="1" exit /b 17\r\nexit /b 0\r\n',
      'utf8',
    );
    const script = assetPath('dda-publication-migration-gate.mjs');
    const preflightReceipt = join(directory, 'preflight.json');
    await execFileAsync(
      process.execPath,
      [script, '--phase', 'preflight', '--receipt', preflightReceipt],
      { env: { ...process.env, DDA_PSQL_COMMAND: fakePsql } },
    );
    const preflight = JSON.parse(await readFile(preflightReceipt, 'utf8')) as Record<
      string,
      unknown
    >;
    assert.equal(preflight['phase'], 'preflight');
    assert.equal(preflight['status'], 'SUCCEEDED');

    const validationReceipt = join(directory, 'validation.json');
    await execFileAsync(
      process.execPath,
      [script, '--phase', 'validate', '--receipt', validationReceipt],
      { env: { ...process.env, DDA_PSQL_COMMAND: fakePsql } },
    );
    const validation = JSON.parse(await readFile(validationReceipt, 'utf8')) as Record<
      string,
      unknown
    >;
    assert.equal(validation['phase'], 'validate');
    assert.equal(validation['status'], 'SUCCEEDED');

    const failedReceipt = join(directory, 'failed.json');
    await assert.rejects(
      execFileAsync(
        process.execPath,
        [script, '--phase', 'preflight', '--receipt', failedReceipt],
        { env: { ...process.env, DDA_PSQL_COMMAND: fakePsql, DDA_GATE_FAIL: '1' } },
      ),
    );
    await assert.rejects(readFile(failedReceipt, 'utf8'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('[DDA-025][DDA-029][DDA-032][AUD-003] deploy command executes preflight before migration and promotion validates only after deploy receipt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dda-publication-deploy-'));
  try {
    const fakePsql = join(directory, 'fake-psql.cmd');
    const fakeMigrate = join(directory, 'fake-migrate.cmd');
    const orderLog = join(directory, 'order.log');
    await writeFile(
      fakePsql,
      '@echo off\r\necho psql>>"%DDA_DEPLOY_ORDER_LOG%"\r\nif "%DDA_GATE_FAIL%"=="1" exit /b 17\r\nexit /b 0\r\n',
      'utf8',
    );
    await writeFile(
      fakeMigrate,
      '@echo off\r\necho migrate>>"%DDA_DEPLOY_ORDER_LOG%"\r\nif "%DDA_MIGRATE_FAIL%"=="1" exit /b 19\r\nexit /b 0\r\n',
      'utf8',
    );
    const script = assetPath('dda-publication-deploy.mjs');
    const preflightReceipt = join(directory, 'preflight.json');
    const deployReceipt = join(directory, 'deploy.json');
    const environment = {
      ...process.env,
      DDA_PSQL_COMMAND: fakePsql,
      DDA_MIGRATE_COMMAND: fakeMigrate,
      DDA_DEPLOY_ORDER_LOG: orderLog,
    };
    await execFileAsync(
      process.execPath,
      [
        script,
        '--phase',
        'deploy',
        '--preflight-receipt',
        preflightReceipt,
        '--receipt',
        deployReceipt,
      ],
      { env: environment },
    );
    assert.deepEqual((await readFile(orderLog, 'utf8')).trim().split(/\r?\n/u), [
      'psql',
      'migrate',
    ]);
    assert.equal(
      (JSON.parse(await readFile(deployReceipt, 'utf8')) as Record<string, unknown>)['status'],
      'SUCCEEDED',
    );

    const promotionReceipt = join(directory, 'promotion.json');
    await execFileAsync(
      process.execPath,
      [
        script,
        '--phase',
        'promote',
        '--deploy-receipt',
        deployReceipt,
        '--receipt',
        promotionReceipt,
      ],
      { env: environment },
    );
    assert.equal(
      (JSON.parse(await readFile(promotionReceipt, 'utf8')) as Record<string, unknown>)['status'],
      'SUCCEEDED',
    );

    await assert.rejects(
      execFileAsync(
        process.execPath,
        [
          script,
          '--phase',
          'promote',
          '--deploy-receipt',
          join(directory, 'missing.json'),
          '--receipt',
          join(directory, 'blocked.json'),
        ],
        { env: environment },
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
