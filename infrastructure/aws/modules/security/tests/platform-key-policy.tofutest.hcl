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
      json = <<-JSON
        {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Sid": "AccountAdministration",
              "Effect": "Allow",
              "Action": ["kms:*"],
              "Resource": ["*"],
              "Principal": {"AWS": "arn:aws:iam::123456789012:root"}
            },
            {
              "Sid": "RegionalServiceEncryption",
              "Effect": "Allow",
              "Action": ["kms:Decrypt", "kms:DescribeKey", "kms:Encrypt"],
              "Resource": ["*"],
              "Principal": {"Service": ["logs.ap-southeast-1.amazonaws.com", "s3.amazonaws.com"]}
            },
            {
              "Sid": "SecretsManagerDataBreezeSecrets",
              "Effect": "Allow",
              "Action": ["kms:Decrypt", "kms:DescribeKey", "kms:Encrypt"],
              "Resource": ["*"],
              "Principal": {"Service": "secretsmanager.amazonaws.com"},
              "Condition": {
                "StringLike": {
                  "kms:EncryptionContext:SecretARN": "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/production/*",
                  "kms:ViaService": "secretsmanager.ap-southeast-1.amazonaws.com"
                }
              }
            }
          ]
        }
      JSON
    }
  }

  mock_resource "aws_kms_key" {
    defaults = {
      arn    = "arn:aws:kms:ap-southeast-1:123456789012:key/databreeze-test"
      key_id = "databreeze-test"
    }
  }
}

run "scopes_secrets_manager_context_to_databreeze_prefix" {
  command = plan

  variables {
    name   = "production"
    region = "ap-southeast-1"
  }

  assert {
    condition = (
      jsondecode(aws_kms_key.platform.policy).Statement[1].Sid == "RegionalServiceEncryption" &&
      jsondecode(aws_kms_key.platform.policy).Statement[1].Principal.Service != "secretsmanager.amazonaws.com" &&
      jsondecode(aws_kms_key.platform.policy).Statement[2].Sid == "SecretsManagerDataBreezeSecrets" &&
      jsondecode(aws_kms_key.platform.policy).Statement[2].Condition["StringLike"]["kms:EncryptionContext:SecretARN"] == "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:databreeze/production/*" &&
      jsondecode(aws_kms_key.platform.policy).Statement[2].Condition["StringLike"]["kms:ViaService"] == "secretsmanager.ap-southeast-1.amazonaws.com"
    )
    error_message = "The rendered KMS policy must restrict Secrets Manager decrypt/encryption context to the current DataBreeze secret prefix and region."
  }
}

run "creates_dedicated_whole_openai_api_key_secret" {
  command = plan

  variables {
    name   = "production"
    region = "ap-southeast-1"
  }

  assert {
    condition = (
      aws_secretsmanager_secret.openai_api_key.name == "databreeze/production/openai/api-key" &&
      strcontains(aws_secretsmanager_secret.openai_api_key.description, "raw OPENAI_API_KEY") &&
      aws_secretsmanager_secret.openai_api_key.recovery_window_in_days == 30
    )
    error_message = "The security module must create a dedicated recoverable whole secret for the raw OpenAI API key without storing its value in Terraform."
  }
}

run "creates_dedicated_whole_service_account_envelope_key_secret" {
  command = plan

  variables {
    name   = "production"
    region = "ap-southeast-1"
  }

  assert {
    condition = (
      aws_secretsmanager_secret.service_account_secret_envelope_key.name == "databreeze/production/iam/service-account-envelope-key" &&
      strcontains(aws_secretsmanager_secret.service_account_secret_envelope_key.description, "base64url-encoded 32-byte") &&
      aws_secretsmanager_secret.service_account_secret_envelope_key.recovery_window_in_days == 30
    )
    error_message = "The security module must create a dedicated recoverable whole secret for the service-account envelope key without storing its value in Terraform."
  }
}

run "creates_separate_api_signing_and_worker_bearer_secrets" {
  command = plan

  variables {
    name   = "production"
    region = "ap-southeast-1"
  }

  assert {
    condition = (
      aws_secretsmanager_secret.iae_worker_capability_signing_key.name == "databreeze/production/iae/worker-capability-signing-key" &&
      strcontains(aws_secretsmanager_secret.iae_worker_capability_signing_key.description, "base64url-encoded 32-byte") &&
      aws_secretsmanager_secret.iae_worker_capability_signing_key.recovery_window_in_days == 30 &&
      aws_secretsmanager_secret.worker_service_account_bearer.name == "databreeze/production/worker/service-account-bearer" &&
      strcontains(aws_secretsmanager_secret.worker_service_account_bearer.description, "worker service-account bearer") &&
      aws_secretsmanager_secret.worker_service_account_bearer.recovery_window_in_days == 30
    )
    error_message = "Security must create distinct owner-populated secrets for API-only capability signing and worker-only service-account authentication."
  }

  assert {
    condition = (
      output.iae_worker_capability_signing_key_secret_arn == aws_secretsmanager_secret.iae_worker_capability_signing_key.arn &&
      output.worker_service_account_bearer_secret_arn == aws_secretsmanager_secret.worker_service_account_bearer.arn
    )
    error_message = "Security must publish only the two secret ARNs, never secret values."
  }
}
