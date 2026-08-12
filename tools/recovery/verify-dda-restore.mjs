#!/usr/bin/env node
/**
 * Content-safe DDA restore verifier.
 * Expects a restored staging DATABASE_URL and checks tenant-scoped counts only.
 * Blocked without MANUAL-PREREQUISITES §2 restore drill.
 *
 * --fixture-only validates the expected unified-workspace restore checklist without
 * connecting to a live database or printing row contents.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  repoRoot,
  'services/api/prisma/migrations/20260812010000_unified_workspace/migration.sql',
);

const FIXTURE_CHECKLIST = Object.freeze([
  {
    id: 'conversation-with-messages-context',
    tables: ['conversations', 'conversation_messages', 'conversation_context_events'],
    minCount: 1,
  },
  {
    id: 'source-assignment',
    tables: ['source_assignments'],
    minCount: 1,
  },
  {
    id: 'workspace-agent-grant',
    tables: ['workspace_agent_grants'],
    minCount: 1,
  },
  {
    id: 'extraction-candidate',
    tables: ['extraction_candidates'],
    minCount: 1,
  },
  {
    id: 'named-dashboard-view',
    tables: ['named_dashboard_views'],
    minCount: 1,
  },
]);

function usage() {
  console.log(`Usage:
  node tools/recovery/verify-dda-restore.mjs --fixture-only
  node tools/recovery/verify-dda-restore.mjs --database-url <url>

Verifies restored staging connectivity and prints content-safe counts.
Does not print row contents, paths, OCR text, or secrets.`);
}

function parseArgs(argv) {
  let databaseUrl;
  let fixtureOnly = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--help' || argv[i] === '-h') return { help: true };
    if (argv[i] === '--fixture-only') {
      fixtureOnly = true;
      continue;
    }
    if (argv[i] === '--database-url') {
      databaseUrl = argv[i + 1];
      i += 1;
    }
  }
  return { databaseUrl, fixtureOnly };
}

function verifyFixtureChecklist() {
  const migration = readFileSync(migrationPath, 'utf8');
  const missing = [];
  for (const item of FIXTURE_CHECKLIST) {
    for (const table of item.tables) {
      const present =
        migration.includes(`CREATE TABLE "dda"."${table}"`) ||
        migration.includes(`CREATE TABLE "iam"."${table}"`);
      if (!present) missing.push(`${item.id}:${table}`);
    }
  }
  if (!migration.includes('iae_artifact_version_id')) {
    missing.push('iae-reference-columns');
  }
  if (!migration.includes(`CHECK ("retention_state" IN ('ACTIVE', 'PENDING_DELETE', 'DELETED')`)) {
    missing.push('conversation-retention-state');
  }
  if (missing.length > 0) {
    console.error(`FAIL: restore fixture checklist incomplete: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify({
      mode: 'fixture-only',
      checklist: FIXTURE_CHECKLIST.map((item) => item.id),
      contentSafe: true,
      status: 'ok',
    }),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (args.fixtureOnly) {
    verifyFixtureChecklist();
    return;
  }
  if (!args.databaseUrl) {
    console.error('BLOCKED: provide --database-url from an owner-restored staging instance.');
    console.error('See docs/runbooks/dda-disaster-recovery.md and MANUAL-PREREQUISITES §2.');
    console.error('Or run --fixture-only for the content-safe checklist without live credentials.');
    process.exitCode = 2;
    return;
  }
  // Live Prisma/pg verification lands when staging credentials exist.
  console.error(
    'BLOCKED: restore verifier scaffold only. Wire Prisma against restored staging after §2.',
  );
  process.exitCode = 2;
}

await main();
