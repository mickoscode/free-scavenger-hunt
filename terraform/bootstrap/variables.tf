variable "aws_region" {
  description = "Region of the app and the state bucket."
  type        = string
  default     = "ap-southeast-2"
}

variable "github_owner" {
  description = "GitHub user or organisation that owns the repository."
  type        = string
  default     = "mickoscode"
}

variable "github_repo" {
  description = "Repository name (without the owner)."
  type        = string
  default     = "free-scavenger-hunt"
}

variable "github_admin_user" {
  description = "GitHub login of the person who approves Terraform applies (required reviewer of the terraform-production environment)."
  type        = string
  default     = "mickoscode"
}

# Status checks that must pass before a pull request can merge. Each is a job name in .github/workflows/; jobs that
# do not apply to a change are reported as skipped, which counts as passing.
variable "required_checks" {
  description = "Required status checks on main."
  type        = list(string)
  default = [
    "Validate site",
    "API tests",
    "Browser tests",
    "Terraform validate",
    "Terraform security scan",
    "Terraform plan",
  ]
}
