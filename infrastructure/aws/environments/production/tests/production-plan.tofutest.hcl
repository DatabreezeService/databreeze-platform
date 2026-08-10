mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:root"
      user_id    = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/databreeze-mock"
      id  = "databreeze-mock"
    }
  }
}

run "safe_production_defaults_plan" {
  command = plan

  assert {
    condition     = output.region == "ap-southeast-1"
    error_message = "The production plan must remain in the approved Singapore region."
  }

  assert {
    condition     = !var.enable_nat_gateway && !var.enable_database && !var.enable_ecs_services
    error_message = "Credential-free production defaults must keep recurring-cost services disabled until owner apply."
  }

  assert {
    condition     = var.deletion_protection == true
    error_message = "Production defaults must keep deletion protection enabled."
  }

  assert {
    condition     = var.backup_retention_period >= 7
    error_message = "Production defaults must retain backups for at least seven days."
  }

  assert {
    condition     = var.api_desired_count >= 2 && var.worker_desired_count >= 2
    error_message = "Production defaults must target at least two API and worker tasks."
  }
}
