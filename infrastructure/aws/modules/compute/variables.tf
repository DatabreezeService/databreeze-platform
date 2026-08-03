variable "name" {
  type        = string
  description = "Stable deployment name."
}

variable "region" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "api_security_group_id" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "database_secret_arn" {
  type        = string
  description = "Secrets Manager ARN injected into task definitions by reference."
}

variable "application_secret_arn" {
  type        = string
  description = "Secrets Manager ARN injected into task definitions by reference."
}

variable "environment" {
  type        = string
  description = "Deployment environment used for production safety preconditions."
}

variable "private_egress_enabled" {
  type        = bool
  description = "Whether private subnets have NAT or equivalent VPC endpoints."
  default     = false
}

variable "api_image" {
  type    = string
  default = "ghcr.io/databreeze/api:dev"
}

variable "worker_image" {
  type    = string
  default = "ghcr.io/databreeze/worker:dev"
}

variable "enable_services" {
  type        = bool
  description = "Create ECS services; task definitions and roles remain available when false."
  default     = false
}

variable "api_desired_count" {
  type    = number
  default = 1
}

variable "worker_desired_count" {
  type    = number
  default = 1
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "worker_cpu" {
  type        = number
  description = "Fargate task CPU units reserved for the worker pool."
  default     = 1024

  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.worker_cpu)
    error_message = "worker_cpu must be a supported Fargate CPU size."
  }
}

variable "worker_memory" {
  type        = number
  description = "Fargate task memory (MiB) reserved for the worker pool."
  default     = 2048

  validation {
    condition     = var.worker_memory >= 512 && var.worker_memory <= 30720
    error_message = "worker_memory must be between 512 and 30720 MiB."
  }
}

variable "tags" {
  type    = map(string)
  default = {}
}
