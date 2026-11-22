variable "aws_region" {
  description = "Region of the app."
  type        = string
  default     = "ap-southeast-2"
}

variable "github_oidc_subject_prefix" {
  description = "GitHub's immutable OIDC subject prefix for this repository (bootstrap output oidc_subject_prefix)."
  type        = string
  default     = "repo:mickoscode@15779346/free-scavenger-hunt@1467037526"

  validation {
    condition     = can(regex("^repo:[^:*?]+$", var.github_oidc_subject_prefix))
    error_message = "Must look like repo:<owner>@<id>/<repo>@<id>, with no wildcards."
  }
}
