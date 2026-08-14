output "region" {
  value = var.aws_region
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "web_bucket" {
  value = module.web.bucket_name
}

output "web_distribution_domain" {
  value = module.web.distribution_domain_name
}

output "database_endpoint" {
  value     = module.data.database_endpoint
  sensitive = true
}

output "redis_endpoint" {
  value     = module.data.redis_endpoint
  sensitive = true
}

output "ecs_cluster" {
  value = module.compute.cluster_arn
}

output "artifact_bucket" {
  value = module.data.artifact_bucket_name
}

output "api_load_balancer_dns_name" {
  description = "Content-safe public API load balancer DNS name for reviewed DNS and TLS smoke checks."
  value       = module.compute.api_load_balancer_dns_name
}

output "api_https_listener_arn" {
  description = "Content-safe public API HTTPS listener ARN for deployment evidence."
  value       = module.compute.api_https_listener_arn
}

output "github_deploy_role" {
  value = module.security.github_deploy_role_arn
}
