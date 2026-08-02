import fs from 'node:fs';
import path from 'node:path';

const imagePattern = /^\s*image:\s*([^\s#]+)/gim;
const files = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', '.worktrees', 'node_modules', 'dist', 'build', '.venv'].includes(entry.name))
      continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(full);
    else if (/^(?:Dockerfile(?:\..*)?|.*\.(?:yml|yaml))$/iu.test(entry.name)) files.push(full);
  }
}
visit(path.join(process.cwd(), 'infrastructure'));
const findings = [];
for (const filename of files) {
  const text = fs.readFileSync(filename, 'utf8');
  for (const match of text.matchAll(imagePattern)) {
    const image = match[1];
    if (image === 'scratch' || image.includes('@sha256:')) continue;
    if (!image.includes(':') || image.endsWith(':latest')) {
      findings.push(`${path.relative(process.cwd(), filename)}: ${image}`);
    }
  }
}
if (findings.length > 0)
  throw new Error(`Container image policy findings:\n${findings.join('\n')}`);
process.stdout.write(`Container policy passed (${files.length} infrastructure files scanned).\n`);
