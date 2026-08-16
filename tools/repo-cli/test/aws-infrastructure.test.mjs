import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath) => readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('AWS validation pins one OpenTofu CLI and official container release', () => {
  const version = read('infrastructure/aws/.opentofu-version').trim();
  const readme = read('infrastructure/aws/README.md');
  assert.equal(version, '1.12.5');
  assert.match(readme, /ghcr\.io\/opentofu\/opentofu:1\.12\.5/u);
});

test('AWS validators accept strict semantic versions without leading zero components', () => {
  const strictSemanticVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
  for (const version of ['0.0.0', '1.2.3', '10.20.30'])
    assert.equal(strictSemanticVersion.test(version), true, version);
  for (const version of ['01.2.3', '1.02.3', '1.2.03', '1.2', 'v1.2.3'])
    assert.equal(strictSemanticVersion.test(version), false, version);

  const expectedLiteral = '/^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$/u';
  assert.ok(read('tools/repo-cli/src/check-aws-infrastructure.mjs').includes(expectedLiteral));
  assert.ok(read('tools/repo-cli/src/validate-aws-opentofu.mjs').includes(expectedLiteral));
});

test('AWS container validation command is pinned, isolated, and non-applying', () => {
  const script = path.join(repositoryRoot, 'tools/repo-cli/src/validate-aws-opentofu.mjs');
  const help = spawnSync(process.execPath, [script, '--help'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /official pinned OpenTofu container/u);
  assert.match(help.stdout, /mocked plan\s+test/u);
  assert.match(help.stdout, /does not\s+apply infrastructure/u);
  const source = read('tools/repo-cli/src/validate-aws-opentofu.mjs');
  assert.match(source, /'fmt',\s*'-check',\s*'-recursive'/u);
  assert.match(source, /tofu init -backend=false -input=false[\s\S]*-no-color/u);
  assert.match(source, /cp -a \/workspace\/\./u);
  assert.match(source, /'--entrypoint',\s*'sh'/u);
  assert.match(source, /tofu validate -no-color/u);
  assert.match(source, /tofu test -no-color/u);
  assert.match(source, /target=\/workspace,readonly/u);
  assert.match(source, /TF_DATA_DIR=\$\{containerDataDirectory\}/u);
  assert.doesNotMatch(source, /['"]apply['"]/u);
  assert.match(
    read('package.json'),
    /"infra:validate": "node tools\/repo-cli\/src\/validate-aws-opentofu\.mjs"/u,
  );
  assert.match(
    read('infrastructure/aws/README.md'),
    /tofu init -backend=false -lockfile=readonly/u,
  );
});

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
  ])
    assert.match(sources, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(sources, /manage_master_user_password\s*=\s*true/u);
  assert.match(sources, /publicly_accessible\s*=\s*false/u);
  assert.match(sources, /transit_encryption_enabled\s*=\s*true/u);
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
  assert.match(source, /'init'[\s\S]*'-backend=false'/u);
  assert.match(source, /'-lockfile=readonly'/u);
  assert.match(source, /validate', '-no-color/);
  assert.match(source, /process\.exitCode \?\? 0/);
  assert.match(source, /missing required safety boundary/u);
  assert.doesNotMatch(source, /tofu',\s*\['apply'/u);
});

test('AWS validation runs compute plus staging and production OpenTofu tests when available', () => {
  const check = read('tools/repo-cli/src/check-aws-infrastructure.mjs');
  const container = read('tools/repo-cli/src/validate-aws-opentofu.mjs');
  assert.match(check, /path\.join\('modules', 'compute'\)/u);
  assert.match(check, /path\.join\('environments', 'staging'\)/u);
  assert.match(check, /path\.join\('environments', 'production'\)/u);
  assert.match(container, /\/workspace\/modules\/compute/u);
  assert.match(container, /\/workspace\/environments\/staging/u);
  assert.match(container, /\/workspace\/environments\/production/u);
  assert.match(check, /spawnSync\('tofu',\s*\['test',\s*'-no-color'/u);
  assert.match(container, /tofu test -no-color/u);
});

test('AWS runtime contract separates API and worker task roles and documents whole-secret rotation rollback', () => {
  const compute = read('infrastructure/aws/modules/compute/main.tf');
  const runbook = read('infrastructure/aws/modules/compute/README.md');
  assert.match(compute, /aws_iam_role"\s+"api_task"/u);
  assert.match(compute, /aws_iam_role"\s+"worker_task"/u);
  assert.match(compute, /task_role_arn\s*=\s*aws_iam_role\.api_task\.arn/u);
  assert.match(compute, /task_role_arn\s*=\s*aws_iam_role\.worker_task\.arn/u);
  assert.match(compute, /aws_iam_role_policy_attachment\.api_execution/u);
  assert.match(compute, /aws_iam_role_policy\.execution_secrets/u);
  assert.match(compute, /aws_iam_role_policy_attachment\.worker_execution/u);
  const apiService =
    compute.match(
      /resource\s+"aws_ecs_service"\s+"api"[\s\S]*?resource\s+"aws_ecs_service"\s+"worker"/u,
    )?.[0] ?? '';
  const workerService =
    compute.match(/resource\s+"aws_ecs_service"\s+"worker"[\s\S]*$/u)?.[0] ?? '';
  assert.match(
    apiService,
    /depends_on\s*=\s*\[[\s\S]*aws_iam_role_policy_attachment\.api_execution[\s\S]*aws_iam_role_policy\.execution_secrets/u,
  );
  assert.match(
    workerService,
    /depends_on\s*=\s*\[[\s\S]*aws_iam_role_policy_attachment\.worker_execution/u,
  );
  assert.match(workerService, /aws_iam_role_policy\.execution_secrets/u);
  assert.match(compute, /healthCheck/u);
  assert.match(compute, /command\s+=\s+\["CMD",\s*"\/nodejs\/bin\/node"/u);
  assert.match(compute, /\/health\/ready/u);
  assert.doesNotMatch(compute, /CMD-SHELL|\/health\/live/u);
  assert.match(runbook, /update-secret-version-stage/u);
  assert.match(runbook, /AWSCURRENT/u);
  assert.match(runbook, /force-new-deployment/u);
  assert.match(runbook, /circuit breaker/u);
});

test('AWS hosted API uses a public HTTPS ALB and only ALB-to-API ingress', () => {
  const network = read('infrastructure/aws/modules/network/main.tf');
  const compute = read('infrastructure/aws/modules/compute/main.tf');
  const production = read('infrastructure/aws/environments/production/main.tf');

  assert.match(network, /aws_security_group"\s+"api_load_balancer"/u);
  assert.match(network, /aws_vpc_security_group_ingress_rule"\s+"api_from_load_balancer"/u);
  assert.match(
    network,
    /referenced_security_group_id\s*=\s*aws_security_group\.api_load_balancer/u,
  );
  assert.match(compute, /aws_lb"\s+"api"/u);
  assert.match(compute, /aws_lb_target_group"\s+"api"/u);
  assert.match(compute, /aws_lb_listener"\s+"api_https"/u);
  assert.match(compute, /protocol\s*=\s*"HTTPS"/u);
  assert.match(compute, /certificate_arn\s*=\s*var\.api_certificate_arn/u);
  assert.match(compute, /path\s*=\s*"\/health\/ready"/u);
  assert.match(compute, /dynamic "load_balancer"\s*\{/u);
  assert.match(production, /public_subnet_ids\s*=\s*module\.network\.public_subnet_ids/u);
  assert.match(
    production,
    /api_load_balancer_security_group_id\s*=\s*module\.network\.api_load_balancer_security_group_id/u,
  );
  assert.match(production, /api_certificate_arn\s*=\s*var\.api_certificate_arn/u);

  for (const environment of ['alpha', 'staging', 'production']) {
    const outputs = read(`infrastructure/aws/environments/${environment}/outputs.tf`);
    assert.match(
      outputs,
      /output "api_load_balancer_dns_name"[\s\S]*module\.compute\.api_load_balancer_dns_name/u,
    );
    assert.match(
      outputs,
      /output "api_https_listener_arn"[\s\S]*module\.compute\.api_https_listener_arn/u,
    );
  }
});

test('AWS Web CSP receives only reviewed exact HTTPS API origins', () => {
  const production = read('infrastructure/aws/environments/production/main.tf');
  const variables = read('infrastructure/aws/environments/production/variables.tf');
  const productionShape = read(
    'infrastructure/aws/environments/production/production-shaped.tfvars.example',
  );

  assert.match(production, /connect_src_origins\s*=\s*var\.web_connect_src_origins/u);
  assert.match(variables, /variable "web_connect_src_origins"[\s\S]*type\s*=\s*list\(string\)/u);
  assert.match(productionShape, /web_connect_src_origins\s*=\s*\["https:\/\/api\.[a-z0-9.-]+"\]/u);
  assert.doesNotMatch(productionShape, /web_connect_src_origins[^\n]*\*/u);
});

test('AWS exposes dashboard proposal AI as an independently gated server-side feature', () => {
  const compute = read('infrastructure/aws/modules/compute/main.tf');
  const variables = read('infrastructure/aws/modules/compute/variables.tf');
  const production = read('infrastructure/aws/environments/production/main.tf');

  assert.match(variables, /variable "openai_dashboard_enabled"/u);
  assert.match(variables, /variable "openai_dashboard_model"/u);
  assert.match(compute, /DATABREEZE_OPENAI_DASHBOARD_ENABLED/u);
  assert.match(compute, /DATABREEZE_OPENAI_DASHBOARD_MODEL/u);
  assert.match(
    compute,
    /var\.openai_agent_enabled\s*\|\|\s*var\.openai_receipt_enabled\s*\|\|\s*var\.openai_dashboard_enabled/u,
  );
  assert.match(production, /openai_dashboard_enabled\s*=\s*var\.openai_dashboard_enabled/u);
  assert.match(production, /openai_dashboard_model\s*=\s*var\.openai_dashboard_model/u);
});

test('AWS composes IAM OTP secrets, TLS Redis admission, and least-privilege SES delivery', () => {
  const security = read('infrastructure/aws/modules/security/main.tf');
  const securityOutputs = read('infrastructure/aws/modules/security/outputs.tf');
  const compute = read('infrastructure/aws/modules/compute/main.tf');
  const computeVariables = read('infrastructure/aws/modules/compute/variables.tf');
  const production = read('infrastructure/aws/environments/production/main.tf');

  for (const secret of [
    'email-verification-digest-key',
    'email-verification-envelope-key',
    'registration-admission-key',
  ]) {
    assert.match(security, new RegExp(`databreeze/\\$\\{var\\.name\\}/iam/${secret}`));
  }
  for (const output of [
    'email_verification_digest_key_secret_arn',
    'email_verification_envelope_key_secret_arn',
    'registration_admission_key_secret_arn',
  ]) {
    assert.match(securityOutputs, new RegExp(`output "${output}"`));
    assert.match(production, new RegExp(`${output}\\s*=\\s*module\\.security\\.${output}`));
  }
  for (const environmentName of [
    'DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY',
    'DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY',
    'DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY',
    'DATABREEZE_REDIS_URL',
    'DATABREEZE_IAM_EMAIL_FROM_ADDRESS',
    'DATABREEZE_IAM_EMAIL_SES_REGION',
  ]) {
    assert.match(compute, new RegExp(environmentName));
  }
  assert.match(production, /redis_url\s*=\s*module\.data\.redis_endpoint/u);
  assert.match(computeVariables, /variable "iam_email_from_address"/u);
  assert.match(compute, /Action\s*=\s*\["ses:SendEmail"\]/u);
  assert.match(
    compute,
    /Resource\s*=\s*\["arn:\$\{data\.aws_partition\.current\.partition\}:ses:\$\{var\.region\}:\$\{data\.aws_caller_identity\.current\.account_id\}:identity\/\$\{var\.iam_email_from_address\}"\]/u,
  );
  assert.doesNotMatch(compute, /ses:\*|ses:SendRawEmail/u);
});

test('AWS provider selection is locked for reproducible validation', () => {
  const lock = read('infrastructure/aws/environments/alpha/.terraform.lock.hcl');
  assert.match(lock, /registry\.opentofu\.org\/hashicorp\/aws/u);
  assert.match(lock, /version\s+=\s+"6\.0\.0"/u);
  assert.match(lock, /constraints\s+=\s+"6\.0\.0"/u);
  assert.match(read('.gitattributes'), /^\*\.hcl text eol=lf$/m);
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
