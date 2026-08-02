import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath) => readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('AWS foundation has reusable modules and safe alpha composition', () => {
  for (const relativePath of [
    'infrastructure/aws/modules/network/main.tf',
    'infrastructure/aws/modules/security/main.tf',
    'infrastructure/aws/modules/web/main.tf',
    'infrastructure/aws/modules/data/main.tf',
    'infrastructure/aws/modules/compute/main.tf',
    'infrastructure/aws/environments/alpha/main.tf',
  ]) {
    assert.ok(existsSync(path.join(repositoryRoot, relativePath)), relativePath);
  }
  const production = read('infrastructure/aws/environments/alpha/production.tfvars.example');
  for (const token of [
    'enable_nat_gateway                  = true',
    'backup_retention_period             = 7',
    'database_multi_az                   = true',
    'redis_automatic_failover_enabled    = true',
    'api_desired_count                   = 2',
  ])
    assert.match(production, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const variables = read('infrastructure/aws/environments/alpha/variables.tf');
  assert.match(variables, /ap-southeast-1/);
  assert.match(variables, /enable_nat_gateway[\s\S]*default\s+=\s+false/);
  assert.match(variables, /enable_cloudfront[\s\S]*default\s+=\s+false/);
  assert.match(variables, /enable_ecs_services[\s\S]*default\s+=\s+false/);
  assert.match(variables, /enable_database[\s\S]*default\s+=\s+false/);
  assert.match(variables, /backup_retention_period[\s\S]*default\s+=\s+1/);
});

test('AWS sources expose encryption, private data, and OIDC boundaries without secrets', () => {
  const sources = [
    read('infrastructure/aws/modules/network/main.tf'),
    read('infrastructure/aws/modules/security/main.tf'),
    read('infrastructure/aws/modules/web/main.tf'),
    read('infrastructure/aws/modules/data/main.tf'),
    read('infrastructure/aws/modules/compute/main.tf'),
  ].join('\n');
  for (const token of [
    'enable_dns_hostnames',
    'aws_kms_key',
    'aws_secretsmanager_secret',
    'aws_iam_openid_connect_provider',
    'RegionalServiceEncryption',
    'CloudFrontOriginAccess',
    'cloudfront.amazonaws.com',
    'kms:Encrypt',
    'kms:GenerateDataKey',
    'execution_secrets',
    'master_user_secret_kms_key_id',
    'block_public_policy',
    'storage_encrypted',
    'manage_master_user_password = true',
    'publicly_accessible        = false',
    'transit_encryption_enabled = true',
  ])
    assert.match(sources, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(sources, /AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH) PRIVATE KEY/);
  assert.doesNotMatch(sources, /ingress[\s\S]*?cidr_blocks\s*=\s*\["0\.0\.0\.0\/0"\]/u);
  assert.doesNotMatch(sources, /principals[\s\S]*?identifiers\s*=\s*\[[^\]]*"\*"/u);
  assert.match(sources, /assign_public_ip\s*=\s*false/u);
  assert.match(sources, /token\.actions\.githubusercontent\.com:sub/u);
  assert.match(sources, /repo:\$\{var\.github_repository\}:ref:refs\/heads\/dev/u);
  assert.doesNotMatch(sources, /refs\/pull|refs\/tags|repo:\*\//u);
  assert.match(sources, /aws_s3_bucket_lifecycle_configuration/u);
  assert.match(sources, /noncurrent_version_expiration/u);
  assert.match(sources, /abort_incomplete_multipart_upload/u);
  assert.match(sources, /force_destroy\s*=\s*false/u);
  assert.doesNotMatch(sources, /aws_iam_role_policy" task/u);
  assert.doesNotMatch(sources, /ecs-task-minimal/u);
});

test('AWS validation script is non-applying and reports missing OpenTofu clearly', () => {
  const script = path.join(repositoryRoot, 'tools/repo-cli/src/check-aws-infrastructure.mjs');
  const result = spawnSync(process.execPath, [script], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /AWS infrastructure baseline|OpenTofu is not installed/,
  );
  const source = read('tools/repo-cli/src/check-aws-infrastructure.mjs');
  assert.match(source, /init', '-backend=false/);
  assert.match(source, /validate', '-no-color/);
  assert.match(source, /process\.exitCode \?\? 0/);
  assert.match(source, /missing required safety boundary/u);
  assert.doesNotMatch(source, /tofu',\s*\['apply'/u);
});

test('AWS production profile enables recovery and prevents public data paths', () => {
  const production = read('infrastructure/aws/environments/alpha/production.tfvars.example');
  const versions = read('infrastructure/aws/environments/alpha/versions.tf');
  const data = read('infrastructure/aws/modules/data/main.tf');
  const compute = read('infrastructure/aws/modules/compute/main.tf');
  assert.match(production, /backup_retention_period\s*=\s*7/u);
  assert.match(production, /deletion_protection\s*=\s*true/u);
  assert.match(production, /database_multi_az\s*=\s*true/u);
  assert.match(production, /redis_automatic_failover_enabled\s*=\s*true/u);
  assert.match(versions, /required_version\s*=\s*">= 1\.8\.0, < 2\.0\.0"/u);
  assert.doesNotMatch(data, /publicly_accessible\s*=\s*true/u);
  assert.doesNotMatch(data, /skip_final_snapshot\s*=\s*true/u);
  assert.match(data, /performance_insights_enabled\s*=\s*var\.environment == "production"/u);
  assert.match(data, /performance_insights_kms_key_id/u);
  assert.match(compute, /assign_public_ip\s*=\s*false/u);
  assert.equal((compute.match(/readonlyRootFilesystem\s*=\s*true/g) ?? []).length, 2);
  assert.equal((compute.match(/privileged\s*=\s*false/g) ?? []).length, 2);
  assert.equal((compute.match(/user\s*=\s*"10001"/g) ?? []).length, 2);
  assert.match(compute, /Production API deployments must use an immutable image digest\./u);
  assert.match(compute, /Production worker deployments must use an immutable image digest\./u);
  assert.match(compute, /@sha256:\[0-9a-f\]\{64\}/u);
  assert.match(compute, /cpu\s*=\s*tostring\(var\.worker_cpu\)/u);
  assert.match(compute, /memory\s*=\s*tostring\(var\.worker_memory\)/u);
  const computeVariables = read('infrastructure/aws/modules/compute/variables.tf');
  assert.match(computeVariables, /variable "worker_cpu"/u);
  assert.match(computeVariables, /variable "worker_memory"/u);
  assert.match(computeVariables, /supported Fargate CPU size/u);
  assert.match(computeVariables, /between 512 and 30720 MiB/u);
  assert.match(compute, /allowed_worker_memory_by_cpu/u);
  assert.match(compute, /AWS-supported Fargate size for worker_cpu/u);
});

test('AWS foundation keeps state and apply outside the repository', () => {
  const readme = read('infrastructure/aws/README.md');
  const sources = [
    read('infrastructure/aws/environments/alpha/main.tf'),
    read('infrastructure/aws/environments/alpha/versions.tf'),
  ].join('\n');
  assert.match(readme, /plan-only/u);
  assert.match(readme, /remote encrypted state backend/u);
  assert.doesNotMatch(sources, /^\s*backend\s+"/mu);
  assert.doesNotMatch(sources, /terraform\.tfstate|\.tfstate\.backup/u);
});

test('AWS production guidance requires digest-pinned application images', () => {
  const readme = read('infrastructure/aws/README.md');
  assert.match(readme, /api_image.*worker_image[\s\S]*immutable/u);
  assert.match(readme, /64-character SHA-256 digest/u);
  assert.match(readme, /Mutable tags are accepted\s+for alpha development only/u);
});
