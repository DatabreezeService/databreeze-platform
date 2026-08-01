variable "name" {
  type        = string
  description = "Stable deployment name used in resource names and tags."
}

variable "region" {
  type        = string
  description = "AWS region for the network."
}

variable "azs" {
  type        = list(string)
  description = "Availability zones for paired public and private subnets."
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR range for the deployment VPC."
  default     = "10.42.0.0/16"
}

variable "enable_nat_gateway" {
  type        = bool
  description = "Create one NAT gateway per AZ for private egress."
  default     = false
}

variable "tags" {
  type        = map(string)
  description = "Additional resource tags."
  default     = {}
}
