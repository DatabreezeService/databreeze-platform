output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_ids" {
  value = [for az in var.azs : aws_subnet.public[az].id]
}

output "private_subnet_ids" {
  value = [for az in var.azs : aws_subnet.private[az].id]
}

output "api_security_group_id" {
  value = aws_security_group.api.id
}

output "api_load_balancer_security_group_id" {
  value = try(aws_security_group.api_load_balancer[0].id, "")
}

output "database_security_group_id" {
  value = aws_security_group.database.id
}

output "cache_security_group_id" {
  value = aws_security_group.cache.id
}
