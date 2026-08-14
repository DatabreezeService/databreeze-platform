locals {
  common_tags = merge(var.tags, { Component = "network" })
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(local.common_tags, { Name = "${var.name}-vpc" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.common_tags, { Name = "${var.name}-igw" })
}

resource "aws_subnet" "public" {
  for_each = { for index, az in var.azs : az => index }

  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, each.value)
  map_public_ip_on_launch = false
  tags                    = merge(local.common_tags, { Name = "${var.name}-public-${each.key}", Tier = "public" })
}

resource "aws_subnet" "private" {
  for_each = { for index, az in var.azs : az => index }

  vpc_id            = aws_vpc.this.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, each.value + length(var.azs))
  tags              = merge(local.common_tags, { Name = "${var.name}-private-${each.key}", Tier = "private" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = merge(local.common_tags, { Name = "${var.name}-public" })
}

resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_nat_gateway" "this" {
  for_each = var.enable_nat_gateway ? aws_subnet.public : {}

  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = each.value.id
  tags          = merge(local.common_tags, { Name = "${var.name}-nat-${each.key}" })
  depends_on    = [aws_internet_gateway.this]
}

resource "aws_eip" "nat" {
  for_each = var.enable_nat_gateway ? aws_subnet.public : {}

  domain = "vpc"
  tags   = merge(local.common_tags, { Name = "${var.name}-nat-eip-${each.key}" })
}

resource "aws_route_table" "private" {
  for_each = aws_subnet.private

  vpc_id = aws_vpc.this.id
  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.this[each.key].id
    }
  }
  tags = merge(local.common_tags, { Name = "${var.name}-private-${each.key}" })
}

resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}

resource "aws_security_group" "api" {
  name        = "${var.name}-api"
  description = "Ingress for the DataBreeze API load balancer and internal clients."
  vpc_id      = aws_vpc.this.id
  tags        = merge(local.common_tags, { Name = "${var.name}-api" })

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "api_load_balancer" {
  count       = var.enable_public_api ? 1 : 0
  name        = "${var.name}-api-load-balancer"
  description = "Public HTTPS edge for the DataBreeze API."
  vpc_id      = aws_vpc.this.id
  tags        = merge(local.common_tags, { Name = "${var.name}-api-load-balancer" })
}

resource "aws_vpc_security_group_ingress_rule" "api_load_balancer_https" {
  count             = var.enable_public_api ? 1 : 0
  security_group_id = aws_security_group.api_load_balancer[0].id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "Public HTTPS only."
}

resource "aws_vpc_security_group_egress_rule" "api_load_balancer_to_api" {
  count                        = var.enable_public_api ? 1 : 0
  security_group_id            = aws_security_group.api_load_balancer[0].id
  referenced_security_group_id = aws_security_group.api.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  description                  = "Forward HTTPS requests only to API tasks."
}

resource "aws_vpc_security_group_ingress_rule" "api_from_load_balancer" {
  count                        = var.enable_public_api ? 1 : 0
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = aws_security_group.api_load_balancer[0].id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
  description                  = "Accept API traffic only from the public load balancer."
}

resource "aws_security_group" "database" {
  name        = "${var.name}-database"
  description = "Private PostgreSQL access from the API security group."
  vpc_id      = aws_vpc.this.id
  tags        = merge(local.common_tags, { Name = "${var.name}-database" })

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
}

resource "aws_security_group" "cache" {
  name        = "${var.name}-cache"
  description = "Private Redis access from the API security group."
  vpc_id      = aws_vpc.this.id
  tags        = merge(local.common_tags, { Name = "${var.name}-cache" })

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
}
