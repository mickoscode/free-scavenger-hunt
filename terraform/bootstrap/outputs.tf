output "state_bucket" {
  description = "Bucket holding Terraform state for this repository."
  value       = aws_s3_bucket.state.id
}

output "plan_role_arn" {
  value = aws_iam_role.plan.arn
}

output "apply_role_arn" {
  value = aws_iam_role.apply.arn
}

output "boundary_policy_arn" {
  description = "Every role created by the app Terraform must set this as its permissions_boundary."
  value       = aws_iam_policy.boundary.arn
}

output "oidc_subject_prefix" {
  description = "Prefix of the GitHub OIDC subject for this repository (used by the app's deploy role)."
  value       = local.oidc_subject_prefix
}
