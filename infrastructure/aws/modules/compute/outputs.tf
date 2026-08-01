output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "api_log_group" {
  value = aws_cloudwatch_log_group.api.name
}

output "worker_log_group" {
  value = aws_cloudwatch_log_group.worker.name
}
