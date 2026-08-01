output "bucket_name" {
  value = aws_s3_bucket.web.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.web.arn
}

output "distribution_domain_name" {
  value = try(aws_cloudfront_distribution.web[0].domain_name, null)
}
