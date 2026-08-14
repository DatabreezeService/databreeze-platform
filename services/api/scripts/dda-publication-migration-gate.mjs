import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationName = '20260813010000_dda_dashboard_publications';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationDirectory = join(scriptDirectory, '..', 'prisma', 'migrations', migrationName);

function phaseSqlFile(phase) {
  if (phase === 'preflight') return 'preflight.sql';
  if (phase === 'validate') return 'post-deploy-validate.sql';
  throw new Error(`Unsupported publication migration gate phase: ${phase}`);
}

function executeWithPsql({ sqlPath }) {
  const command = process.env.DDA_PSQL_COMMAND ?? 'psql';
  const result = spawnSync(command, ['-v', 'ON_ERROR_STOP=1', '-f', sqlPath], {
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Publication migration gate SQL failed with exit code ${result.status ?? 'unknown'}`,
    );
  }
}

export async function runPublicationMigrationGate({
  phase,
  receiptPath,
  executeSql = executeWithPsql,
}) {
  if (typeof receiptPath !== 'string' || receiptPath.trim().length === 0) {
    throw new Error('A success receipt path is required to promote the publication migration');
  }
  const sqlFile = phaseSqlFile(phase);
  const sqlPath = join(migrationDirectory, sqlFile);
  const sql = await readFile(sqlPath, 'utf8');
  const sqlSha256 = createHash('sha256').update(sql, 'utf8').digest('hex');
  await executeSql({ phase, sqlPath, sql });
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(
    receiptPath,
    `${JSON.stringify(
      {
        status: 'SUCCEEDED',
        migration: migrationName,
        phase,
        sqlFile,
        sqlSha256,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return Object.freeze({ status: 'SUCCEEDED', phase, receiptPath, sqlSha256 });
}

function parseArguments(argv) {
  const phaseIndex = argv.indexOf('--phase');
  const receiptIndex = argv.indexOf('--receipt');
  if (argv.includes('--help')) {
    console.log(
      'Usage: node scripts/dda-publication-migration-gate.mjs --phase <preflight|validate> --receipt <path>',
    );
    return undefined;
  }
  const phase = phaseIndex >= 0 ? argv[phaseIndex + 1] : undefined;
  const receiptPath = receiptIndex >= 0 ? argv[receiptIndex + 1] : undefined;
  if (phase === undefined || receiptPath === undefined) {
    throw new Error('Both --phase and --receipt are required; use --help for usage');
  }
  return { phase, receiptPath };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (args !== undefined) await runPublicationMigrationGate(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
