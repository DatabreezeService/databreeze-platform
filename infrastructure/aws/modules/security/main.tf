locals {
  common_tags = merge(var.tags, { Component = "security" })
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_iam_policy_document" "platform_key" {
  statement {
    sid       = "AccountAdministration"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "RegionalServiceEncryption"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey", "kms:Encrypt", "kms:GenerateDataKey*", "kms:ReEncrypt*"]
    resources = ["*"]
    principals {
      type = "Service"
      identifiers = [
        "logs.${var.region}.amazonaws.com",
        "s3.amazonaws.com"
      ]
    }
    condition {
      test     = "StringEquals"
      variable = "kms:CallerAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
    condition {
      test     = "StringLike"
      variable = "kms:ViaService"
      values = [
        "logs.${var.region}.amazonaws.com",
        "s3.${var.region}.amazonaws.com"
      ]
    }
  }

  statement {
    sid       = "SecretsManagerDataBreezeSecrets"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey", "kms:Encrypt", "kms:GenerateDataKey*", "kms:ReEncrypt*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["secretsmanager.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "kms:CallerAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
    condition {
      test     = "StringLike"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.region}.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:SecretARN"
      values   = ["arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:databreeze/${var.name}/*"]
    }
  }

  statement {
    sid       = "CloudFrontOriginAccess"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey", "kms:Encrypt", "kms:GenerateDataKey*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
    condition {
      test     = "ArnLike"
      variable = "AWS:SourceArn"
      values   = ["arn:${data.aws_partition.current.partition}:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/*"]
    }
  }
}

resource "aws_kms_key" "platform" {
  description             = "DataBreeze platform envelope and storage encryption (${var.name})"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.platform_key.json
  tags                    = merge(local.common_tags, { Name = "${var.name}-platform" })
}

resource "aws_kms_alias" "platform" {
  name          = "alias/databreeze-${var.name}"
  target_key_id = aws_kms_key.platform.key_id
}

resource "aws_secretsmanager_secret" "database" {
  name                    = "databreeze/${var.name}/database"
  description             = "Owner-populated raw PostgreSQL DATABASE_URL; value is injected out of band and never stored in Terraform."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-database" })
}

resource "aws_secretsmanager_secret" "csrf_allowed_origins" {
  name                    = "databreeze/${var.name}/csrf-allowed-origins"
  description             = "Owner-populated comma-separated exact HTTPS origins for DATABREEZE_CSRF_ALLOWED_ORIGINS; value is injected out of band and never stored in Terraform."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-csrf-allowed-origins" })
}

resource "aws_secretsmanager_secret" "service_account_secret_envelope_key" {
  name                    = "databreeze/${var.name}/iam/service-account-envelope-key"
  description             = "Owner-populated base64url-encoded 32-byte service-account envelope key; value is injected out of band and never stored in Terraform."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-service-account-envelope-key" })
}

resource "aws_secretsmanager_secret" "email_verification_digest_key" {
  name                    = "databreeze/${var.name}/iam/email-verification-digest-key"
  description             = "Owner-populated base64url-encoded 32-byte email-verification HMAC key; value is injected out of band and never stored in Terraform."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-email-verification-digest-key" })
}

resource "aws_secretsmanager_secret" "email_verification_envelope_key" {
  name                    = "databreeze/${var.name}/iam/email-verification-envelope-key"
  description             = "Owner-populated base64url-encoded 32-byte email-verification envelope key; value is injected out of band and never stored in Terraform."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-email-verification-envelope-key" })
}

resource "aws_secretsmanager_secret" "registration_admission_key" {
  name                    = "databreeze/${var.name}/iam/registration-admission-key"
  description             = "Owner-populated base64url-encoded 32-byte registration-admission HMAC key; value is injected out of band and never stored in Terraform."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-registration-admission-key" })
}

resource "aws_secretsmanager_secret" "iae_worker_capability_signing_key" {
  name                    = "databreeze/${var.name}/iae/worker-capability-signing-key"
  description             = "Owner-populated base64url-encoded 32-byte IAE worker-capability HMAC signing key for API use only; value is injected out of band and never stored in Terraform."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-iae-worker-capability-signing-key" })
}

resource "aws_secretsmanager_secret" "worker_service_account_bearer" {
  name                    = "databreeze/${var.name}/worker/service-account-bearer"
  description             = "Owner-populated protected worker service-account bearer; value is injected out of band and never stored in Terraform."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-worker-service-account-bearer" })
}

resource "aws_secretsmanager_secret" "application" {
  name                    = "databreeze/${var.name}/application"
  description             = "Application provider credentials; value is injected out of band."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-application" })
}

resource "aws_secretsmanager_secret" "openai_receipt_ocr" {
  name                    = "databreeze/${var.name}/openai/receipt-ocr"
  description             = "Server-side OpenAI receipt OCR credential; value is injected out of band (ADR-0005)."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-openai-receipt-ocr" })
}

resource "aws_secretsmanager_secret" "openai_api_key" {
  name                    = "databreeze/${var.name}/openai/api-key"
  description             = "Owner-populated raw OPENAI_API_KEY for explicitly enabled server-side API features; value is injected out of band and never stored in Terraform."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-openai-api-key" })
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.github_repository == "" ? 0 : 1
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
  tags            = local.common_tags
}

data "aws_iam_policy_document" "github_assume" {
  count = var.github_repository == "" ? 0 : 1

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github[0].arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/dev"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  count              = var.github_repository == "" ? 0 : 1
  name               = "${var.name}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume[0].json
  tags               = merge(local.common_tags, { Name = "${var.name}-github-deploy" })
}

resource "aws_iam_role_policy" "github_deploy" {
  count = var.github_repository == "" ? 0 : 1
  name  = "${var.name}-github-deploy-limited"
  role  = aws_iam_role.github_deploy[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
      Resource = [
        "arn:aws:s3:::databreeze-${var.name}-web",
        "arn:aws:s3:::databreeze-${var.name}-web/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy" "github_kms" {
  count = var.github_repository == "" ? 0 : 1
  name  = "${var.name}-github-kms-upload"
  role  = aws_iam_role.github_deploy[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
      Resource = aws_kms_key.platform.arn
    }]
  })
}
