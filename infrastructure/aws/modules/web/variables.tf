variable "name" {
  type        = string
  description = "Stable deployment name."
}

variable "region" {
  type        = string
  description = "AWS region."
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key used for bucket encryption."
}

variable "enable_cloudfront" {
  type        = bool
  description = "Create a CloudFront distribution and origin access control."
  default     = false
}

variable "price_class" {
  type        = string
  description = "CloudFront price class for production cost control."
  default     = "PriceClass_100"
}

variable "aliases" {
  type        = list(string)
  description = "Reviewed custom Web hostnames served by CloudFront. Empty uses the CloudFront domain."
  default     = []

  validation {
    condition = (
      length(var.aliases) <= 5 &&
      length(distinct(var.aliases)) == length(var.aliases) &&
      alltrue([
        for alias in var.aliases :
        length(alias) <= 253 &&
        can(regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$", alias))
      ])
    )
    error_message = "aliases must contain at most five unique lowercase DNS hostnames without schemes, paths, ports, or wildcards."
  }
}

variable "acm_certificate_arn" {
  type        = string
  description = "Reviewed us-east-1 ACM certificate ARN for custom CloudFront aliases."
  default     = ""

  validation {
    condition = trimspace(var.acm_certificate_arn) == "" || can(regex(
      "^arn:[^:]+:acm:us-east-1:[0-9]{12}:certificate/[0-9a-f-]{36}$",
      trimspace(var.acm_certificate_arn)
    ))
    error_message = "acm_certificate_arn must be an ACM certificate ARN from us-east-1."
  }
}

variable "connect_src_origins" {
  type        = list(string)
  description = "Exact reviewed HTTPS API origins allowed by the Web Content Security Policy."
  default     = []

  validation {
    condition = (
      length(var.connect_src_origins) <= 4 &&
      length(distinct(var.connect_src_origins)) == length(var.connect_src_origins) &&
      alltrue([
        for origin in var.connect_src_origins :
        length(origin) <= 256 &&
        can(regex("^https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$", origin))
      ])
    )
    error_message = "connect_src_origins must contain at most four unique exact lowercase HTTPS origins without credentials, paths, queries, fragments, or wildcards."
  }
}

variable "tags" {
  type        = map(string)
  description = "Additional resource tags."
  default     = {}
}
