locals {
  common_tags = merge(var.tags, { Component = "security" })
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "platform_key" {
  statement {
    sid       = "AccountAdministration"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "RegionalServiceEncryption"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey", "kms:Encrypt", "kms:GenerateDataKey*", "kms:ReEncrypt*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = [
        "logs.${var.region}.amazonaws.com",
        "s3.amazonaws.com",
        "secretsmanager.amazonaws.com"
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
      values   = [
        "logs.${var.region}.amazonaws.com",
        "s3.${var.region}.amazonaws.com",
        "secretsmanager.${var.region}.amazonaws.com"
      ]
    }
  }

  statement {
    sid       = "CloudFrontOriginAccess"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
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
      values   = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/*"]
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
  description             = "Database credential reference; value is injected out of band."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-database" })
}

resource "aws_secretsmanager_secret" "application" {
  name                    = "databreeze/${var.name}/application"
  description             = "Application provider credentials; value is injected out of band."
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30
  tags                    = merge(local.common_tags, { Name = "${var.name}-application" })
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
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
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
