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

variable "tags" {
  type        = map(string)
  description = "Additional resource tags."
  default     = {}
}
