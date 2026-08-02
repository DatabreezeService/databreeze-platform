import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const infrastructureRoot = path.join(repositoryRoot, 'infrastructure', 'aws');
const requiredFiles = [
  'README.md',
  'environments/alpha/main.tf',
  'environments/alpha/variables.tf',
  'environments/alpha/versions.tf',
  'modules/network/main.tf',
  'modules/security/main.tf',
  'modules/web/main.tf',
  'modules/data/main.tf',
  'modules/compute/main.tf',
];

function fail(message) {
  console.error(`AWS infrastructure check failed: ${message}`);
  process.exitCode = 1;
}

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(infrastructureRoot, relativePath))) fail(`missing ${relativePath}`);
}

const allTerraform = requiredFiles
  .filter((relativePath) => relativePath.endsWith('.tf'))
  .map((relativePath) => readFileSync(path.join(infrastructureRoot, relativePath), 'utf8'))
  .join('\n');
for (const requiredText of [
  'ap-southeast-1',
  'hashicorp/aws',
  'aws_s3_bucket',
  'aws_cloudfront_distribution',
  'aws_ecs_cluster',
  'aws_db_instance',
  'aws_elasticache_replication_group',
  'aws_kms_key',
  'aws_secretsmanager_secret',
  'aws_iam_openid_connect_provider',
]) {
  if (!allTerraform.includes(requiredText)) fail(`missing required declaration ${requiredText}`);
}
for (const requiredBoundary of [
  'block_public_policy',
  'versioning_configuration',
  'assign_public_ip = false',
  'deletion_protection',
  'backup_retention_period',
  'token.actions.githubusercontent.com:sub',
  'recovery_window_in_days = 30',
]) {
  if (!allTerraform.includes(requiredBoundary)) fail(`missing required safety boundary ${requiredBoundary}`);
}
if (/ingress[\s\S]{0,400}cidr_blocks\s*=\s*\["0\.0\.0\.0\/0"\]/u.test(allTerraform)) {
  fail('a private service security group permits unrestricted ingress');
}
if (/resource\s+"aws_s3_bucket_policy"[\s\S]*?Principal\s*=\s*"\*"/u.test(allTerraform)) {
  fail('the Web bucket policy grants a wildcard principal');
}
if (
  /AKIA[0-9A-Z]{16}|aws_secret_access_key\s*=|BEGIN (RSA|OPENSSH) PRIVATE KEY/.test(allTerraform)
) {
  fail('credential-like material found in Terraform sources');
}

const tofu = spawnSync('tofu', ['fmt', '-check', '-recursive', infrastructureRoot], {
  cwd: repositoryRoot,
  encoding: 'utf8',
});
if (tofu.error?.code === 'ENOENT') {
  console.warn(
    'OpenTofu is not installed; static AWS checks passed and fmt/validate were skipped.',
  );
} else if (tofu.status !== 0) {
  console.error(tofu.stdout || tofu.stderr);
  process.exitCode = tofu.status ?? 1;
} else {
  const alphaDirectory = path.join(infrastructureRoot, 'environments', 'alpha');
  const tofuDataDirectory = mkdtempSync(path.join(os.tmpdir(), 'databreeze-tofu-'));
  const tofuEnvironment = { ...process.env, TF_DATA_DIR: tofuDataDirectory };
  try {
    const init = spawnSync('tofu', ['init', '-backend=false', '-input=false', '-no-color'], {
      cwd: alphaDirectory,
      env: tofuEnvironment,
      encoding: 'utf8',
    });
    if (init.status !== 0) {
      console.error(init.stdout || init.stderr);
      process.exitCode = init.status ?? 1;
    } else {
      const validate = spawnSync('tofu', ['validate', '-no-color'], {
        cwd: alphaDirectory,
        env: tofuEnvironment,
        encoding: 'utf8',
      });
      if (validate.status !== 0) {
        console.error(validate.stdout || validate.stderr);
        process.exitCode = validate.status ?? 1;
      } else {
        console.log('OpenTofu formatting, initialization, and validation passed.');
      }
    }
  } finally {
    rmSync(tofuDataDirectory, { recursive: true, force: true });
  }
}

if (!tofu.error && (process.exitCode ?? 0) === 0)
  console.log('AWS infrastructure baseline is ready for plan-only validation.');
