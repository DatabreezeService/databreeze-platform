output "database_endpoint" {
  value = try(aws_db_instance.postgres[0].address, null)
}

output "database_port" {
  value = try(aws_db_instance.postgres[0].port, null)
}

output "database_master_secret_arn" {
  value = try(aws_db_instance.postgres[0].master_user_secret[0].secret_arn, null)
}

output "redis_endpoint" {
  value = try(aws_elasticache_replication_group.redis[0].primary_endpoint_address, null)
}

output "artifact_bucket_name" {
  value = aws_s3_bucket.artifacts.bucket
}

output "artifact_bucket_arn" {
  value = aws_s3_bucket.artifacts.arn
}
