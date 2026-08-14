# Requirement links: Plan 401 Tasks 2-3, Plan 406 Task 19, DDA-057, and DDA-060.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:root"
      user_id    = "123456789012"
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

  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }

  mock_resource "aws_kms_key" {
    defaults = {
      arn    = "arn:aws:kms:ap-southeast-1:123456789012:key/databreeze-mock"
      key_id = "databreeze-mock"
    }
  }

  mock_resource "aws_secretsmanager_secret" {
    defaults = {
      arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze-mock-AbCdEf"
    }
  }
}

variables {
  api_image    = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  worker_image = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
}

override_resource {
  target = module.security.aws_secretsmanager_secret.service_account_secret_envelope_key
  values = {
    arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/production/iam/service-account-envelope-key-AbCdEf"
  }
}

override_resource {
  target = module.security.aws_secretsmanager_secret.email_verification_digest_key
  values = {
    arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/production/iam/email-verification-digest-key-AbCdEf"
  }
}

override_resource {
  target = module.security.aws_secretsmanager_secret.email_verification_envelope_key
  values = {
    arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/production/iam/email-verification-envelope-key-AbCdEf"
  }
}

override_resource {
  target = module.security.aws_secretsmanager_secret.registration_admission_key
  values = {
    arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/production/iam/registration-admission-key-AbCdEf"
  }
}

override_resource {
  target = module.security.aws_secretsmanager_secret.iae_worker_capability_signing_key
  values = {
    arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/production/iae/worker-capability-signing-key-AbCdEf"
  }
}

override_resource {
  target = module.security.aws_secretsmanager_secret.worker_service_account_bearer
  values = {
    arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/production/worker/service-account-bearer-AbCdEf"
  }
}

override_resource {
  target = module.security.aws_secretsmanager_secret.database
  values = {
    arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/production/database-AbCdEf"
  }
}

override_resource {
  target = module.security.aws_secretsmanager_secret.csrf_allowed_origins
  values = {
    arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/production/csrf-allowed-origins-AbCdEf"
  }
}

override_resource {
  target = module.security.aws_secretsmanager_secret.openai_api_key
  values = {
    arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/production/openai/api-key-AbCdEf"
  }
}

run "safe_production_defaults_plan" {
  command = plan

  assert {
    condition     = output.region == "ap-southeast-1"
    error_message = "The production plan must remain in the approved Singapore region."
  }

  assert {
    condition     = !var.enable_nat_gateway && !var.enable_database && !var.enable_ecs_services
    error_message = "Credential-free production defaults must keep recurring-cost services disabled until owner apply."
  }

  assert {
    condition     = var.deletion_protection == true
    error_message = "Production defaults must keep deletion protection enabled."
  }

  assert {
    condition     = var.backup_retention_period >= 7
    error_message = "Production defaults must retain backups for at least seven days."
  }

  assert {
    condition     = var.api_desired_count >= 2 && var.worker_desired_count >= 2
    error_message = "Production defaults must target at least two API and worker tasks."
  }
}

run "api_runtime_secret_contract" {
  command = plan

  assert {
    condition = jsondecode(module.compute.api_task_definition_container_definitions)[0].secrets == [
      {
        name      = "DATABASE_URL"
        valueFrom = module.security.database_url_secret_arn
      },
      {
        name      = "DATABREEZE_CSRF_ALLOWED_ORIGINS"
        valueFrom = module.security.csrf_allowed_origins_secret_arn
      },
      {
        name      = "DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY"
        valueFrom = module.security.service_account_secret_envelope_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY"
        valueFrom = module.security.email_verification_digest_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY"
        valueFrom = module.security.email_verification_envelope_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY"
        valueFrom = module.security.registration_admission_key_secret_arn
      },
      {
        name      = "DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY"
        valueFrom = module.security.iae_worker_capability_signing_key_secret_arn
      },
    ]
    error_message = "The production API task definition must map exactly the two runtime names to their dedicated whole-secret ARNs."
  }

  assert {
    condition = (
      jsondecode(module.compute.api_execution_secret_policy).Statement[0].Action == ["secretsmanager:GetSecretValue"] &&
      jsondecode(module.compute.api_execution_secret_policy).Statement[0].Resource == [
        module.security.database_url_secret_arn,
        module.security.csrf_allowed_origins_secret_arn,
        module.security.service_account_secret_envelope_key_secret_arn,
        module.security.email_verification_digest_key_secret_arn,
        module.security.email_verification_envelope_key_secret_arn,
        module.security.registration_admission_key_secret_arn,
        module.security.iae_worker_capability_signing_key_secret_arn,
      ]
    )
    error_message = "The production API execution policy must grant GetSecretValue only for the two runtime secret ARNs."
  }

  assert {
    condition = (
      jsondecode(module.compute.api_execution_secret_policy).Statement[1].Action == ["kms:Decrypt"] &&
      jsondecode(module.compute.api_execution_secret_policy).Statement[1].Condition["StringEquals"]["kms:ViaService"] == "secretsmanager.${var.aws_region}.amazonaws.com" &&
      jsondecode(module.compute.api_execution_secret_policy).Statement[1].Condition["StringEquals"]["kms:EncryptionContext:SecretARN"] == [
        module.security.database_url_secret_arn,
        module.security.csrf_allowed_origins_secret_arn,
        module.security.service_account_secret_envelope_key_secret_arn,
        module.security.email_verification_digest_key_secret_arn,
        module.security.email_verification_envelope_key_secret_arn,
        module.security.registration_admission_key_secret_arn,
        module.security.iae_worker_capability_signing_key_secret_arn,
      ]
    )
    error_message = "The production API KMS policy must be restricted to Secrets Manager and both runtime secret encryption contexts."
  }
}

run "openai_feature_contract" {
  command = plan

  variables {
    openai_agent_enabled           = true
    openai_receipt_enabled         = false
    openai_agent_model             = "gpt-4o-mini-2024-07-18"
    openai_agent_timeout_ms        = 30000
    openai_agent_max_output_tokens = 2048
    openai_receipt_model           = "gpt-4o-mini-2024-07-18"
    openai_image_detail            = "high"
    api_image                      = "ghcr.io/databreeze/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image                   = "ghcr.io/databreeze/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }

  assert {
    condition = jsondecode(module.compute.api_task_definition_container_definitions)[0].environment == [
      { name = "NODE_ENV", value = "production" },
      { name = "DATABREEZE_REDIS_URL", value = "" },
      { name = "DATABREEZE_IAM_EMAIL_FROM_ADDRESS", value = "" },
      { name = "DATABREEZE_IAM_EMAIL_SES_REGION", value = "ap-southeast-1" },
      { name = "DATABREEZE_IAE_ARTIFACT_BUCKET", value = "databreeze-production-artifacts" },
      { name = "DATABREEZE_IAE_ARTIFACT_REGION", value = "ap-southeast-1" },
      { name = "DATABREEZE_IAE_ARTIFACT_KMS_KEY_ARN", value = "arn:aws:kms:ap-southeast-1:123456789012:key/databreeze-mock" },
      { name = "DATABREEZE_OPENAI_AGENT_ENABLED", value = "true" },
      { name = "DATABREEZE_OPENAI_RECEIPT_ENABLED", value = "false" },
      { name = "DATABREEZE_OPENAI_DASHBOARD_ENABLED", value = "false" },
      { name = "DATABREEZE_OPENAI_AGENT_MODEL", value = "gpt-4o-mini-2024-07-18" },
      { name = "DATABREEZE_OPENAI_AGENT_TIMEOUT_MS", value = "30000" },
      { name = "DATABREEZE_OPENAI_AGENT_MAX_OUTPUT_TOKENS", value = "2048" },
      { name = "DATABREEZE_OPENAI_RECEIPT_MODEL", value = "gpt-4o-mini-2024-07-18" },
      { name = "DATABREEZE_OPENAI_DASHBOARD_MODEL", value = "gpt-4o-mini-2024-07-18" },
      { name = "DATABREEZE_OPENAI_IMAGE_DETAIL", value = "high" },
      { name = "DATABREEZE_OPENAI_TIMEOUT_MS", value = "30000" },
      { name = "DATABREEZE_OPENAI_MAX_OUTPUT_TOKENS", value = "2048" },
    ]
    error_message = "Production must render bounded non-secret OpenAI configuration for the API parser."
  }

  assert {
    condition = (
      jsondecode(module.compute.api_task_definition_container_definitions)[0].secrets[7] == {
        name      = "OPENAI_API_KEY"
        valueFrom = module.security.openai_api_key_secret_arn
      } &&
      jsondecode(module.compute.api_execution_secret_policy).Statement[0].Resource == [
        module.security.database_url_secret_arn,
        module.security.csrf_allowed_origins_secret_arn,
        module.security.service_account_secret_envelope_key_secret_arn,
        module.security.email_verification_digest_key_secret_arn,
        module.security.email_verification_envelope_key_secret_arn,
        module.security.registration_admission_key_secret_arn,
        module.security.iae_worker_capability_signing_key_secret_arn,
        module.security.openai_api_key_secret_arn,
      ]
    )
    error_message = "Production must pass the dedicated whole-secret ARN to the API task and exact execution policy."
  }
}
