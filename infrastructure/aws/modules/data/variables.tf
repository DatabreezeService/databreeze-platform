variable "name" {
  type        = string
  description = "Stable deployment name."
}

variable "environment" {
  type        = string
  description = "Deployment environment used for production recovery preconditions."
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnets for managed data services."
}

variable "database_security_group_id" {
  type        = string
  description = "Security group allowed to receive PostgreSQL traffic."
}

variable "cache_security_group_id" {
  type        = string
  description = "Security group allowed to receive Redis traffic."
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key for RDS and ElastiCache encryption."
}

variable "artifact_upload_cors_allowed_origins" {
  type        = list(string)
  description = "Exact HTTPS Web origins allowed to use checksum-bound presigned artifact PUT grants."
  default     = []

  validation {
    condition = length(var.artifact_upload_cors_allowed_origins) <= 16 && alltrue([
      for origin in var.artifact_upload_cors_allowed_origins : can(regex("^https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?$", origin))
    ])
    error_message = "artifact_upload_cors_allowed_origins must contain at most 16 exact HTTPS origins."
  }
}

variable "enable_database" {
  type        = bool
  description = "Create RDS and ElastiCache resources."
  default     = true
}

variable "database_instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t4g.micro"
}

variable "database_name" {
  type    = string
  default = "databreeze"
}

variable "database_username" {
  type    = string
  default = "databreeze"
}

variable "backup_retention_period" {
  type        = number
  description = "RDS backup retention in days; production must be at least 7."
  default     = 1
}

variable "deletion_protection" {
  type    = bool
  default = false
}

variable "database_multi_az" {
  type        = bool
  description = "Run RDS across multiple AZs."
  default     = false
}

variable "redis_num_cache_clusters" {
  type        = number
  description = "Redis node count; production should use at least two."
  default     = 1
}

variable "redis_automatic_failover_enabled" {
  type    = bool
  default = false
}

variable "redis_multi_az_enabled" {
  type    = bool
  default = false
}

variable "redis_engine_version" {
  type        = string
  description = "AWS-supported Redis engine version."
  default     = "7.2"
}

variable "tags" {
  type    = map(string)
  default = {}
}
