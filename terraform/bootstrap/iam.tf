# -----------------------------------------------------------------------------------------------------------
# GitHub Actions -> AWS, with no stored keys (OpenID Connect).
#
# An AWS account can hold only one OIDC provider per issuer URL, and this account's already exists. It is only
# READ here (never created, changed or destroyed by this repository), and what each role may do is decided
# entirely by the role's own trust policy below, which names this repository by its immutable ID.
# -----------------------------------------------------------------------------------------------------------
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  fsh_arn = {
    bucket   = "arn:aws:s3:::${local.app_prefix}-*"
    role     = "arn:aws:iam::${local.account_id}:role/${local.app_prefix}-*"
    policy   = "arn:aws:iam::${local.account_id}:policy/${local.app_prefix}-*"
    table    = "arn:aws:dynamodb:*:${local.account_id}:table/${local.app_prefix}-*"
    function = "arn:aws:lambda:*:${local.account_id}:function:${local.app_prefix}-*"
    logs     = "arn:aws:logs:*:${local.account_id}:log-group:*${local.app_prefix}-*"
    topic    = "arn:aws:sns:*:${local.account_id}:${local.app_prefix}-*"
    rule     = "arn:aws:events:*:${local.account_id}:rule/${local.app_prefix}-*"
    alarm    = "arn:aws:cloudwatch:*:${local.account_id}:alarm:${local.app_prefix}-*"
    param    = "arn:aws:ssm:*:${local.account_id}:parameter/${local.app_prefix}/*"
    secret   = "arn:aws:secretsmanager:*:${local.account_id}:secret:${local.app_prefix}-*"
  }
}

# What anything belonging to the app may touch: resources whose names start with fsh-. This document is both the
# permissions boundary (the ceiling for every role the app creates) and the core of the apply role.
data "aws_iam_policy_document" "app_access" {
  statement {
    sid       = "AppBuckets"
    actions   = ["s3:*"]
    resources = [local.fsh_arn.bucket, "${local.fsh_arn.bucket}/*"]
  }

  statement {
    sid       = "AppTables"
    actions   = ["dynamodb:*"]
    resources = [local.fsh_arn.table, "${local.fsh_arn.table}/*"]
  }

  statement {
    sid       = "AppFunctions"
    actions   = ["lambda:*"]
    resources = [local.fsh_arn.function, "${local.fsh_arn.function}:*"]
  }

  statement {
    sid       = "AppLogs"
    actions   = ["logs:*"]
    resources = [local.fsh_arn.logs, "${local.fsh_arn.logs}:*"]
  }

  statement {
    sid       = "AppMessaging"
    actions   = ["sns:*", "events:*", "cloudwatch:*"]
    resources = [local.fsh_arn.topic, local.fsh_arn.rule, local.fsh_arn.alarm]
  }

  statement {
    sid       = "AppConfigAndSecrets"
    actions   = ["ssm:*", "secretsmanager:*"]
    resources = [local.fsh_arn.param, local.fsh_arn.secret]
  }
}

# Ceiling for every role the app's Terraform creates (the deploy role, Lambda execution roles). Even if a policy
# attached to one of those roles were widened, it could still only reach fsh-* resources.
data "aws_iam_policy_document" "boundary" {
  source_policy_documents = [data.aws_iam_policy_document.app_access.json]

  statement {
    sid       = "InvalidateSiteCache"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation", "cloudfront:ListDistributions"]
    resources = ["*"]
  }

  statement {
    sid       = "ReadOwnLogGroupsList"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "boundary" {
  name        = "free-scavenger-hunt-ci-boundary"
  description = "Permissions boundary for every role created by the free-scavenger-hunt app Terraform"
  policy      = data.aws_iam_policy_document.boundary.json
}

# -----------------------------------------------------------------------------------------------------------
# Plan role: read-only, for pull requests. Cannot change anything.
# -----------------------------------------------------------------------------------------------------------
resource "aws_iam_role" "plan" {
  name                 = "free-scavenger-hunt-ci-plan"
  description          = "GitHub Actions (pull requests and main of ${var.github_owner}/${var.github_repo}) running terraform plan"
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = [
            "${local.oidc_subject_prefix}:pull_request",
            "${local.oidc_subject_prefix}:ref:refs/heads/main",
          ]
        }
      }
    }]
  })
}

data "aws_iam_policy_document" "plan" {
  statement {
    sid       = "ReadState"
    actions   = ["s3:GetObject", "s3:ListBucket", "s3:GetBucketLocation", "s3:GetBucketVersioning"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
  }

  statement {
    sid = "ReadAppResources"
    actions = [
      "s3:Get*", "s3:List*",
      "dynamodb:Describe*", "dynamodb:List*",
      "lambda:Get*", "lambda:List*",
      "logs:Describe*", "logs:List*",
      "sns:Get*", "sns:List*",
      "events:Describe*", "events:List*",
      "cloudwatch:Describe*", "cloudwatch:List*",
      "ssm:Describe*", "ssm:Get*", "ssm:List*",
      "secretsmanager:Describe*", "secretsmanager:GetResourcePolicy", "secretsmanager:List*",
    ]
    resources = [
      local.fsh_arn.bucket, "${local.fsh_arn.bucket}/*", local.fsh_arn.table, "${local.fsh_arn.table}/*",
      local.fsh_arn.function, "${local.fsh_arn.function}:*", local.fsh_arn.logs, "${local.fsh_arn.logs}:*",
      local.fsh_arn.topic, local.fsh_arn.rule, local.fsh_arn.alarm, local.fsh_arn.param, local.fsh_arn.secret,
    ]
  }

  statement {
    sid       = "ReadAppIam"
    actions   = ["iam:Get*", "iam:List*"]
    resources = [local.fsh_arn.role, local.fsh_arn.policy, data.aws_iam_openid_connect_provider.github.arn]
  }

  # These services do not support resource-level permissions for reads. Read-only, and only metadata.
  statement {
    sid = "ReadUnscopableServices"
    actions = [
      "cloudfront:Get*", "cloudfront:List*", "cloudfront:Describe*",
      "apigateway:GET",
      "acm:Describe*", "acm:List*", "acm:Get*",
      "logs:DescribeLogGroups",
      "lambda:GetAccountSettings",
      "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "plan" {
  name   = "terraform-plan"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan.json
}

# -----------------------------------------------------------------------------------------------------------
# Apply role: write access to fsh-* resources only. Assumable only by the apply job of the terraform-production
# environment (which needs the administrator's approval) on main.
# -----------------------------------------------------------------------------------------------------------
resource "aws_iam_role" "apply" {
  name                 = "free-scavenger-hunt-ci-apply"
  description          = "GitHub Actions apply job (environment terraform-production of ${var.github_owner}/${var.github_repo})"
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "${local.oidc_subject_prefix}:environment:${github_repository_environment.terraform_production.environment}"
        }
      }
    }]
  })
}

data "aws_iam_policy_document" "apply" {
  source_policy_documents = [data.aws_iam_policy_document.app_access.json]

  statement {
    sid       = "WriteState"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
  }

  # Roles the app creates must carry the boundary, so no role created by CI can ever exceed it.
  statement {
    sid       = "CreateBoundedRoles"
    actions   = ["iam:CreateRole"]
    resources = [local.fsh_arn.role]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.boundary.arn]
    }
  }

  statement {
    sid = "ManageAppRoles"
    actions = [
      "iam:GetRole", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole",
      "iam:UpdateRole", "iam:UpdateRoleDescription", "iam:UpdateAssumeRolePolicy", "iam:DeleteRole",
      "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy",
      "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags",
      "iam:PassRole",
    ]
    resources = [local.fsh_arn.role]
  }

  statement {
    sid       = "ManageAppPolicies"
    actions   = ["iam:*Policy", "iam:*PolicyVersion", "iam:ListPolicyVersions", "iam:TagPolicy", "iam:UntagPolicy", "iam:ListPolicyTags"]
    resources = [local.fsh_arn.policy]
  }

  # Services whose resources cannot be limited by name in IAM. They are still used only for the app: this
  # account's other projects are not touched by any Terraform in this repository.
  statement {
    sid = "UnscopableServices"
    actions = [
      "cloudfront:*",
      "apigateway:*",
      "acm:*",
      "logs:DescribeLogGroups",
      "lambda:GetAccountSettings", "lambda:ListFunctions",
      "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }

  # Belt and braces: nothing, however it is phrased above, may edit the CI roles or lift the boundary.
  statement {
    sid    = "ProtectCi"
    effect = "Deny"
    actions = [
      "iam:*",
    ]
    resources = [
      "arn:aws:iam::${local.account_id}:role/free-scavenger-hunt-ci-*",
      "arn:aws:iam::${local.account_id}:policy/free-scavenger-hunt-ci-*",
      "arn:aws:iam::${local.account_id}:oidc-provider/*",
    ]
  }

  # CloudFront and API Gateway cannot be limited by name in IAM, so this role could otherwise change any distribution or API in
  # the account. These denials leave it able to modify only resources tagged Project=free-scavenger-hunt (Terraform tags
  # everything it creates), so other projects' distributions and APIs cannot be touched.
  statement {
    sid    = "OnlyOwnDistributions"
    effect = "Deny"
    actions = [
      "cloudfront:UpdateDistribution", "cloudfront:DeleteDistribution", "cloudfront:TagResource", "cloudfront:UntagResource",
      "cloudfront:CreateInvalidation", "cloudfront:UpdateDistributionWithStagingConfig", "cloudfront:AssociateAlias",
    ]
    resources = ["arn:aws:cloudfront::${local.account_id}:distribution/*"]

    condition {
      test     = "StringNotEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["free-scavenger-hunt"]
    }
  }

  statement {
    sid       = "OnlyOwnApis"
    effect    = "Deny"
    actions   = ["apigateway:PUT", "apigateway:PATCH", "apigateway:DELETE", "apigateway:POST"]
    resources = ["arn:aws:apigateway:*::/apis/*"]

    condition {
      test     = "StringNotEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["free-scavenger-hunt"]
    }
  }

  statement {
    sid       = "NeverRemoveBoundary"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary", "iam:PutRolePermissionsBoundary"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "apply" {
  name   = "terraform-apply"
  role   = aws_iam_role.apply.id
  policy = data.aws_iam_policy_document.apply.json
}
