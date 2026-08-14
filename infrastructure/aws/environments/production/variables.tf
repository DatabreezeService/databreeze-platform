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

variable "worker_api_endpoint" {
  type        = string
  description = "Exact HTTPS API origin used by the authenticated worker; required before ECS services are enabled."
  default     = ""

  validation {
    condition     = trimspace(var.worker_api_endpoint) == "" || can(regex("^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::443)?$", trimspace(var.worker_api_endpoint)))
    error_message = "worker_api_endpoint must be empty or an exact HTTPS origin without credentials, path, query, or fragment."
  }
}

variable "web_aliases" {
  type        = list(string)
  description = "Optional custom Web hostnames for CloudFront."
  default     = []
}

variable "web_acm_certificate_arn" {
  type        = string
  description = "Reviewed us-east-1 ACM certificate ARN for Web CloudFront aliases."
  default     = ""
}

variable "web_connect_src_origins" {
  type        = list(string)
  description = "Exact reviewed HTTPS API origins allowed by the Web Content Security Policy."
  default     = []
}

variable "api_certificate_arn" {
  type        = string
  description = "Reviewed ACM certificate ARN for the hosted API; required when ECS services are enabled."
  default     = ""
}

variable "iam_email_from_address" {
  type        = string
  description = "Owner-configured SES-verified sender address for registration OTP delivery."
  default     = ""
}

variable "openai_agent_enabled" {
  type        = bool
  description = "Enable the API OpenAI agent after the owner populates the dedicated secret."
  default     = false
}

variable "openai_receipt_enabled" {
  type        = bool
  description = "Enable API receipt OCR after the owner populates the dedicated secret."
  default     = false
}

variable "openai_dashboard_enabled" {
  type        = bool
  description = "Enable typed OpenAI dashboard proposals after the owner populates the dedicated secret."
  default     = false
}

variable "openai_agent_model" {
  type    = string
  default = "gpt-4o-mini-2024-07-18"
}

variable "openai_agent_timeout_ms" {
  type    = number
  default = 30000
}

variable "openai_agent_max_output_tokens" {
  type    = number
  default = 2048
}

variable "openai_receipt_model" {
  type    = string
  default = "gpt-4o-mini-2024-07-18"
}

variable "openai_dashboard_model" {
  type    = string
  default = "gpt-4o-mini-2024-07-18"
}

variable "openai_image_detail" {
  type    = string
  default = "high"
}

variable "openai_timeout_ms" {
  type    = number
  default = 30000
}

variable "openai_max_output_tokens" {
  type    = number
  default = 2048
}
