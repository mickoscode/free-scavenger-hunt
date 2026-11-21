# Bootstrap: the one piece of infrastructure that cannot be applied by CI, because CI depends on it.
#
#   * the private S3 bucket that holds Terraform state (for this directory and for ../)
#   * the IAM roles GitHub Actions assumes (plan = read-only, apply = write, limited to resources named fsh-*)
#   * every GitHub setting of THIS repository (settings, branch ruleset, environment, Actions variables)
#
# It is applied from an administrator's computer with scripts/bootstrap.sh (see docs/setup.md). Nothing here is
# shared with, or looked up from, any other project, except the account's single GitHub OIDC provider, which
# AWS allows only once per account (see iam.tf).

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }

    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }

  # backend.tf is created by scripts/bootstrap.sh once the state bucket exists (state starts local, then moves
  # into the bucket this configuration creates).
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "free-scavenger-hunt"
      ManagedBy = "terraform-bootstrap"
    }
  }
}

# Authenticates with the GITHUB_TOKEN environment variable: a fine-grained token limited to this one repository.
provider "github" {
  owner = var.github_owner
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  state_bucket_name = "free-scavenger-hunt-tfstate-${local.account_id}"

  # GitHub's immutable OIDC subject: includes the owner and repository IDs, so a renamed or re-created repository
  # can never inherit these roles.
  oidc_subject_prefix = "repo:${var.github_owner}@${data.github_user.owner.id}/${var.github_repo}@${github_repository.this.repo_id}"

  # Every app resource is named fsh-*; the CI roles are free-scavenger-hunt-ci-*. The two never overlap, so the
  # apply role can manage the app but can never edit itself or its boundary.
  app_prefix = "fsh"
}
