import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { SECRET_PATTERNS } from './secret-patterns.mjs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const binaryExtensions = /\.(?:png|jpg|jpeg|gif|ico|webp|pdf|zip|jar|apk|aab|woff2?)$/iu;
const findings = [];
for (const file of files) {
  if (binaryExtensions.test(file)) continue;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) findings.push(`${name}: ${file}`);
  }
}
if (findings.length > 0) throw new Error(`Potential secrets found:\n${findings.join('\n')}`);
process.stdout.write(`Secret pattern scan passed (${files.length} tracked files).\n`);
