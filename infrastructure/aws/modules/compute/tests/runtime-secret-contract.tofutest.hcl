# Requirement links: Plan 401 Tasks 2-3, Plan 406 Task 19, DDA-057, and DDA-060.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:root"
      user_id    = "123456789012"
    }
  }

  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/databreeze-mock"
      id  = "databreeze-mock"
    }
  }

  mock_resource "aws_lb" {
    defaults = {
      arn      = "arn:aws:elasticloadbalancing:ap-southeast-1:123456789012:loadbalancer/app/databreeze-test/0000000000000000"
      dns_name = "databreeze-test.ap-southeast-1.elb.amazonaws.com"
    }
  }

  mock_resource "aws_lb_target_group" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:ap-southeast-1:123456789012:targetgroup/databreeze-test/0000000000000000"
    }
  }
}

variables {
  artifact_bucket_name                         = "databreeze-compute-test-artifacts"
  artifact_bucket_arn                          = "arn:aws:s3:::databreeze-compute-test-artifacts"
  iae_worker_capability_signing_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iae/worker-capability-signing-key-StUvWx"
  worker_service_account_bearer_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/worker/service-account-bearer-YzAbCd"
  worker_api_endpoint                          = "https://api.databreeze.example"
}

run "rejects_empty_runtime_secret_references" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = ""
    csrf_allowed_origins_secret_arn                = ""
    service_account_secret_envelope_key_secret_arn = ""
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [
    var.database_url_secret_arn,
    var.csrf_allowed_origins_secret_arn,
    var.service_account_secret_envelope_key_secret_arn,
  ]
}

run "publishes_exact_runtime_secret_contract" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    environment                                    = "production"
    enable_services                                = true
    private_egress_enabled                         = true
    api_desired_count                              = 2
    worker_desired_count                           = 2
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  assert {
    condition = jsondecode(aws_ecs_task_definition.api.container_definitions)[0].secrets == [
      {
        name      = "DATABASE_URL"
        valueFrom = var.database_url_secret_arn
      },
      {
        name      = "DATABREEZE_CSRF_ALLOWED_ORIGINS"
        valueFrom = var.csrf_allowed_origins_secret_arn
      },
      {
        name      = "DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY"
        valueFrom = var.service_account_secret_envelope_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY"
        valueFrom = var.email_verification_digest_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY"
        valueFrom = var.email_verification_envelope_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY"
        valueFrom = var.registration_admission_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY"
        valueFrom = var.iae_worker_capability_signing_key_secret_arn
      },
    ]
    error_message = "The API task definition must map exactly the two runtime names to their dedicated whole-secret ARNs."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role_policy.execution_secrets.policy).Statement[0].Action == ["secretsmanager:GetSecretValue"] &&
      jsondecode(aws_iam_role_policy.execution_secrets.policy).Statement[0].Resource == [
        var.database_url_secret_arn,
        var.csrf_allowed_origins_secret_arn,
        var.service_account_secret_envelope_key_secret_arn,
        var.email_verification_digest_key_secret_arn,
        var.email_verification_envelope_key_secret_arn,
        var.registration_admission_key_secret_arn,
        var.iae_worker_capability_signing_key_secret_arn,
      ]
    )
    error_message = "The API execution policy must grant GetSecretValue only for the two runtime secret ARNs."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role_policy.execution_secrets.policy).Statement[1].Action == ["kms:Decrypt"] &&
      jsondecode(aws_iam_role_policy.execution_secrets.policy).Statement[1].Resource == [var.kms_key_arn] &&
      jsondecode(aws_iam_role_policy.execution_secrets.policy).Statement[1].Condition["StringEquals"]["kms:ViaService"] == "secretsmanager.${var.region}.amazonaws.com" &&
      jsondecode(aws_iam_role_policy.execution_secrets.policy).Statement[1].Condition["StringEquals"]["kms:EncryptionContext:SecretARN"] == [
        var.database_url_secret_arn,
        var.csrf_allowed_origins_secret_arn,
        var.service_account_secret_envelope_key_secret_arn,
        var.email_verification_digest_key_secret_arn,
        var.email_verification_envelope_key_secret_arn,
        var.registration_admission_key_secret_arn,
        var.iae_worker_capability_signing_key_secret_arn,
      ]
    )
    error_message = "The API KMS decrypt policy must be restricted to Secrets Manager and the two runtime secret encryption contexts."
  }

  assert {
    condition = (
      aws_ecs_task_definition.api.execution_role_arn == aws_iam_role.api_execution.arn &&
      aws_ecs_task_definition.worker.execution_role_arn == aws_iam_role.worker_execution.arn &&
      aws_ecs_task_definition.api.task_role_arn == aws_iam_role.api_task.arn &&
      aws_ecs_task_definition.worker.task_role_arn == aws_iam_role.worker_task.arn &&
      aws_iam_role_policy_attachment.api_execution.role == aws_iam_role.api_execution.name &&
      aws_iam_role_policy_attachment.worker_execution.role == aws_iam_role.worker_execution.name &&
      aws_iam_role_policy_attachment.api_execution.policy_arn == "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" &&
      aws_iam_role_policy_attachment.worker_execution.policy_arn == "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" &&
      aws_iam_role_policy.execution_secrets.role == aws_iam_role.api_execution.id &&
      jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].entryPoint == ["databreeze-engine-worker"] &&
      jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].command == [] &&
      jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].environment == [
        { name = "DATABREEZE_WORKER_API_ENDPOINT", value = var.worker_api_endpoint },
      ] &&
      jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].secrets == [
        { name = "DATABREEZE_WORKER_BEARER_TOKEN", valueFrom = var.worker_service_account_bearer_secret_arn },
      ] &&
      aws_iam_role_policy.worker_execution_secret.role == aws_iam_role.worker_execution.id &&
      jsondecode(aws_iam_role_policy.worker_execution_secret.policy).Statement[0].Resource == [var.worker_service_account_bearer_secret_arn] &&
      !strcontains(aws_iam_role_policy.worker_execution_secret.policy, var.database_url_secret_arn) &&
      !strcontains(aws_iam_role_policy.worker_execution_secret.policy, var.iae_worker_capability_signing_key_secret_arn) &&
      jsondecode(aws_ecs_task_definition.api.container_definitions)[0].healthCheck.command == [
        "CMD",
        "/nodejs/bin/node",
        "--input-type=module",
        "-e",
        "fetch('http://127.0.0.1:3000/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))",
      ] &&
      aws_ecs_service.api[0].deployment_circuit_breaker[0].rollback == true &&
      aws_ecs_service.worker[0].deployment_circuit_breaker[0].rollback == true
    )
    error_message = "The API and worker must use separate execution roles, the worker must have no API secret entries, and both services must roll back failed deployments."
  }
}

run "publishes_openai_secret_and_bounded_configuration_to_api_only" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    openai_api_key_secret_arn                      = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/openai/api-key-MnOpQr"
    openai_agent_enabled                           = true
    openai_receipt_enabled                         = false
    openai_agent_model                             = "gpt-4o-mini-2024-07-18"
    openai_agent_timeout_ms                        = 45000
    openai_agent_max_output_tokens                 = 3072
    openai_receipt_model                           = "gpt-4o-mini-2024-07-18"
    openai_image_detail                            = "high"
    environment                                    = "production"
    enable_services                                = true
    private_egress_enabled                         = true
    api_desired_count                              = 2
    worker_desired_count                           = 2
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  assert {
    condition = jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment == [
      { name = "NODE_ENV", value = "production" },
      { name = "DATABREEZE_REDIS_URL", value = "" },
      { name = "DATABREEZE_IAM_EMAIL_FROM_ADDRESS", value = "" },
      { name = "DATABREEZE_IAM_EMAIL_SES_REGION", value = "ap-southeast-1" },
      { name = "DATABREEZE_IAE_ARTIFACT_BUCKET", value = "databreeze-compute-test-artifacts" },
      { name = "DATABREEZE_IAE_ARTIFACT_REGION", value = "ap-southeast-1" },
      { name = "DATABREEZE_IAE_ARTIFACT_KMS_KEY_ARN", value = "arn:aws:kms:ap-southeast-1:123456789012:key/test" },
      { name = "DATABREEZE_OPENAI_AGENT_ENABLED", value = "true" },
      { name = "DATABREEZE_OPENAI_RECEIPT_ENABLED", value = "false" },
      { name = "DATABREEZE_OPENAI_DASHBOARD_ENABLED", value = "false" },
      { name = "DATABREEZE_OPENAI_AGENT_MODEL", value = "gpt-4o-mini-2024-07-18" },
      { name = "DATABREEZE_OPENAI_AGENT_TIMEOUT_MS", value = "45000" },
      { name = "DATABREEZE_OPENAI_AGENT_MAX_OUTPUT_TOKENS", value = "3072" },
      { name = "DATABREEZE_OPENAI_RECEIPT_MODEL", value = "gpt-4o-mini-2024-07-18" },
      { name = "DATABREEZE_OPENAI_DASHBOARD_MODEL", value = "gpt-4o-mini-2024-07-18" },
      { name = "DATABREEZE_OPENAI_IMAGE_DETAIL", value = "high" },
      { name = "DATABREEZE_OPENAI_TIMEOUT_MS", value = "30000" },
      { name = "DATABREEZE_OPENAI_MAX_OUTPUT_TOKENS", value = "2048" },
    ]
    error_message = "The API task must receive only bounded non-secret OpenAI configuration matching the API parsers."
  }

  assert {
    condition = jsondecode(aws_ecs_task_definition.api.container_definitions)[0].secrets == [
      {
        name      = "DATABASE_URL"
        valueFrom = var.database_url_secret_arn
      },
      {
        name      = "DATABREEZE_CSRF_ALLOWED_ORIGINS"
        valueFrom = var.csrf_allowed_origins_secret_arn
      },
      {
        name      = "DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY"
        valueFrom = var.service_account_secret_envelope_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY"
        valueFrom = var.email_verification_digest_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY"
        valueFrom = var.email_verification_envelope_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY"
        valueFrom = var.registration_admission_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY"
        valueFrom = var.iae_worker_capability_signing_key_secret_arn
      },
      {
        name      = "OPENAI_API_KEY"
        valueFrom = var.openai_api_key_secret_arn
      },
    ]
    error_message = "The enabled API must receive the raw OpenAI key through one dedicated whole-secret ARN."
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].secrets == [
        { name = "DATABREEZE_WORKER_BEARER_TOKEN", valueFrom = var.worker_service_account_bearer_secret_arn },
      ] &&
      jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].environment == [
        { name = "DATABREEZE_WORKER_API_ENDPOINT", value = var.worker_api_endpoint },
      ] &&
      jsondecode(aws_iam_role_policy.execution_secrets.policy).Statement[0].Resource == [
        var.database_url_secret_arn,
        var.csrf_allowed_origins_secret_arn,
        var.service_account_secret_envelope_key_secret_arn,
        var.email_verification_digest_key_secret_arn,
        var.email_verification_envelope_key_secret_arn,
        var.registration_admission_key_secret_arn,
        var.iae_worker_capability_signing_key_secret_arn,
        var.openai_api_key_secret_arn,
      ] &&
      jsondecode(aws_iam_role_policy.execution_secrets.policy).Statement[1].Condition["StringEquals"]["kms:EncryptionContext:SecretARN"] == [
        var.database_url_secret_arn,
        var.csrf_allowed_origins_secret_arn,
        var.service_account_secret_envelope_key_secret_arn,
        var.email_verification_digest_key_secret_arn,
        var.email_verification_envelope_key_secret_arn,
        var.registration_admission_key_secret_arn,
        var.iae_worker_capability_signing_key_secret_arn,
        var.openai_api_key_secret_arn,
      ] &&
      aws_ecs_service.api[0].task_definition == aws_ecs_task_definition.api.arn
    )
    error_message = "Only the API execution policy may reference the OpenAI secret, constrained to its Secrets Manager encryption context; the worker stays credential-free."
  }
}

run "publishes_openai_secret_when_receipt_only_is_enabled" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    openai_api_key_secret_arn                      = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/openai/api-key-MnOpQr"
    openai_agent_enabled                           = false
    openai_receipt_enabled                         = true
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.api.container_definitions)[0].secrets[7] == {
        name      = "OPENAI_API_KEY"
        valueFrom = var.openai_api_key_secret_arn
      } &&
      jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment[7].value == "false" &&
      jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment[8].value == "true"
    )
    error_message = "Either OpenAI feature must activate the same API-only secret injection while preserving explicit flags."
  }
}

run "disabled_openai_features_omit_secret" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    openai_api_key_secret_arn                      = ""
    openai_agent_enabled                           = false
    openai_receipt_enabled                         = false
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  assert {
    condition = (
      length(jsondecode(aws_ecs_task_definition.api.container_definitions)[0].secrets) == 7 &&
      length([for secret in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].secrets : secret if secret.name == "OPENAI_API_KEY"]) == 0 &&
      jsondecode(aws_iam_role_policy.execution_secrets.policy).Statement[0].Resource == [
        var.database_url_secret_arn,
        var.csrf_allowed_origins_secret_arn,
        var.service_account_secret_envelope_key_secret_arn,
        var.email_verification_digest_key_secret_arn,
        var.email_verification_envelope_key_secret_arn,
        var.registration_admission_key_secret_arn,
        var.iae_worker_capability_signing_key_secret_arn,
      ]
    )
    error_message = "Disabled OpenAI features must omit the OpenAI secret from the API task and execution policy."
  }
}

run "rejects_agent_without_openai_secret" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    openai_api_key_secret_arn                      = ""
    openai_agent_enabled                           = true
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [aws_ecs_task_definition.api]
}

run "rejects_receipt_without_openai_secret" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    openai_api_key_secret_arn                      = ""
    openai_receipt_enabled                         = true
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [aws_ecs_task_definition.api]
}

run "rejects_openai_json_key_suffix" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    openai_api_key_secret_arn                      = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/openai/api-key-MnOpQr:OPENAI_API_KEY"
    openai_agent_enabled                           = true
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [var.openai_api_key_secret_arn]
}

run "rejects_openai_version_suffix" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    openai_api_key_secret_arn                      = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/openai/api-key-MnOpQr:AWSCURRENT"
    openai_receipt_enabled                         = true
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [var.openai_api_key_secret_arn]
}

run "rejects_openai_cross_region_arn" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    openai_api_key_secret_arn                      = "arn:aws:secretsmanager:us-west-2:123456789012:secret:databreeze/compute-test/openai/api-key-MnOpQr"
    openai_agent_enabled                           = true
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [var.openai_api_key_secret_arn]
}

run "rejects_database_json_key_suffix" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf:DATABASE_URL"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [var.database_url_secret_arn]
}

run "rejects_csrf_wrong_region_and_account" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:us-west-2:12345678901:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [var.csrf_allowed_origins_secret_arn]
}

run "rejects_valid_foreign_account_runtime_arn" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:210987654321:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [aws_ecs_task_definition.api]
}

run "rejects_valid_foreign_account_csrf_arn" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:210987654321:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [aws_ecs_task_definition.api]
}

run "rejects_service_account_json_key_suffix" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv:KEY"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [var.service_account_secret_envelope_key_secret_arn]
}

run "rejects_service_account_foreign_account_arn" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:210987654321:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [aws_ecs_task_definition.api]
}

run "publishes_public_https_api_and_dashboard_ai" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    public_subnet_ids                              = ["subnet-public-a", "subnet-public-b"]
    vpc_id                                         = "vpc-test"
    api_security_group_id                          = "sg-api"
    api_load_balancer_security_group_id            = "sg-load-balancer"
    api_certificate_arn                            = "arn:aws:acm:ap-southeast-1:123456789012:certificate/00000000-0000-4000-8000-000000000001"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    openai_api_key_secret_arn                      = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/openai/api-key-MnOpQr"
    openai_dashboard_enabled                       = true
    openai_dashboard_model                         = "gpt-4o-mini-2024-07-18"
    environment                                    = "production"
    enable_services                                = true
    enable_public_api                              = true
    private_egress_enabled                         = true
    api_desired_count                              = 2
    worker_desired_count                           = 2
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  assert {
    condition = (
      output.api_load_balancer_dns_name != null &&
      output.api_https_listener_arn != null
    )
    error_message = "The public API must terminate HTTPS and route only ready IP targets to the API service."
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment[9] == {
        name  = "DATABREEZE_OPENAI_DASHBOARD_ENABLED"
        value = "true"
      } &&
      jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment[14] == {
        name  = "DATABREEZE_OPENAI_DASHBOARD_MODEL"
        value = "gpt-4o-mini-2024-07-18"
      } &&
      jsondecode(aws_ecs_task_definition.api.container_definitions)[0].secrets[7] == {
        name      = "OPENAI_API_KEY"
        valueFrom = var.openai_api_key_secret_arn
      }
    )
    error_message = "Dashboard AI must be independently enabled and receive the server-side OpenAI secret."
  }
}

run "rejects_dashboard_ai_without_openai_secret" {
  command = plan

  variables {
    name                                           = "compute-test"
    region                                         = "ap-southeast-1"
    private_subnet_ids                             = ["subnet-private-a", "subnet-private-b"]
    api_security_group_id                          = "sg-api"
    kms_key_arn                                    = "arn:aws:kms:ap-southeast-1:123456789012:key/test"
    database_url_secret_arn                        = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/database-AbCdEf"
    csrf_allowed_origins_secret_arn                = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/csrf-allowed-origins-GhIjKl"
    service_account_secret_envelope_key_secret_arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/service-account-envelope-key-QrStUv"
    email_verification_digest_key_secret_arn       = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-digest-key-AbCdEf"
    email_verification_envelope_key_secret_arn     = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/email-verification-envelope-key-GhIjKl"
    registration_admission_key_secret_arn          = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/compute-test/iam/registration-admission-key-MnOpQr"
    openai_api_key_secret_arn                      = ""
    openai_dashboard_enabled                       = true
    environment                                    = "production"
    api_image                                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  expect_failures = [aws_ecs_task_definition.api]
}
