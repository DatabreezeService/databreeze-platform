output "kms_key_arn" {
  value = aws_kms_key.platform.arn
}

output "database_url_secret_arn" {
  value = aws_secretsmanager_secret.database.arn
}

output "csrf_allowed_origins_secret_arn" {
  value = aws_secretsmanager_secret.csrf_allowed_origins.arn
}

output "service_account_secret_envelope_key_secret_arn" {
  value = aws_secretsmanager_secret.service_account_secret_envelope_key.arn
}

output "email_verification_digest_key_secret_arn" {
  value = aws_secretsmanager_secret.email_verification_digest_key.arn
}

output "recovery_digest_key_secret_arn" {
  value = aws_secretsmanager_secret.recovery_digest_key.arn
}

output "email_verification_envelope_key_secret_arn" {
  value = aws_secretsmanager_secret.email_verification_envelope_key.arn
}

output "registration_admission_key_secret_arn" {
  value = aws_secretsmanager_secret.registration_admission_key.arn
}

output "iae_worker_capability_signing_key_secret_arn" {
  value = aws_secretsmanager_secret.iae_worker_capability_signing_key.arn
}

output "worker_service_account_bearer_secret_arn" {
  value = aws_secretsmanager_secret.worker_service_account_bearer.arn
}

output "application_secret_arn" {
  value = aws_secretsmanager_secret.application.arn
}

output "openai_receipt_ocr_secret_arn" {
  value = aws_secretsmanager_secret.openai_receipt_ocr.arn
}

output "openai_api_key_secret_arn" {
  value = aws_secretsmanager_secret.openai_api_key.arn
}

output "platform_key_policy" {
  value = aws_kms_key.platform.policy
}

output "github_deploy_role_arn" {
  value = try(aws_iam_role.github_deploy[0].arn, null)
}
