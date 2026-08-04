import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REQUIRED_FILES = Object.freeze([
  'apps/web/src/features/spreadsheet-auditor/spreadsheet-audit-page.tsx',
  'services/api/src/features/iae/api/local-artifact-registration.controller.ts',
  'services/api/src/features/sa/api/spreadsheet-audit-run.controller.ts',
  'services/engine/src/databreeze_engine/processors/spreadsheet_auditor_action.py',
]);

export function evaluateDogfoodSkeleton(rootDirectory, ignoredFiles = new Set()) {
  const missing = REQUIRED_FILES.filter(
    (relativePath) =>
      ignoredFiles.has(relativePath) || !existsSync(path.join(rootDirectory, relativePath)),
  );
  return Object.freeze({ accepted: missing.length === 0, missing: Object.freeze(missing) });
}

function main() {
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const result = evaluateDogfoodSkeleton(rootDirectory);
  if (!result.accepted) {
    console.error(JSON.stringify(result));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ accepted: true, checked: REQUIRED_FILES.length }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
