output "site_url" {
  description = "Where the site is served."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "site_bucket" {
  value = aws_s3_bucket.site.id
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}
