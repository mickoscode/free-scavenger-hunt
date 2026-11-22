# The application's infrastructure. Applied by CI (.github/workflows/terraform-apply.yml) as the
# free-scavenger-hunt-ci-apply role, which can only create and change resources named fsh-* (the CI roles, the
# state bucket and the GitHub settings live in ./bootstrap and are out of its reach).
terraform {
  required_version = ">= 1.10.0"

  backend "s3" {
    bucket       = "free-scavenger-hunt-tfstate-722937635825"
    key          = "app/terraform.tfstate"
    region       = "ap-southeast-2"
    use_lockfile = true
    encrypt      = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

# Credentials come from the environment: the workflow assumes a role through GitHub OIDC (no stored keys).
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "free-scavenger-hunt"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # Everything the app owns is named fsh-*: that prefix is what the CI roles' permissions are limited to.
  name = "fsh"

  # Created by ./bootstrap. Every role made here must carry this boundary (the apply role cannot create one without).
  boundary_policy_arn = "arn:aws:iam::${local.account_id}:policy/free-scavenger-hunt-ci-boundary"
  github_oidc_arn     = "arn:aws:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
}
