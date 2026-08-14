locals {
  common_tags = merge(var.tags, { Component = "web" })
  web_content_security_policy = join("; ", [
    "default-src 'self'",
    "base-uri 'self'",
    format(
      "connect-src 'self'%s",
      length(var.connect_src_origins) > 0 ? " ${join(" ", var.connect_src_origins)}" : ""
    ),
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "upgrade-insecure-requests"
  ])
}

resource "aws_s3_bucket" "web" {
  bucket        = "databreeze-${var.name}-web"
  force_destroy = false
  tags          = merge(local.common_tags, { Name = "databreeze-${var.name}-web" })
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    id     = "bounded-version-retention"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.web]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "web" {
  count                             = var.enable_cloudfront ? 1 : 0
  name                              = "databreeze-${var.name}-web"
  description                       = "Signed origin access for the private DataBreeze Web bucket."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "web_bucket" {
  count = var.enable_cloudfront ? 1 : 0

  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  count  = var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket[0].json
}

resource "aws_cloudfront_cache_policy" "spa" {
  count       = var.enable_cloudfront ? 1 : 0
  name        = "databreeze-${var.name}-web-spa"
  comment     = "Revalidate the mutable DataBreeze application shell on every request."
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_cache_policy" "immutable_assets" {
  count       = var.enable_cloudfront ? 1 : 0
  name        = "databreeze-${var.name}-web-assets"
  comment     = "Cache Vite content-addressed Web assets for one year."
  default_ttl = 31536000
  max_ttl     = 31536000
  min_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "security" {
  count   = var.enable_cloudfront ? 1 : 0
  name    = "databreeze-${var.name}-web-security"
  comment = "Browser security headers for the DataBreeze Web application."

  security_headers_config {
    content_security_policy {
      content_security_policy = local.web_content_security_policy
      override                = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      override        = true
      referrer_policy = "strict-origin-when-cross-origin"
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
      preload                    = false
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      override = true
      value    = "camera=(), geolocation=(), microphone=()"
    }
  }
}

resource "aws_cloudfront_function" "spa_route" {
  count   = var.enable_cloudfront ? 1 : 0
  name    = "databreeze-${var.name}-web-spa-route"
  runtime = "cloudfront-js-2.0"
  comment = "Map extensionless BrowserRouter routes to the application shell without masking missing assets."
  publish = true
  code    = <<-JAVASCRIPT
    function handler(event) {
      var request = event.request;
      var segment = request.uri.substring(request.uri.lastIndexOf('/') + 1);
      if (request.uri.endsWith('/') || segment.indexOf('.') === -1) {
        request.uri = "/index.html";
      }
      return request;
    }
  JAVASCRIPT
}

resource "aws_cloudfront_distribution" "web" {
  count               = var.enable_cloudfront ? 1 : 0
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.price_class
  aliases             = var.aliases
  tags                = local.common_tags

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = aws_s3_bucket.web.id
    origin_access_control_id = aws_cloudfront_origin_access_control.web[0].id
  }

  default_cache_behavior {
    target_origin_id           = aws_s3_bucket.web.id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.spa[0].id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security[0].id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_route[0].arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "assets/*"
    target_origin_id           = aws_s3_bucket.web.id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.immutable_assets[0].id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security[0].id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = length(var.aliases) > 0 ? trimspace(var.acm_certificate_arn) : null
    cloudfront_default_certificate = length(var.aliases) == 0
    minimum_protocol_version       = length(var.aliases) > 0 ? "TLSv1.2_2021" : "TLSv1"
    ssl_support_method             = length(var.aliases) > 0 ? "sni-only" : null
  }

  lifecycle {
    precondition {
      condition     = length(var.aliases) == 0 || trimspace(var.acm_certificate_arn) != ""
      error_message = "Custom Web aliases require a reviewed us-east-1 ACM certificate ARN."
    }
  }
}
