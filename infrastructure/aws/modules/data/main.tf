locals {
  common_tags = merge(var.tags, { Component = "data" })
}

resource "aws_s3_bucket" "artifacts" {
  bucket = "databreeze-${var.name}-artifacts"
  tags   = merge(local.common_tags, { Name = "databreeze-${var.name}-artifacts", DataClass = "customer-content" })
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter { prefix = "iae-v1/" }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }

  rule {
    id     = "expire-upload-transfer-controls"
    status = "Enabled"
    filter { prefix = "iae-v1/control/transfers/" }
    expiration { days = 1 }
    noncurrent_version_expiration { noncurrent_days = 1 }
  }

  rule {
    id     = "expire-upload-session-controls"
    status = "Enabled"
    filter { prefix = "iae-v1/control/uploads/" }
    expiration { days = 2 }
    noncurrent_version_expiration { noncurrent_days = 1 }
  }

  rule {
    id     = "expire-upload-quarantine"
    status = "Enabled"
    filter { prefix = "iae-v1/quarantine/" }
    expiration { days = 2 }
    noncurrent_version_expiration { noncurrent_days = 1 }
  }

  depends_on = [aws_s3_bucket_versioning.artifacts]
}

resource "aws_s3_bucket_cors_configuration" "artifacts" {
  count  = length(var.artifact_upload_cors_allowed_origins) == 0 ? 0 : 1
  bucket = aws_s3_bucket.artifacts.id
  cors_rule {
    allowed_headers = ["content-length", "x-amz-checksum-sha256"]
    allowed_methods = ["PUT"]
    allowed_origins = var.artifact_upload_cors_allowed_origins
    expose_headers  = ["ETag", "x-amz-checksum-sha256"]
    max_age_seconds = 300
  }
}

data "aws_iam_policy_document" "artifact_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  policy = data.aws_iam_policy_document.artifact_bucket.json
}

resource "aws_db_subnet_group" "this" {
  count      = var.enable_database ? 1 : 0
  name       = "databreeze-${var.name}"
  subnet_ids = var.private_subnet_ids
  tags       = merge(local.common_tags, { Name = "databreeze-${var.name}" })
}

resource "aws_db_instance" "postgres" {
  count = var.enable_database ? 1 : 0

  identifier                      = "databreeze-${var.name}"
  engine                          = "postgres"
  engine_version                  = "17.5"
  instance_class                  = var.database_instance_class
  allocated_storage               = 20
  max_allocated_storage           = 100
  storage_type                    = "gp3"
  storage_encrypted               = true
  kms_key_id                      = var.kms_key_arn
  db_name                         = var.database_name
  username                        = var.database_username
  port                            = 5432
  manage_master_user_password     = true
  master_user_secret_kms_key_id   = var.kms_key_arn
  db_subnet_group_name            = aws_db_subnet_group.this[0].name
  vpc_security_group_ids          = [var.database_security_group_id]
  publicly_accessible             = false
  multi_az                        = var.database_multi_az
  backup_retention_period         = var.backup_retention_period
  backup_window                   = "17:00-17:30"
  maintenance_window              = "sun:18:00-sun:18:30"
  deletion_protection             = var.deletion_protection
  skip_final_snapshot             = false
  final_snapshot_identifier       = "databreeze-${var.name}-final"
  auto_minor_version_upgrade      = true
  copy_tags_to_snapshot           = true
  performance_insights_enabled    = var.environment == "production"
  performance_insights_kms_key_id = var.environment == "production" ? var.kms_key_arn : null
  tags                            = merge(local.common_tags, { Name = "databreeze-${var.name}" })
}

resource "aws_elasticache_subnet_group" "this" {
  count      = var.enable_database ? 1 : 0
  name       = "databreeze-${var.name}"
  subnet_ids = var.private_subnet_ids
  tags       = merge(local.common_tags, { Name = "databreeze-${var.name}" })
}

resource "aws_elasticache_replication_group" "redis" {
  count = var.enable_database ? 1 : 0

  replication_group_id       = "databreeze-${var.name}"
  description                = "DataBreeze ephemeral dispatch and cache (${var.name})"
  engine                     = "redis"
  engine_version             = var.redis_engine_version
  node_type                  = "cache.t4g.micro"
  num_cache_clusters         = var.redis_num_cache_clusters
  port                       = 6379
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  kms_key_id                 = var.kms_key_arn
  subnet_group_name          = aws_elasticache_subnet_group.this[0].name
  security_group_ids         = [var.cache_security_group_id]
  automatic_failover_enabled = var.redis_automatic_failover_enabled
  multi_az_enabled           = var.redis_multi_az_enabled
  tags                       = merge(local.common_tags, { Name = "databreeze-${var.name}" })

  lifecycle {
    precondition {
      condition     = var.environment != "production" || (var.backup_retention_period >= 7 && var.deletion_protection && var.database_multi_az)
      error_message = "Production RDS requires at least seven days of backups, deletion protection, and Multi-AZ."
    }
    precondition {
      condition     = var.environment != "production" || (var.redis_num_cache_clusters >= 2 && var.redis_automatic_failover_enabled && var.redis_multi_az_enabled)
      error_message = "Production Redis requires redundant nodes, automatic failover, and Multi-AZ."
    }
  }
}
