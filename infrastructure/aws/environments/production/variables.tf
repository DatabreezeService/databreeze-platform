variable "aws_region" {
  type        = string
  description = "AWS region. Singapore is the approved initial hosted region."
  default     = "ap-southeast-1"
}

variable "environment" {
  type        = string
  description = "Deployment environment name."
  default     = "production"
}

variable "name" {
  type        = string
  description = "Short, globally unique deployment suffix."
  default     = "production"
}

variable "availability_zones" {
  type    = list(string)
  default = ["ap-southeast-1a", "ap-southeast-1b"]
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "enable_nat_gateway" {
  type        = bool
  description = "Production should enable one NAT gateway per AZ; alpha defaults off to avoid recurring spend."
  default     = false
}

variable "enable_cloudfront" {
  type    = bool
  default = false
}

variable "enable_database" {
  type        = bool
  description = "Create managed RDS/ElastiCache resources; disabled by default to prevent accidental recurring spend."
  default     = false
}

variable "enable_ecs_services" {
  type    = bool
  default = false
}

variable "database_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "backup_retention_period" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "database_multi_az" {
  type    = bool
  default = true
}

variable "redis_num_cache_clusters" {
  type    = number
  default = 2
}

variable "redis_automatic_failover_enabled" {
  type    = bool
  default = true
}

variable "redis_multi_az_enabled" {
  type    = bool
  default = true
}

variable "github_repository" {
  type        = string
  description = "owner/repository for the least-privilege GitHub OIDC role. Empty disables the provider."
  default     = ""
}

variable "api_image" {
  type    = string
  default = "ghcr.io/databreeze/api:dev"
}

variable "worker_image" {
  type    = string
  default = "ghcr.io/databreeze/worker:dev"
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "worker_desired_count" {
  type    = number
  default = 2
}

variable "worker_cpu" {
  type    = number
  default = 1024
}

variable "worker_memory" {
  type    = number
  default = 2048
}
