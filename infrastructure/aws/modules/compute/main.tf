locals {
  common_tags = merge(var.tags, { Component = "compute" })
}

resource "aws_ecs_cluster" "this" {
  name = "databreeze-${var.name}"
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
  tags = merge(local.common_tags, { Name = "databreeze-${var.name}" })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/databreeze/${var.name}/api"
  retention_in_days = 30
  kms_key_id        = var.kms_key_arn
  tags              = merge(local.common_tags, { Name = "databreeze-${var.name}-api" })
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/databreeze/${var.name}/worker"
  retention_in_days = 30
  kms_key_id        = var.kms_key_arn
  tags              = merge(local.common_tags, { Name = "databreeze-${var.name}-worker" })
}

data "aws_iam_policy_document" "task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "databreeze-${var.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
  tags               = merge(local.common_tags, { Name = "databreeze-${var.name}-ecs-execution" })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "databreeze-${var.name}-ecs-secret-read"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "kms:Decrypt"]
      Resource = [var.database_secret_arn, var.application_secret_arn, var.kms_key_arn]
    }]
  })
}

resource "aws_iam_role" "task" {
  name               = "databreeze-${var.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
  tags               = merge(local.common_tags, { Name = "databreeze-${var.name}-ecs-task" })
}

resource "aws_iam_role_policy" "task" {
  name = "databreeze-${var.name}-ecs-task-minimal"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "kms:Decrypt"]
      Resource = [var.database_secret_arn, var.application_secret_arn, var.kms_key_arn]
    }]
  })
}

locals {
  api_container = {
    name      = "api"
    image     = var.api_image
    essential = true
    readonlyRootFilesystem = true
    privileged              = false
    user                    = "10001"
    stopTimeout             = 30
    cpu       = var.api_cpu
    memory    = var.api_memory
    portMappings = [{
      containerPort = 3000
      hostPort      = 3000
      protocol      = "tcp"
    }]
    environment = [{
      name  = "NODE_ENV"
      value = "production"
    }]
    secrets = [
      { name = "DATABASE_SECRET_ARN", valueFrom = var.database_secret_arn },
      { name = "APPLICATION_SECRET_ARN", valueFrom = var.application_secret_arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "api"
      }
    }
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "databreeze-${var.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.api_cpu)
  memory                   = tostring(var.api_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions    = jsonencode([local.api_container])
  tags                     = merge(local.common_tags, { Name = "databreeze-${var.name}-api" })

  lifecycle {
    precondition {
      condition     = var.environment != "production" || can(regex("@sha256:[0-9a-f]{64}$", var.api_image))
      error_message = "Production API deployments must use an immutable image digest."
    }
  }
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "databreeze-${var.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name      = "worker"
    image     = var.worker_image
    essential = true
    readonlyRootFilesystem = true
    privileged              = false
    user                    = "10001"
    stopTimeout             = 30
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])
  tags = merge(local.common_tags, { Name = "databreeze-${var.name}-worker" })

  lifecycle {
    precondition {
      condition     = var.environment != "production" || can(regex("@sha256:[0-9a-f]{64}$", var.worker_image))
      error_message = "Production worker deployments must use an immutable image digest."
    }
  }
}

resource "aws_ecs_service" "api" {
  count           = var.enable_services ? 1 : 0
  name            = "api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.api_security_group_id]
    assign_public_ip = false
  }

  lifecycle {
    precondition {
      condition     = !var.enable_services || var.private_egress_enabled
      error_message = "ECS services require private-subnet egress through NAT or reviewed VPC endpoints."
    }
    precondition {
      condition     = var.environment != "production" || var.api_desired_count >= 2
      error_message = "Production requires at least two API tasks."
    }
  }
}

resource "aws_ecs_service" "worker" {
  count           = var.enable_services ? 1 : 0
  name            = "worker"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.api_security_group_id]
    assign_public_ip = false
  }

  lifecycle {
    precondition {
      condition     = !var.enable_services || var.private_egress_enabled
      error_message = "ECS services require private-subnet egress through NAT or reviewed VPC endpoints."
    }
    precondition {
      condition     = var.environment != "production" || var.worker_desired_count >= 2
      error_message = "Production requires at least two worker tasks."
    }
  }
}
