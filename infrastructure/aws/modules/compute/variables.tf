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
  type        = string
  default     = "ghcr.io/databreeze/api:dev"
}

variable "worker_image" {
  type        = string
  default     = "ghcr.io/databreeze/worker:dev"
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

variable "tags" {
  type    = map(string)
  default = {}
}
