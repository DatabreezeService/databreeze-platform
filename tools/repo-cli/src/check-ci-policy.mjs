import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const WORKFLOW_DIRECTORY = '.github/workflows';
const REQUIRED_WORKFLOWS = ['quality.yml', 'security.yml', 'release.yml'];
const SHA_REFERENCE = /^[0-9a-f]{40}$/iu;

function readWorkflow(root, name) {
  const filename = path.join(root, WORKFLOW_DIRECTORY, name);
  if (!fs.existsSync(filename)) throw new Error(`Missing required workflow: ${name}`);
  return fs.readFileSync(filename, 'utf8');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseWorkflow(text, filename) {
  try {
    const workflow = parse(text, { strict: true, uniqueKeys: true });
    if (!isRecord(workflow)) throw new Error('top-level document must be a mapping');
    return workflow;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${filename} is not valid workflow YAML: ${detail}`);
  }
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}

function containsText(value, expected) {
  let found = false;
  walk(value, (node) => {
    if (
      Object.values(node).some((child) => typeof child === 'string' && child.includes(expected))
    ) {
      found = true;
    }
  });
  return found;
}

function assertPinnedActions(workflow, filename) {
  walk(workflow, (node) => {
    if (typeof node.uses !== 'string') return;
    const reference = node.uses;
    if (reference.startsWith('./') || reference.startsWith('docker://')) return;
    const at = reference.lastIndexOf('@');
    if (at < 1 || !SHA_REFERENCE.test(reference.slice(at + 1))) {
      throw new Error(`${filename} uses an unpinned action: ${reference}`);
    }
  });
}

function assertLeastPrivilege(workflow, filename) {
  const permissions = workflow.permissions;
  if (permissions === 'write-all' || (isRecord(permissions) && permissions['write-all'])) {
    throw new Error(`${filename} grants write-all permissions`);
  }
  if (!isRecord(permissions)) {
    throw new Error(`${filename} must declare a top-level permissions block`);
  }
  if (permissions.contents !== 'read') {
    throw new Error(`${filename} must grant contents: read explicitly`);
  }
  walk(workflow, (node) => {
    if (Object.hasOwn(node, 'pull_request_target')) {
      throw new Error(`${filename} must not execute untrusted code from pull_request_target`);
    }
    if (Object.keys(node).some((key) => /^AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY)$/u.test(key))) {
      throw new Error(`${filename} must not define long-lived AWS key environment variables`);
    }
    if (typeof node.uses === 'string' && node.uses.startsWith('actions/checkout@')) {
      if (!isRecord(node.with) || node.with['persist-credentials'] !== false) {
        throw new Error(`${filename} must disable checkout credential persistence`);
      }
    }
  });
}

function assertBoundedJobs(workflow, filename) {
  if (!isRecord(workflow.jobs)) return;
  for (const job of Object.values(workflow.jobs)) {
    if (!isRecord(job) || !Object.hasOwn(job, 'runs-on')) continue;
    if (!Number.isInteger(job['timeout-minutes']) || job['timeout-minutes'] < 1) {
      throw new Error(`${filename} must bound every runner job with timeout-minutes`);
    }
  }
}

function assertArtifactOutputs(workflow, filename) {
  walk(workflow, (node) => {
    if (typeof node.uses !== 'string' || !node.uses.startsWith('actions/upload-artifact@')) return;
    if (!isRecord(node.with) || node.with['if-no-files-found'] !== 'error') {
      throw new Error(`${filename} artifact uploads must fail when an output is missing`);
    }
  });
}

export function checkCiPolicy(root = process.cwd()) {
  const workflows = Object.fromEntries(
    REQUIRED_WORKFLOWS.map((name) => {
      const text = readWorkflow(root, name);
      return [name, parseWorkflow(text, name)];
    }),
  );
  for (const [name, workflow] of Object.entries(workflows)) {
    assertPinnedActions(workflow, name);
    assertLeastPrivilege(workflow, name);
    assertBoundedJobs(workflow, name);
    assertArtifactOutputs(workflow, name);
  }
  const security = workflows['security.yml'];
  for (const required of [
    'pnpm audit',
    'check-secret-patterns.mjs',
    'check-license-policy.mjs',
    'check-container-policy.mjs',
    'generate-sbom.mjs',
  ]) {
    if (!containsText(security, required)) throw new Error(`security.yml is missing ${required}`);
  }
  const release = workflows['release.yml'];
  if (!isRecord(release.permissions) || release.permissions['id-token'] !== 'write') {
    throw new Error('release.yml must request OIDC id-token permission explicitly');
  }
  if (!containsText(release, 'generate-provenance.mjs')) {
    throw new Error('release.yml must generate a provenance record');
  }
  let hasReleaseEnvironment = false;
  walk(release, (node) => {
    if (node.environment === 'release') hasReleaseEnvironment = true;
  });
  if (!hasReleaseEnvironment) {
    throw new Error('release.yml must use the protected release environment');
  }
  return { workflowCount: REQUIRED_WORKFLOWS.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkCiPolicy(process.cwd());
  process.stdout.write('CI policy passed.\n');
}
