import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const outputIndex = process.argv.indexOf('--output');
const output = outputIndex === -1 ? 'artifacts/provenance.json' : process.argv[outputIndex + 1];
if (!output || output.startsWith('--')) {
  throw new Error('--output requires a file path');
}
const artifactArguments = [];
for (let index = 0; index < process.argv.length; index += 1) {
  if (process.argv[index] !== '--artifact') continue;
  const artifact = process.argv[index + 1];
  if (!artifact || artifact.startsWith('--')) {
    throw new Error('--artifact requires a file path');
  }
  artifactArguments.push(artifact);
}
const missingArtifacts = artifactArguments.filter((file) => !fs.existsSync(file));
if (missingArtifacts.length > 0) {
  throw new Error(`Provenance artifact(s) do not exist: ${missingArtifacts.join(', ')}`);
}
const artifacts = artifactArguments
  .map((file) => {
    const bytes = fs.readFileSync(file);
    return {
      path: path.relative(process.cwd(), file).replaceAll('\\', '/'),
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    };
  });
artifacts.sort((a, b) => a.path.localeCompare(b.path));
const epoch = Number(process.env.SOURCE_DATE_EPOCH || 0);
const provenance = {
  schemaVersion: 'https://slsa.dev/provenance/v1',
  buildDefinition: {
    buildType: 'https://databreeze.dev/build/monorepo/v1',
    externalParameters: {
      repository: process.env.GITHUB_REPOSITORY || 'local',
      ref: process.env.GITHUB_REF || 'local',
      workflow: process.env.GITHUB_WORKFLOW || 'local',
    },
  },
  runDetails: {
    builder: { id: 'https://github.com/DatabreezeService/databreeze-platform/actions' },
    metadata: {
      invocationId: process.env.GITHUB_RUN_ID || 'local',
      startedOn: new Date(epoch * 1000).toISOString(),
    },
  },
  subject: artifacts,
};
const destination = path.resolve(process.cwd(), output);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
process.stdout.write(`Wrote ${path.relative(process.cwd(), destination)}.\n`);
