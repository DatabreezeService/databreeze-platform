import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKFLOW_DIRECTORY = '.github/workflows';
const REQUIRED_WORKFLOWS = ['quality.yml', 'security.yml', 'release.yml'];
const SHA_REFERENCE = /^[0-9a-f]{40}$/iu;

function readWorkflow(root, name) {
  const filename = path.join(root, WORKFLOW_DIRECTORY, name);
  if (!fs.existsSync(filename)) throw new Error(`Missing required workflow: ${name}`);
  return fs.readFileSync(filename, 'utf8');
}

function assertPinnedActions(text, filename) {
  for (const match of text.matchAll(/(^|\s)uses:\s*([^\s#]+)/gim)) {
    const reference = match[2];
    if (reference.startsWith('./') || reference.startsWith('docker://')) continue;
    const at = reference.lastIndexOf('@');
    if (at < 1 || !SHA_REFERENCE.test(reference.slice(at + 1))) {
      throw new Error(`${filename} uses an unpinned action: ${reference}`);
    }
  }
}

function assertLeastPrivilege(text, filename) {
  if (/permissions:\s*write-all/iu.test(text)) {
    throw new Error(`${filename} grants write-all permissions`);
  }
  if (!/^permissions:\s*$/im.test(text)) {
    throw new Error(`${filename} must declare a top-level permissions block`);
  }
  if (/pull_request_target:/iu.test(text)) {
    throw new Error(`${filename} must not execute untrusted code from pull_request_target`);
  }
  if (/AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY)\s*:/iu.test(text)) {
    throw new Error(`${filename} must not define long-lived AWS key environment variables`);
  }
  if (/uses:\s*actions\/checkout@/iu.test(text) && !/persist-credentials:\s*false/iu.test(text)) {
    throw new Error(`${filename} must disable checkout credential persistence`);
  }
}

function assertBoundedJobs(text, filename) {
  const jobCount = (text.match(/^\s+runs-on:\s*\S+/gim) ?? []).length;
  const timeoutCount = (text.match(/^\s+timeout-minutes:\s*\d+/gim) ?? []).length;
  if (jobCount > timeoutCount) {
    throw new Error(`${filename} must bound every runner job with timeout-minutes`);
  }
}

export function checkCiPolicy(root = process.cwd()) {
  const workflows = Object.fromEntries(
    REQUIRED_WORKFLOWS.map((name) => [name, readWorkflow(root, name)]),
  );
  for (const [name, text] of Object.entries(workflows)) {
    assertPinnedActions(text, name);
    assertLeastPrivilege(text, name);
    assertBoundedJobs(text, name);
  }
  const security = workflows['security.yml'];
  for (const required of [
    'pnpm audit',
    'check-secret-patterns.mjs',
    'check-license-policy.mjs',
    'check-container-policy.mjs',
    'generate-sbom.mjs',
  ]) {
    if (!security.includes(required)) throw new Error(`security.yml is missing ${required}`);
  }
  const release = workflows['release.yml'];
  if (!/id-token:\s*write/iu.test(release)) {
    throw new Error('release.yml must request OIDC id-token permission explicitly');
  }
  if (!release.includes('generate-provenance.mjs')) {
    throw new Error('release.yml must generate a provenance record');
  }
  return { workflowCount: REQUIRED_WORKFLOWS.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkCiPolicy(process.cwd());
  process.stdout.write('CI policy passed.\n');
}
