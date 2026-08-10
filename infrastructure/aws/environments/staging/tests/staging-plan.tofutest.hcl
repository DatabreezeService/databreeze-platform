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

run "safe_staging_defaults_plan" {
  command = plan

  assert {
    condition     = output.region == "ap-southeast-1"
    error_message = "The staging plan must remain in the approved Singapore region."
  }

  assert {
    condition     = !var.enable_nat_gateway && !var.enable_database && !var.enable_ecs_services
    error_message = "The credential-free staging plan must keep recurring-cost services disabled."
  }

  assert {
    condition     = !var.enable_cloudfront && var.github_repository == ""
    error_message = "The staging plan must not create public distribution or deployment trust by default."
  }
}
