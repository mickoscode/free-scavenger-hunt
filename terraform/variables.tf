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

variable "api_throttle_rate_limit" {
  description = "Sustained requests per second the API accepts (all hunts together). Cached scoreboard reads do not count."
  type        = number
  default     = 100
}

variable "api_throttle_burst_limit" {
  description = "Burst of requests the API accepts (the moment everyone loads the game at the start)."
  type        = number
  default     = 300
}
