import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPublicationMigrationGate } from './dda-publication-migration-gate.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..', '..');
const migrationName = '20260813010000_dda_dashboard_publications';

function executeMigration() {
  const command =
    process.env.DDA_MIGRATE_COMMAND ??
    'corepack pnpm --filter @databreeze/api exec prisma migrate deploy --config services/api/prisma.config.ts';
  const result = spawnSync(command, [], {
    cwd: process.env.DDA_MIGRATE_CWD ?? repositoryRoot,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `DDA publication migration failed with exit code ${result.status ?? 'unknown'}`,
    );
  }
}

async function requireSuccessReceipt(receiptPath, phase) {
  try {
    const value = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (value?.status !== 'SUCCEEDED' || (phase !== undefined && value?.phase !== phase)) {
      throw new Error(`DDA ${phase ?? 'deployment'} receipt is not successful`);
    }
  } catch (error) {
    if (error instanceof SyntaxError || (error && typeof error === 'object' && 'code' in error)) {
      throw new Error(`DDA ${phase ?? 'deployment'} success receipt is required`);
    }
    throw error;
  }
}

async function writeReceipt(receiptPath, value) {
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function runPublicationDeployment({
  phase,
  preflightReceipt,
  deployReceipt,
  receiptPath,
  validationReceipt,
  runGate = runPublicationMigrationGate,
  migrate = executeMigration,
}) {
  if (typeof receiptPath !== 'string' || receiptPath.trim().length === 0) {
    throw new Error('A deployment success receipt path is required');
  }
  if (phase === 'deploy') {
    if (typeof preflightReceipt !== 'string' || preflightReceipt.trim().length === 0) {
      throw new Error('Deploy phase requires --preflight-receipt');
    }
    await runGate({ phase: 'preflight', receiptPath: preflightReceipt });
    await migrate();
    await writeReceipt(receiptPath, {
      status: 'SUCCEEDED',
      migration: migrationName,
      phase: 'deploy',
      preflightReceipt,
      completedAt: new Date().toISOString(),
    });
    return Object.freeze({ status: 'SUCCEEDED', phase: 'deploy', receiptPath });
  }
  if (phase === 'promote') {
    if (typeof deployReceipt !== 'string' || deployReceipt.trim().length === 0) {
      throw new Error('Promotion phase requires --deploy-receipt');
    }
    await requireSuccessReceipt(deployReceipt, 'deploy');
    const validationPath =
      typeof validationReceipt === 'string' && validationReceipt.trim().length > 0
        ? validationReceipt
        : `${receiptPath}.validation.json`;
    await runGate({ phase: 'validate', receiptPath: validationPath });
    await writeReceipt(receiptPath, {
      status: 'SUCCEEDED',
      migration: migrationName,
      phase: 'promote',
      deployReceipt,
      validationReceipt: validationPath,
      completedAt: new Date().toISOString(),
    });
    return Object.freeze({ status: 'SUCCEEDED', phase: 'promote', receiptPath });
  }
  throw new Error(`Unsupported publication deployment phase: ${phase}`);
}

function parseArguments(argv) {
  if (argv.includes('--help')) {
    console.log(
      'Usage: node services/api/scripts/dda-publication-deploy.mjs --phase <deploy|promote> --receipt <path> [--preflight-receipt <path>|--deploy-receipt <path>] [--validation-receipt <path>]',
    );
    return undefined;
  }
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index < 0 ? undefined : argv[index + 1];
  };
  const phase = valueAfter('--phase');
  const receiptPath = valueAfter('--receipt');
  if (phase === undefined || receiptPath === undefined) {
    throw new Error('Both --phase and --receipt are required; use --help for usage');
  }
  return {
    phase,
    receiptPath,
    preflightReceipt: valueAfter('--preflight-receipt'),
    deployReceipt: valueAfter('--deploy-receipt'),
    validationReceipt: valueAfter('--validation-receipt'),
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (args !== undefined) await runPublicationDeployment(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
