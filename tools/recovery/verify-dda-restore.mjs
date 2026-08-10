#!/usr/bin/env node
/**
 * Content-safe DDA restore verifier.
 * Expects a restored staging DATABASE_URL and checks tenant-scoped counts only.
 * Blocked without MANUAL-PREREQUISITES §2 restore drill.
 */
import process from 'node:process';

function usage() {
  console.log(`Usage: node tools/recovery/verify-dda-restore.mjs --database-url <url>

Verifies restored staging connectivity and prints content-safe counts.
Does not print row contents, paths, OCR text, or secrets.`);
}

function parseArgs(argv) {
  let databaseUrl;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--help' || argv[i] === '-h') return { help: true };
    if (argv[i] === '--database-url') {
      databaseUrl = argv[i + 1];
      i += 1;
    }
  }
  return { databaseUrl };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.databaseUrl) {
    console.error('BLOCKED: provide --database-url from an owner-restored staging instance.');
    console.error('See docs/runbooks/dda-disaster-recovery.md and MANUAL-PREREQUISITES §2.');
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
