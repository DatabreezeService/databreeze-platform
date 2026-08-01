locals {
  tags = {
    DataClass = "platform"
  }
}

module "network" {
  source              = "../../modules/network"
  name                = var.name
  region              = var.aws_region
  azs                 = var.availability_zones
  vpc_cidr            = var.vpc_cidr
  enable_nat_gateway  = var.enable_nat_gateway
  tags                = local.tags
}

module "security" {
  source             = "../../modules/security"
  name               = var.name
  github_repository  = var.github_repository
  tags               = local.tags
}

module "web" {
  source            = "../../modules/web"
  name              = var.name
  region            = var.aws_region
  kms_key_arn       = module.security.kms_key_arn
  enable_cloudfront = var.enable_cloudfront
  tags              = local.tags
}

module "data" {
  source                    = "../../modules/data"
  name                      = var.name
  private_subnet_ids        = module.network.private_subnet_ids
  database_security_group_id = module.network.database_security_group_id
  cache_security_group_id   = module.network.cache_security_group_id
  kms_key_arn               = module.security.kms_key_arn
  enable_database           = var.enable_database
  database_instance_class  = var.database_instance_class
  backup_retention_period   = var.backup_retention_period
  deletion_protection       = var.deletion_protection
  tags                      = local.tags
}

module "compute" {
  source                 = "../../modules/compute"
  name                   = var.name
  region                 = var.aws_region
  private_subnet_ids     = module.network.private_subnet_ids
  api_security_group_id  = module.network.api_security_group_id
  kms_key_arn            = module.security.kms_key_arn
  database_secret_arn    = coalesce(module.data.database_master_secret_arn, module.security.database_secret_arn)
  application_secret_arn = module.security.application_secret_arn
  api_image              = var.api_image
  worker_image           = var.worker_image
  enable_services        = var.enable_ecs_services
  tags                   = local.tags
}
