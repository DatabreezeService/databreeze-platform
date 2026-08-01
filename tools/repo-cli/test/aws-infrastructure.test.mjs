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
    'kms:GenerateDataKey',
    'block_public_policy',
    'storage_encrypted',
    'manage_master_user_password = true',
    'publicly_accessible        = false',
    'transit_encryption_enabled = true',
  ])
    assert.match(sources, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(sources, /AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH) PRIVATE KEY/);
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
});
