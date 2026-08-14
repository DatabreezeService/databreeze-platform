locals {
  tags = {
    DataClass = "platform"
  }
}

module "network" {
  source             = "../../modules/network"
  name               = var.name
  region             = var.aws_region
  azs                = var.availability_zones
  vpc_cidr           = var.vpc_cidr
  enable_nat_gateway = var.enable_nat_gateway
  enable_public_api  = var.enable_ecs_services
  tags               = local.tags
}

module "security" {
  source            = "../../modules/security"
  name              = var.name
  region            = var.aws_region
  github_repository = var.github_repository
  tags              = local.tags
}

module "web" {
  source              = "../../modules/web"
  name                = var.name
  region              = var.aws_region
  kms_key_arn         = module.security.kms_key_arn
  enable_cloudfront   = var.enable_cloudfront
  aliases             = var.web_aliases
  acm_certificate_arn = var.web_acm_certificate_arn
  connect_src_origins = var.web_connect_src_origins
  tags                = local.tags
}

module "data" {
  source                           = "../../modules/data"
  name                             = var.name
  environment                      = var.environment
  private_subnet_ids               = module.network.private_subnet_ids
  database_security_group_id       = module.network.database_security_group_id
  cache_security_group_id          = module.network.cache_security_group_id
  kms_key_arn                      = module.security.kms_key_arn
  enable_database                  = var.enable_database
  database_instance_class          = var.database_instance_class
  backup_retention_period          = var.backup_retention_period
  deletion_protection              = var.deletion_protection
  database_multi_az                = var.database_multi_az
  redis_num_cache_clusters         = var.redis_num_cache_clusters
  redis_automatic_failover_enabled = var.redis_automatic_failover_enabled
  redis_multi_az_enabled           = var.redis_multi_az_enabled
  artifact_upload_cors_allowed_origins = concat(
    [for alias in var.web_aliases : "https://${alias}"],
    module.web.distribution_domain_name == null ? [] : ["https://${module.web.distribution_domain_name}"],
  )
  tags = local.tags
}

module "compute" {
  source                                         = "../../modules/compute"
  name                                           = var.name
  environment                                    = var.environment
  region                                         = var.aws_region
  private_subnet_ids                             = module.network.private_subnet_ids
  public_subnet_ids                              = module.network.public_subnet_ids
  vpc_id                                         = module.network.vpc_id
  api_security_group_id                          = module.network.api_security_group_id
  api_load_balancer_security_group_id            = module.network.api_load_balancer_security_group_id
  api_certificate_arn                            = var.api_certificate_arn
  kms_key_arn                                    = module.security.kms_key_arn
  artifact_bucket_name                           = module.data.artifact_bucket_name
  artifact_bucket_arn                            = module.data.artifact_bucket_arn
  database_url_secret_arn                        = module.security.database_url_secret_arn
  csrf_allowed_origins_secret_arn                = module.security.csrf_allowed_origins_secret_arn
  service_account_secret_envelope_key_secret_arn = module.security.service_account_secret_envelope_key_secret_arn
  email_verification_digest_key_secret_arn       = module.security.email_verification_digest_key_secret_arn
  email_verification_envelope_key_secret_arn     = module.security.email_verification_envelope_key_secret_arn
  registration_admission_key_secret_arn          = module.security.registration_admission_key_secret_arn
  iae_worker_capability_signing_key_secret_arn   = module.security.iae_worker_capability_signing_key_secret_arn
  worker_service_account_bearer_secret_arn       = module.security.worker_service_account_bearer_secret_arn
  worker_api_endpoint                            = var.worker_api_endpoint
  redis_url                                      = module.data.redis_endpoint == null ? "" : "rediss://${module.data.redis_endpoint}:6379"
  iam_email_from_address                         = var.iam_email_from_address
  openai_api_key_secret_arn                      = module.security.openai_api_key_secret_arn
  openai_agent_enabled                           = var.openai_agent_enabled
  openai_receipt_enabled                         = var.openai_receipt_enabled
  openai_dashboard_enabled                       = var.openai_dashboard_enabled
  openai_agent_model                             = var.openai_agent_model
  openai_agent_timeout_ms                        = var.openai_agent_timeout_ms
  openai_agent_max_output_tokens                 = var.openai_agent_max_output_tokens
  openai_receipt_model                           = var.openai_receipt_model
  openai_dashboard_model                         = var.openai_dashboard_model
  openai_image_detail                            = var.openai_image_detail
  openai_timeout_ms                              = var.openai_timeout_ms
  openai_max_output_tokens                       = var.openai_max_output_tokens
  api_image                                      = var.api_image
  worker_image                                   = var.worker_image
  enable_services                                = var.enable_ecs_services
  enable_public_api                              = var.enable_ecs_services
  private_egress_enabled                         = var.enable_nat_gateway
  api_desired_count                              = var.api_desired_count
  worker_desired_count                           = var.worker_desired_count
  worker_cpu                                     = var.worker_cpu
  worker_memory                                  = var.worker_memory
  tags                                           = local.tags
}
