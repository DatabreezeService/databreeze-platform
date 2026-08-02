import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const binaryExtensions = /\.(?:png|jpg|jpeg|gif|ico|webp|pdf|zip|jar|apk|aab|woff2?)$/iu;
const patterns = [
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/u },
  { name: 'GitHub token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/u },
  { name: 'Slack token', pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/u },
];
const findings = [];
for (const file of files) {
  if (binaryExtensions.test(file)) continue;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const { name, pattern } of patterns) {
    if (pattern.test(text)) findings.push(`${name}: ${file}`);
  }
}
if (findings.length > 0) throw new Error(`Potential secrets found:\n${findings.join('\n')}`);
process.stdout.write(`Secret pattern scan passed (${files.length} tracked files).\n`);
