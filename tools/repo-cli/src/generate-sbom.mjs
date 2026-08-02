import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputIndex = process.argv.indexOf('--output');
const output = outputIndex === -1 ? 'artifacts/sbom.cdx.json' : process.argv[outputIndex + 1];
if (!output || output.startsWith('--')) {
  throw new Error('--output requires a file path');
}
const ignored = new Set([
  'node_modules',
  '.git',
  '.worktrees',
  'dist',
  'build',
  '.venv',
  'coverage',
]);

function packageFiles(directory) {
  const entries = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) entries.push(...packageFiles(full));
    else if (entry.name === 'package.json') entries.push(full);
  }
  return entries;
}

const components = [];
for (const filename of packageFiles(root)) {
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!manifest.name || !manifest.version) continue;
  const type = manifest.private ? 'library' : 'application';
  components.push({
    type,
    name: manifest.name,
    version: manifest.version,
    bomRef: `${manifest.name}@${manifest.version}`,
    purl: manifest.name.startsWith('@')
      ? `pkg:npm/${manifest.name}@${manifest.version}`
      : `pkg:npm/${manifest.name}@${manifest.version}`,
    properties: [
      { name: 'databreeze:manifest', value: path.relative(root, filename).replaceAll('\\', '/') },
    ],
  });
}
components.sort((a, b) => a.bomRef.localeCompare(b.bomRef));
const timestamp = new Date(Number(process.env.SOURCE_DATE_EPOCH || 0) * 1000).toISOString();
const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: 'urn:uuid:00000000-0000-4000-8000-000000000001',
  version: 1,
  metadata: {
    timestamp,
    tools: [{ vendor: 'DataBreeze', name: 'repo-cli', version: '1.0.0' }],
    component: { type: 'application', name: '@databreeze/platform', version: '0.0.0' },
  },
  components,
};
const destination = path.resolve(root, output);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(bom, null, 2)}\n`, 'utf8');
process.stdout.write(
  `Wrote ${path.relative(root, destination)} (${components.length} components).\n`,
);
