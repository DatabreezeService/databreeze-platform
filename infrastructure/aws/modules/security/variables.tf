variable "name" {
  type        = string
  description = "Stable deployment name."
}

variable "region" {
  type        = string
  description = "AWS region used to scope service-principal KMS conditions."
}

variable "github_repository" {
  type        = string
  description = "GitHub owner/repository allowed to assume the deployment role."
  default     = ""
}

variable "tags" {
  type        = map(string)
  description = "Additional resource tags."
  default     = {}
}
