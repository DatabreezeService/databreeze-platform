output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "api_log_group" {
  value = aws_cloudwatch_log_group.api.name
}

output "worker_log_group" {
  value = aws_cloudwatch_log_group.worker.name
}

output "api_task_definition_container_definitions" {
  value = aws_ecs_task_definition.api.container_definitions
}

output "api_execution_secret_policy" {
  value = aws_iam_role_policy.execution_secrets.policy
}

output "api_load_balancer_dns_name" {
  value = try(aws_lb.api[0].dns_name, null)
}

output "api_https_listener_arn" {
  value = try(aws_lb_listener.api_https[0].arn, null)
}
