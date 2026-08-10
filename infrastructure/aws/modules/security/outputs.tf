output "kms_key_arn" {
  value = aws_kms_key.platform.arn
}

output "database_secret_arn" {
  value = aws_secretsmanager_secret.database.arn
}

output "application_secret_arn" {
  value = aws_secretsmanager_secret.application.arn
}

output "openai_receipt_ocr_secret_arn" {
  value = aws_secretsmanager_secret.openai_receipt_ocr.arn
}

output "github_deploy_role_arn" {
  value = try(aws_iam_role.github_deploy[0].arn, null)
}
