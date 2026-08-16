locals {
  common_tags = merge(var.tags, { Component = "compute" })
  api_base_secrets = concat([
    { name = "DATABASE_URL", valueFrom = var.database_url_secret_arn },
    { name = "DATABREEZE_CSRF_ALLOWED_ORIGINS", valueFrom = var.csrf_allowed_origins_secret_arn },
    { name = "DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY", valueFrom = var.service_account_secret_envelope_key_secret_arn },
    { name = "DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY", valueFrom = var.email_verification_digest_key_secret_arn },
  ], trimspace(var.recovery_digest_key_secret_arn) == "" ? [] : [{ name = "DATABREEZE_IAM_RECOVERY_DIGEST_KEY", valueFrom = var.recovery_digest_key_secret_arn }], [
    { name = "DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY", valueFrom = var.email_verification_envelope_key_secret_arn },
    { name = "DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY", valueFrom = var.registration_admission_key_secret_arn },
    { name = "DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY", valueFrom = var.iae_worker_capability_signing_key_secret_arn }
  ])
  api_openai_secret                              = [{ name = "OPENAI_API_KEY", valueFrom = var.openai_api_key_secret_arn }]
  api_runtime_secrets                            = var.openai_agent_enabled || var.openai_receipt_enabled || var.openai_dashboard_enabled ? concat(local.api_base_secrets, local.api_openai_secret) : local.api_base_secrets
  api_runtime_secret_arns                        = [for secret in local.api_runtime_secrets : secret.valueFrom]
  current_database_secret_arn                    = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:databreeze/${var.name}/database-"
  current_csrf_secret_arn                        = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:databreeze/${var.name}/csrf-allowed-origins-"
  current_service_account_secret_arn             = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:databreeze/${var.name}/iam/service-account-envelope-key-"
  current_email_verification_digest_secret_arn   = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:databreeze/${var.name}/iam/email-verification-digest-key-"
  current_recovery_digest_secret_arn             = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:databreeze/${var.name}/iam/recovery-digest-key-"
  current_email_verification_envelope_secret_arn = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:databreeze/${var.name}/iam/email-verification-envelope-key-"
  current_registration_admission_secret_arn      = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:databreeze/${var.name}/iam/registration-admission-key-"
  current_iae_worker_signing_secret_arn          = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:databreeze/${var.name}/iae/worker-capability-signing-key-"
  current_worker_bearer_secret_arn               = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:databreeze/${var.name}/worker/service-account-bearer-"
  current_openai_secret_arn                      = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:databreeze/${var.name}/openai/api-key-"
  current_certificate_arn                        = "arn:${data.aws_partition.current.partition}:acm:${var.region}:${data.aws_caller_identity.current.account_id}:certificate/"
  allowed_worker_memory_by_cpu = {
    "256"  = [512, 1024, 2048]
    "512"  = [1024, 2048, 3072, 4096]
    "1024" = [2048, 3072, 4096, 5120, 6144, 7168, 8192]
    "2048" = [4096, 5120, 6144, 7168, 8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384]
    "4096" = [8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384, 17408, 18432, 19456, 20480, 21504, 22528, 23552, 24576, 25600, 26624, 27648, 28672, 29696, 30720]
  }
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

resource "aws_iam_role" "api_execution" {
  name               = "databreeze-${var.name}-api-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
  tags               = merge(local.common_tags, { Name = "databreeze-${var.name}-api-ecs-execution" })
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

resource "aws_iam_role" "worker_execution" {
  name               = "databreeze-${var.name}-worker-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
  tags               = merge(local.common_tags, { Name = "databreeze-${var.name}-worker-ecs-execution" })
}

resource "aws_iam_role_policy_attachment" "api_execution" {
  role       = aws_iam_role.api_execution.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "worker_execution" {
  role       = aws_iam_role.worker_execution.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "databreeze-${var.name}-ecs-secret-read"
  role = aws_iam_role.api_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = local.api_runtime_secret_arns
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [var.kms_key_arn]
        Condition = {
          StringEquals = {
            "kms:ViaService"                  = "secretsmanager.${var.region}.amazonaws.com"
            "kms:EncryptionContext:SecretARN" = local.api_runtime_secret_arns
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "worker_execution_secret" {
  name = "databreeze-${var.name}-worker-credential-read"
  role = aws_iam_role.worker_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [var.worker_service_account_bearer_secret_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [var.kms_key_arn]
        Condition = {
          StringEquals = {
            "kms:ViaService"                  = "secretsmanager.${var.region}.amazonaws.com"
            "kms:EncryptionContext:SecretARN" = var.worker_service_account_bearer_secret_arn
          }
        }
      }
    ]
  })
}

resource "aws_iam_role" "api_task" {
  name               = "databreeze-${var.name}-api-task"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
  tags               = merge(local.common_tags, { Name = "databreeze-${var.name}-api-task" })
}

resource "aws_iam_role_policy" "api_ses_email_verification" {
  count = trimspace(var.iam_email_from_address) == "" ? 0 : 1
  name  = "databreeze-${var.name}-api-ses-email-verification"
  role  = aws_iam_role.api_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail"]
      Resource = ["arn:${data.aws_partition.current.partition}:ses:${var.region}:${data.aws_caller_identity.current.account_id}:identity/${var.iam_email_from_address}"]
    }]
  })
}

resource "aws_iam_role_policy" "api_iae_artifacts" {
  name = "databreeze-${var.name}-api-iae-artifacts"
  role = aws_iam_role.api_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ExactArtifactBucketControl"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:ListBucketMultipartUploads"]
        Resource = [var.artifact_bucket_arn]
        Condition = {
          StringLike = { "s3:prefix" = ["iae-v1/*"] }
        }
      },
      {
        Sid    = "ExactArtifactObjectTransfer"
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:DeleteObject",
          "s3:GetObject",
          "s3:ListMultipartUploadParts",
          "s3:PutObject"
        ]
        Resource = ["${var.artifact_bucket_arn}/iae-v1/*"]
      },
      {
        Sid      = "ArtifactBucketKms"
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:DescribeKey", "kms:Encrypt", "kms:GenerateDataKey*"]
        Resource = [var.kms_key_arn]
        Condition = {
          StringEquals = { "kms:ViaService" = "s3.${var.region}.amazonaws.com" }
          StringEquals = { "kms:EncryptionContext:aws:s3:arn" = var.artifact_bucket_arn }
        }
      }
    ]
  })
}

resource "aws_iam_role" "worker_task" {
  name               = "databreeze-${var.name}-worker-task"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
  tags               = merge(local.common_tags, { Name = "databreeze-${var.name}-worker-task" })
}

locals {
  api_container = {
    name                   = "api"
    image                  = var.api_image
    essential              = true
    readonlyRootFilesystem = true
    privileged             = false
    user                   = "10001"
    stopTimeout            = 30
    cpu                    = var.api_cpu
    memory                 = var.api_memory
    portMappings = [{
      containerPort = 3000
      hostPort      = 3000
      protocol      = "tcp"
    }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "DATABREEZE_REDIS_URL", value = var.redis_url },
      { name = "DATABREEZE_IAM_EMAIL_FROM_ADDRESS", value = var.iam_email_from_address },
      { name = "DATABREEZE_IAM_EMAIL_SES_REGION", value = var.region },
      { name = "DATABREEZE_IAE_ARTIFACT_BUCKET", value = var.artifact_bucket_name },
      { name = "DATABREEZE_IAE_ARTIFACT_REGION", value = var.region },
      { name = "DATABREEZE_IAE_ARTIFACT_KMS_KEY_ARN", value = var.kms_key_arn },
      { name = "DATABREEZE_OPENAI_AGENT_ENABLED", value = tostring(var.openai_agent_enabled) },
      { name = "DATABREEZE_OPENAI_RECEIPT_ENABLED", value = tostring(var.openai_receipt_enabled) },
      { name = "DATABREEZE_OPENAI_DASHBOARD_ENABLED", value = tostring(var.openai_dashboard_enabled) },
      { name = "DATABREEZE_OPENAI_AGENT_MODEL", value = var.openai_agent_model },
      { name = "DATABREEZE_OPENAI_AGENT_TIMEOUT_MS", value = tostring(var.openai_agent_timeout_ms) },
      { name = "DATABREEZE_OPENAI_AGENT_MAX_OUTPUT_TOKENS", value = tostring(var.openai_agent_max_output_tokens) },
      { name = "DATABREEZE_OPENAI_RECEIPT_MODEL", value = var.openai_receipt_model },
      { name = "DATABREEZE_OPENAI_DASHBOARD_MODEL", value = var.openai_dashboard_model },
      { name = "DATABREEZE_OPENAI_IMAGE_DETAIL", value = var.openai_image_detail },
      { name = "DATABREEZE_OPENAI_TIMEOUT_MS", value = tostring(var.openai_timeout_ms) },
      { name = "DATABREEZE_OPENAI_MAX_OUTPUT_TOKENS", value = tostring(var.openai_max_output_tokens) },
    ]
    healthCheck = {
      command     = ["CMD", "/nodejs/bin/node", "--input-type=module", "-e", "fetch('http://127.0.0.1:3000/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    secrets = local.api_runtime_secrets
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
  execution_role_arn       = aws_iam_role.api_execution.arn
  task_role_arn            = aws_iam_role.api_task.arn
  container_definitions    = jsonencode([local.api_container])
  tags                     = merge(local.common_tags, { Name = "databreeze-${var.name}-api" })

  lifecycle {
    precondition {
      condition     = var.environment != "production" || can(regex("@sha256:[0-9a-f]{64}$", var.api_image))
      error_message = "Production API deployments must use an immutable image digest."
    }
    precondition {
      condition = (
        trimspace(var.database_url_secret_arn) != "" &&
        trimspace(var.csrf_allowed_origins_secret_arn) != "" &&
        trimspace(var.service_account_secret_envelope_key_secret_arn) != "" &&
        trimspace(var.email_verification_digest_key_secret_arn) != "" &&
        trimspace(var.email_verification_envelope_key_secret_arn) != "" &&
        trimspace(var.registration_admission_key_secret_arn) != "" &&
        can(regex("^${local.current_database_secret_arn}[A-Za-z0-9]{6}$", trimspace(var.database_url_secret_arn))) &&
        can(regex("^${local.current_csrf_secret_arn}[A-Za-z0-9]{6}$", trimspace(var.csrf_allowed_origins_secret_arn))) &&
        can(regex("^${local.current_service_account_secret_arn}[A-Za-z0-9]{6}$", trimspace(var.service_account_secret_envelope_key_secret_arn))) &&
        can(regex("^${local.current_email_verification_digest_secret_arn}[A-Za-z0-9]{6}$", trimspace(var.email_verification_digest_key_secret_arn))) &&
        (trimspace(var.recovery_digest_key_secret_arn) == "" || can(regex("^${local.current_recovery_digest_secret_arn}[A-Za-z0-9]{6}$", trimspace(var.recovery_digest_key_secret_arn)))) &&
        can(regex("^${local.current_email_verification_envelope_secret_arn}[A-Za-z0-9]{6}$", trimspace(var.email_verification_envelope_key_secret_arn))) &&
        can(regex("^${local.current_registration_admission_secret_arn}[A-Za-z0-9]{6}$", trimspace(var.registration_admission_key_secret_arn))) &&
        can(regex("^${local.current_iae_worker_signing_secret_arn}[A-Za-z0-9]{6}$", trimspace(var.iae_worker_capability_signing_key_secret_arn)))
      )
      error_message = "API task definitions require current-account, current-region, whole DataBreeze Secrets Manager references for database, CSRF, service-account, IAM registration, and IAE worker-capability signing keys."
    }
    precondition {
      condition = (
        (!var.openai_agent_enabled && !var.openai_receipt_enabled && !var.openai_dashboard_enabled) ||
        can(regex("^${local.current_openai_secret_arn}[A-Za-z0-9]{6}$", trimspace(var.openai_api_key_secret_arn)))
      )
      error_message = "Enabling an OpenAI API feature requires the current-account, current-region, whole DataBreeze OpenAI secret ARN."
    }
    precondition {
      condition = !var.enable_public_api || (
        var.enable_services &&
        length(var.public_subnet_ids) >= 2 &&
        trimspace(var.vpc_id) != "" &&
        trimspace(var.api_load_balancer_security_group_id) != "" &&
        can(regex("^${local.current_certificate_arn}[0-9a-fA-F-]{36}$", trimspace(var.api_certificate_arn)))
      )
      error_message = "The public API requires enabled services, at least two public subnets, its VPC and load-balancer security group, and a current-account ACM certificate."
    }
  }
}

resource "aws_lb" "api" {
  count                      = var.enable_public_api ? 1 : 0
  name                       = substr("databreeze-${var.name}-api", 0, 32)
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [var.api_load_balancer_security_group_id]
  subnets                    = var.public_subnet_ids
  drop_invalid_header_fields = true
  enable_deletion_protection = var.environment == "production"
  tags                       = merge(local.common_tags, { Name = "databreeze-${var.name}-api" })
}

resource "aws_lb_target_group" "api" {
  count                = var.enable_public_api ? 1 : 0
  name                 = substr("databreeze-${var.name}-api", 0, 32)
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30
  tags                 = merge(local.common_tags, { Name = "databreeze-${var.name}-api" })

  health_check {
    enabled             = true
    path                = "/health/ready"
    protocol            = "HTTP"
    port                = "traffic-port"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "api_https" {
  count             = var.enable_public_api ? 1 : 0
  load_balancer_arn = aws_lb.api[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.api_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api[0].arn
  }
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "databreeze-${var.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.worker_cpu)
  memory                   = tostring(var.worker_memory)
  execution_role_arn       = aws_iam_role.worker_execution.arn
  task_role_arn            = aws_iam_role.worker_task.arn
  container_definitions = jsonencode([{
    name                   = "worker"
    image                  = var.worker_image
    essential              = true
    entryPoint             = ["databreeze-engine-worker"]
    command                = []
    readonlyRootFilesystem = true
    privileged             = false
    user                   = "10001"
    stopTimeout            = 30
    environment = [
      { name = "DATABREEZE_WORKER_API_ENDPOINT", value = trimspace(var.worker_api_endpoint) }
    ]
    secrets = [
      { name = "DATABREEZE_WORKER_BEARER_TOKEN", valueFrom = var.worker_service_account_bearer_secret_arn }
    ]
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
    precondition {
      condition = contains(
        lookup(local.allowed_worker_memory_by_cpu, tostring(var.worker_cpu), []),
        var.worker_memory,
      )
      error_message = "worker_memory must be an AWS-supported Fargate size for worker_cpu."
    }
    precondition {
      condition = !var.enable_services || (
        can(regex("^${local.current_worker_bearer_secret_arn}[A-Za-z0-9]{6}$", trimspace(var.worker_service_account_bearer_secret_arn))) &&
        can(regex("^https://", trimspace(var.worker_api_endpoint)))
      )
      error_message = "Worker tasks require an exact HTTPS API origin and a current-account, current-region whole DataBreeze worker bearer secret ARN."
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

  depends_on = [
    aws_iam_role_policy_attachment.api_execution,
    aws_iam_role_policy.execution_secrets,
    aws_lb_listener.api_https,
  ]

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.api_security_group_id]
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = var.enable_public_api ? [true] : []
    content {
      target_group_arn = aws_lb_target_group.api[0].arn
      container_name   = "api"
      container_port   = 3000
    }
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

  depends_on = [
    aws_iam_role_policy_attachment.worker_execution,
    aws_iam_role_policy.worker_execution_secret,
  ]

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

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
