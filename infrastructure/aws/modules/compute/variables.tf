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

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnets for the optional internet-facing API load balancer."
  default     = []
}

variable "vpc_id" {
  type        = string
  description = "VPC containing the API target group."
  default     = ""
}

variable "api_security_group_id" {
  type = string
}

variable "api_load_balancer_security_group_id" {
  type        = string
  description = "Dedicated security group for the optional public API load balancer."
  default     = ""
}

variable "api_certificate_arn" {
  type        = string
  description = "Reviewed ACM certificate ARN for the public API HTTPS listener."
  default     = ""

  validation {
    condition = trimspace(var.api_certificate_arn) == "" || can(regex(
      "^arn:[^:]+:acm:${var.region}:[0-9]{12}:certificate/[0-9a-fA-F-]{36}$",
      trimspace(var.api_certificate_arn),
    ))
    error_message = "api_certificate_arn must be an ACM certificate ARN in var.region."
  }
}

variable "kms_key_arn" {
  type = string
}

variable "artifact_bucket_name" {
  type        = string
  description = "Private IAE artifact bucket name."
}

variable "artifact_bucket_arn" {
  type        = string
  description = "Private IAE artifact bucket ARN."
}

variable "database_url_secret_arn" {
  type        = string
  description = "Dedicated Secrets Manager ARN containing the raw DATABASE_URL value."

  validation {
    condition = can(regex(
      "^arn:[^:]+:secretsmanager:${var.region}:[0-9]{12}:secret:[^:]+-[A-Za-z0-9]{6}$",
      trimspace(var.database_url_secret_arn),
    ))
    error_message = "database_url_secret_arn must be a whole-secret ARN in var.region without a JSON-key or version suffix."
  }
}

variable "csrf_allowed_origins_secret_arn" {
  type        = string
  description = "Dedicated Secrets Manager ARN containing the raw DATABREEZE_CSRF_ALLOWED_ORIGINS value."

  validation {
    condition = can(regex(
      "^arn:[^:]+:secretsmanager:${var.region}:[0-9]{12}:secret:[^:]+-[A-Za-z0-9]{6}$",
      trimspace(var.csrf_allowed_origins_secret_arn),
    ))
    error_message = "csrf_allowed_origins_secret_arn must be a whole-secret ARN in var.region without a JSON-key or version suffix."
  }
}

variable "service_account_secret_envelope_key_secret_arn" {
  type        = string
  description = "Dedicated whole Secrets Manager ARN containing the base64url-encoded 32-byte service-account envelope key."

  validation {
    condition = can(regex(
      "^arn:[^:]+:secretsmanager:${var.region}:[0-9]{12}:secret:databreeze/${var.name}/iam/service-account-envelope-key-[A-Za-z0-9]{6}$",
      trimspace(var.service_account_secret_envelope_key_secret_arn),
    ))
    error_message = "service_account_secret_envelope_key_secret_arn must be a whole DataBreeze service-account envelope-key secret ARN in var.region without a JSON-key or version suffix."
  }
}

variable "email_verification_digest_key_secret_arn" {
  type        = string
  description = "Dedicated whole Secrets Manager ARN containing the base64url-encoded 32-byte email-verification HMAC key."

  validation {
    condition = can(regex(
      "^arn:[^:]+:secretsmanager:${var.region}:[0-9]{12}:secret:databreeze/${var.name}/iam/email-verification-digest-key-[A-Za-z0-9]{6}$",
      trimspace(var.email_verification_digest_key_secret_arn),
    ))
    error_message = "email_verification_digest_key_secret_arn must be a whole DataBreeze email-verification digest-key secret ARN in var.region."
  }
}

variable "email_verification_envelope_key_secret_arn" {
  type        = string
  description = "Dedicated whole Secrets Manager ARN containing the base64url-encoded 32-byte email-verification envelope key."

  validation {
    condition = can(regex(
      "^arn:[^:]+:secretsmanager:${var.region}:[0-9]{12}:secret:databreeze/${var.name}/iam/email-verification-envelope-key-[A-Za-z0-9]{6}$",
      trimspace(var.email_verification_envelope_key_secret_arn),
    ))
    error_message = "email_verification_envelope_key_secret_arn must be a whole DataBreeze email-verification envelope-key secret ARN in var.region."
  }
}

variable "registration_admission_key_secret_arn" {
  type        = string
  description = "Dedicated whole Secrets Manager ARN containing the base64url-encoded 32-byte registration-admission HMAC key."

  validation {
    condition = can(regex(
      "^arn:[^:]+:secretsmanager:${var.region}:[0-9]{12}:secret:databreeze/${var.name}/iam/registration-admission-key-[A-Za-z0-9]{6}$",
      trimspace(var.registration_admission_key_secret_arn),
    ))
    error_message = "registration_admission_key_secret_arn must be a whole DataBreeze registration-admission secret ARN in var.region."
  }
}

variable "iae_worker_capability_signing_key_secret_arn" {
  type        = string
  description = "Dedicated whole Secrets Manager ARN containing the API-only base64url-encoded 32-byte IAE worker-capability signing key."

  validation {
    condition = can(regex(
      "^arn:[^:]+:secretsmanager:${var.region}:[0-9]{12}:secret:databreeze/${var.name}/iae/worker-capability-signing-key-[A-Za-z0-9]{6}$",
      trimspace(var.iae_worker_capability_signing_key_secret_arn),
    ))
    error_message = "iae_worker_capability_signing_key_secret_arn must be a whole DataBreeze IAE worker-capability signing-key secret ARN in var.region."
  }
}

variable "worker_service_account_bearer_secret_arn" {
  type        = string
  description = "Dedicated whole Secrets Manager ARN containing the protected worker service-account bearer credential."

  validation {
    condition = can(regex(
      "^arn:[^:]+:secretsmanager:${var.region}:[0-9]{12}:secret:databreeze/${var.name}/worker/service-account-bearer-[A-Za-z0-9]{6}$",
      trimspace(var.worker_service_account_bearer_secret_arn),
    ))
    error_message = "worker_service_account_bearer_secret_arn must be a whole DataBreeze worker service-account bearer secret ARN in var.region."
  }
}

variable "worker_api_endpoint" {
  type        = string
  description = "Exact HTTPS API origin used by the authenticated worker runtime."
  default     = ""

  validation {
    condition     = trimspace(var.worker_api_endpoint) == "" || can(regex("^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::443)?$", trimspace(var.worker_api_endpoint)))
    error_message = "worker_api_endpoint must be an exact HTTPS origin without credentials, path, query, or fragment."
  }
}

variable "redis_url" {
  type        = string
  description = "TLS Redis URL used only for shared IAM admission counters. Empty keeps runtime startup fail-closed."
  default     = ""

  validation {
    condition     = trimspace(var.redis_url) == "" || can(regex("^rediss://[A-Za-z0-9.-]+:6379/?$", trimspace(var.redis_url)))
    error_message = "redis_url must be empty or a TLS rediss URL on port 6379 without credentials, path, query, or fragment."
  }
}

variable "iam_email_from_address" {
  type        = string
  description = "Verified SES identity used as the transactional OTP sender. Empty keeps runtime startup fail-closed."
  default     = ""

  validation {
    condition     = trimspace(var.iam_email_from_address) == "" || can(regex("^[^[:space:]@]+@[A-Za-z0-9.-]+$", trimspace(var.iam_email_from_address)))
    error_message = "iam_email_from_address must be empty or a bounded email address without control characters."
  }
}

variable "openai_api_key_secret_arn" {
  type        = string
  description = "Optional dedicated whole Secrets Manager ARN containing the raw OPENAI_API_KEY value."
  default     = ""

  validation {
    condition = trimspace(var.openai_api_key_secret_arn) == "" || can(regex(
      "^arn:[^:]+:secretsmanager:${var.region}:[0-9]{12}:secret:[^:]+-[A-Za-z0-9]{6}$",
      trimspace(var.openai_api_key_secret_arn),
    ))
    error_message = "openai_api_key_secret_arn must be an optional whole-secret ARN for the DataBreeze OpenAI API-key secret in var.region without a JSON-key or version suffix."
  }
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

variable "enable_public_api" {
  type        = bool
  description = "Attach the API ECS service to an internet-facing HTTPS application load balancer."
  default     = false
}

variable "openai_agent_enabled" {
  type        = bool
  description = "Inject OPENAI_API_KEY and enable the API agent parser. Defaults off."
  default     = false
}

variable "openai_receipt_enabled" {
  type        = bool
  description = "Inject OPENAI_API_KEY and enable receipt OCR. Defaults off."
  default     = false
}

variable "openai_dashboard_enabled" {
  type        = bool
  description = "Inject OPENAI_API_KEY and enable typed dashboard proposals. Defaults off."
  default     = false
}

variable "openai_agent_model" {
  type        = string
  description = "Bounded non-secret OpenAI agent model identifier."
  default     = "gpt-4o-mini-2024-07-18"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9._:-]{0,127}$", var.openai_agent_model))
    error_message = "openai_agent_model must be a bounded model identifier."
  }
}

variable "openai_agent_timeout_ms" {
  type        = number
  description = "Bounded non-secret OpenAI agent timeout in milliseconds."
  default     = 30000

  validation {
    condition     = var.openai_agent_timeout_ms >= 1000 && var.openai_agent_timeout_ms <= 60000 && floor(var.openai_agent_timeout_ms) == var.openai_agent_timeout_ms
    error_message = "openai_agent_timeout_ms must be an integer from 1000 through 60000."
  }
}

variable "openai_agent_max_output_tokens" {
  type        = number
  description = "Bounded non-secret OpenAI agent output-token limit."
  default     = 2048

  validation {
    condition     = var.openai_agent_max_output_tokens >= 128 && var.openai_agent_max_output_tokens <= 4096 && floor(var.openai_agent_max_output_tokens) == var.openai_agent_max_output_tokens
    error_message = "openai_agent_max_output_tokens must be an integer from 128 through 4096."
  }
}

variable "openai_receipt_model" {
  type        = string
  description = "Bounded non-secret OpenAI receipt model identifier."
  default     = "gpt-4o-mini-2024-07-18"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9._:-]{0,127}$", var.openai_receipt_model))
    error_message = "openai_receipt_model must be a bounded model identifier."
  }
}

variable "openai_dashboard_model" {
  type        = string
  description = "Bounded non-secret OpenAI dashboard proposal model identifier."
  default     = "gpt-4o-mini-2024-07-18"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9._:-]{0,127}$", var.openai_dashboard_model))
    error_message = "openai_dashboard_model must be a bounded model identifier."
  }
}

variable "openai_image_detail" {
  type        = string
  description = "Bounded non-secret receipt image detail setting."
  default     = "high"

  validation {
    condition     = contains(["low", "high", "original"], var.openai_image_detail)
    error_message = "openai_image_detail must be low, high, or original."
  }
}

variable "openai_timeout_ms" {
  type        = number
  description = "Bounded non-secret receipt timeout in milliseconds."
  default     = 30000

  validation {
    condition     = var.openai_timeout_ms >= 1000 && var.openai_timeout_ms <= 60000 && floor(var.openai_timeout_ms) == var.openai_timeout_ms
    error_message = "openai_timeout_ms must be an integer from 1000 through 60000."
  }
}

variable "openai_max_output_tokens" {
  type        = number
  description = "Bounded non-secret receipt output-token limit."
  default     = 2048

  validation {
    condition     = var.openai_max_output_tokens >= 128 && var.openai_max_output_tokens <= 4096 && floor(var.openai_max_output_tokens) == var.openai_max_output_tokens
    error_message = "openai_max_output_tokens must be an integer from 128 through 4096."
  }
}

variable "tags" {
  type    = map(string)
  default = {}
}
