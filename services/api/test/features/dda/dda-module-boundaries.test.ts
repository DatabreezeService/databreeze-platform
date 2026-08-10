import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const ddaRoot = resolve(root, 'src/features/dda');

function listTsFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTsFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

void test('[DDA-001] DDA module does not import another feature adapter or repository', () => {
  const files = listTsFiles(ddaRoot);
  assert.ok(files.length > 0, 'DDA feature files must exist');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      source,
      /from ['"]\.\.\/\.\.\/(iam|iae|dsm|jra|dso|bua|aud|nco|fa|qi|ild)\//u,
      `${file} must not import another feature path`,
    );
    assert.doesNotMatch(
      source,
      /PrismaClient|createPrisma|\$queryRaw|DATABASE_URL/u,
      `${file} must not expose a database client to workers/clients`,
    );
  }
});

void test('[DDA-001] DDA is not composed into the root app module yet', () => {
  const appModule = readFileSync(resolve(root, 'src/app.module.ts'), 'utf8');
  assert.doesNotMatch(appModule, /DdaModule|features\/dda/u);
});
