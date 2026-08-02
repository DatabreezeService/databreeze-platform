import { execFileSync } from 'node:child_process';

const [base = 'HEAD^', head = 'HEAD'] = process.argv.slice(2);
const changed = execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' })
  .split(/\r?\n/u)
  .map((file) => file.trim())
  .filter(Boolean);

const matches = (patterns) =>
  changed.some((file) => patterns.some((pattern) => file.startsWith(pattern)));
const shared = matches([
  'packages/',
  'services/api/',
  'tools/',
  'docs/specs/',
  'docs/plans/',
  'infrastructure/',
  '.github/',
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig',
  'turbo.json',
]);
const result = {
  any: changed.length > 0,
  shared,
  web: shared || matches(['apps/web/']),
  desktop: shared || matches(['apps/desktop/']),
  android: shared || matches(['apps/android/']),
  engine: shared || matches(['services/engine/']),
  infrastructure: shared || matches(['infrastructure/']),
};

for (const [key, value] of Object.entries(result)) process.stdout.write(`${key}=${value}\n`);
