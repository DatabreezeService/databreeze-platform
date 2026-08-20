import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { balancedBlocks } from './terraform-safety.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const infrastructureRoot = path.join(repositoryRoot, 'infrastructure', 'aws');
const requiredFiles = [
  'README.md',
  '.opentofu-version',
  'environments/alpha/main.tf',
  'environments/alpha/.terraform.lock.hcl',
  'environments/alpha/tests/alpha-plan.tofutest.hcl',
  'environments/alpha/variables.tf',
  'environments/alpha/versions.tf',
  'environments/staging/main.tf',
  'environments/staging/.terraform.lock.hcl',
  'environments/staging/tests/staging-plan.tofutest.hcl',
  'environments/staging/variables.tf',
  'environments/staging/versions.tf',
  'environments/production/main.tf',
  'environments/production/.terraform.lock.hcl',
  'environments/production/tests/production-plan.tofutest.hcl',
  'environments/production/variables.tf',
  'environments/production/versions.tf',
  'modules/network/main.tf',
  'modules/security/main.tf',
  'modules/security/versions.tf',
  'modules/security/tests/platform-key-policy.tofutest.hcl',
  'modules/web/main.tf',
  'modules/data/main.tf',
  'modules/compute/main.tf',
  'modules/compute/versions.tf',
  'modules/compute/tests/runtime-secret-contract.tofutest.hcl',
];
const tofuTargets = [
  path.join('modules', 'compute'),
  path.join('modules', 'security'),
  path.join('environments', 'alpha'),
  path.join('environments', 'staging'),
  path.join('environments', 'production'),
];

function fail(message) {
  console.error(`AWS infrastructure check failed: ${message}`);
  process.exitCode = 1;
}

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(infrastructureRoot, relativePath))) fail(`missing ${relativePath}`);
}

const opentofuVersion = readFileSync(
  path.join(infrastructureRoot, '.opentofu-version'),
  'utf8',
).trim();
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(opentofuVersion)) {
  fail('the OpenTofu version pin must be one exact semantic version');
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
  'force_destroy = false',
]) {
  if (!allTerraform.includes(requiredBoundary))
    fail(`missing required safety boundary ${requiredBoundary}`);
}
if (
  balancedBlocks(allTerraform, 'ingress').some((block) =>
    /\bcidr_blocks\s*=\s*\[[^\]]*"0\.0\.0\.0\/0"/u.test(block),
  )
) {
  fail('a private service security group permits unrestricted ingress');
}
if (
  /resource\s+"aws_s3_bucket_policy"[\s\S]*?Principal\s*=\s*"\*"/u.test(allTerraform) ||
  balancedBlocks(allTerraform, 'statement').some(
    (statement) =>
      !/\beffect\s*=\s*"Deny"/u.test(statement) &&
      balancedBlocks(statement, 'principals').some((principal) =>
        /identifiers\s*=\s*\[[^\]]*"\*"/u.test(principal),
      ),
  )
) {
  fail('a bucket policy allows a wildcard principal');
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
  for (const relativeDirectory of tofuTargets) {
    const targetDirectory = path.join(infrastructureRoot, relativeDirectory);
    const tofuDataDirectory = mkdtempSync(path.join(os.tmpdir(), 'databreeze-tofu-'));
    const tofuEnvironment = { ...process.env, TF_DATA_DIR: tofuDataDirectory };
    const init = spawnSync(
      'tofu',
      [
        'init',
        '-backend=false',
        '-input=false',
        ...(existsSync(path.join(targetDirectory, '.terraform.lock.hcl'))
          ? ['-lockfile=readonly']
          : []),
        '-no-color',
      ],
      {
        cwd: targetDirectory,
        env: tofuEnvironment,
        encoding: 'utf8',
      },
    );
    if (init.status !== 0) {
      console.error(init.stdout || init.stderr);
      process.exitCode = init.status ?? 1;
    } else {
      const validate = spawnSync('tofu', ['validate', '-no-color'], {
        cwd: targetDirectory,
        env: tofuEnvironment,
        encoding: 'utf8',
      });
      if (validate.status !== 0) {
        console.error(validate.stdout || validate.stderr);
        process.exitCode = validate.status ?? 1;
      } else {
        const tests = spawnSync('tofu', ['test', '-no-color'], {
          cwd: targetDirectory,
          env: tofuEnvironment,
          encoding: 'utf8',
        });
        if (tests.status !== 0) {
          console.error(tests.stdout || tests.stderr);
          process.exitCode = tests.status ?? 1;
        } else {
          console.log(`OpenTofu validation passed for ${relativeDirectory}.`);
        }
      }
    }
    rmSync(tofuDataDirectory, { recursive: true, force: true });
  }
}

if (!tofu.error && (process.exitCode ?? 0) === 0)
  console.log('AWS infrastructure baseline is ready for plan-only validation.');
