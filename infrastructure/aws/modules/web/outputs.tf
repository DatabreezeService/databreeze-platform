output "bucket_name" {
  value = aws_s3_bucket.web.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.web.arn
}

output "distribution_domain_name" {
  value = try(aws_cloudfront_distribution.web[0].domain_name, null)
}

output "distribution_id" {
  value = try(aws_cloudfront_distribution.web[0].id, null)
}

output "distribution_arn" {
  value = try(aws_cloudfront_distribution.web[0].arn, null)
}
