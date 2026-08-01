output "kms_key_arn" {
  value = aws_kms_key.platform.arn
}

output "database_secret_arn" {
  value = aws_secretsmanager_secret.database.arn
}

output "application_secret_arn" {
  value = aws_secretsmanager_secret.application.arn
}

output "github_deploy_role_arn" {
  value = try(aws_iam_role.github_deploy[0].arn, null)
}
