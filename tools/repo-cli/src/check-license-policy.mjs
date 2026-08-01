import fs from 'node:fs';
import path from 'node:path';

const allowed = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MPL-2.0',
  'UNLICENSED',
]);
const forbidden = /(?:AGPL|GPL|SSPL|BUSL|EUPL)/iu;
const ignored = new Set([
  'node_modules',
  '.git',
  '.worktrees',
  'dist',
  'build',
  '.venv',
  'coverage',
]);

function manifests(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...manifests(full));
    else if (entry.name === 'package.json') result.push(full);
  }
  return result;
}

const findings = [];
for (const filename of manifests(process.cwd())) {
  if (
    filename.includes(
      `${path.sep}tools${path.sep}repo-cli${path.sep}test${path.sep}fixtures${path.sep}`,
    )
  )
    continue;
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!manifest.name) continue;
  const license =
    typeof manifest.license === 'string' ? manifest.license : manifest.private ? 'UNLICENSED' : '';
  if (!license || forbidden.test(license) || !allowed.has(license)) {
    findings.push(`${path.relative(process.cwd(), filename)}: ${license || 'missing license'}`);
  }
}
if (findings.length > 0) throw new Error(`License policy findings:\n${findings.join('\n')}`);
process.stdout.write('License policy passed.\n');
