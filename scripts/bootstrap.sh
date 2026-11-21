#!/usr/bin/env bash
# One-time (and any later change to terraform/bootstrap/): applies the bootstrap Terraform from your computer.
#
#   ./scripts/bootstrap.sh          plan, then ask before applying
#   ./scripts/bootstrap.sh --yes    apply without asking (only after you have reviewed a plan)
#
# Needs: terraform >= 1.10, AWS credentials for the account (any way the AWS CLI accepts), and a GitHub token
# limited to this repository (defaults to `gh auth token`). See docs/setup.md.
set -euo pipefail

cd "$(dirname "$0")/../terraform/bootstrap"

: "${GITHUB_TOKEN:=$(gh auth token)}"
export GITHUB_TOKEN

account_id=$(aws sts get-caller-identity --query Account --output text)
bucket="free-scavenger-hunt-tfstate-${account_id}"
echo "AWS account: ${account_id}   state bucket: ${bucket}"

if ! aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
  echo "State bucket does not exist yet: creating it first with local state."
  mv backend.tf backend.tf.off
  trap 'mv backend.tf.off backend.tf 2>/dev/null || true' EXIT
  terraform init -input=false
  terraform apply -input=false -auto-approve \
    -target=aws_s3_bucket.state -target=aws_s3_bucket_versioning.state
  mv backend.tf.off backend.tf
  trap - EXIT
  echo "Moving state into the bucket."
  terraform init -input=false -migrate-state -force-copy
else
  terraform init -input=false
fi

if [ "${1:-}" = "--yes" ]; then
  terraform apply -input=false -auto-approve
else
  terraform plan -input=false -out="${TMPDIR:-/tmp}/fsh-bootstrap.tfplan"
  read -r -p "Apply this plan? [y/N] " answer
  [ "$answer" = "y" ] && terraform apply -input=false "${TMPDIR:-/tmp}/fsh-bootstrap.tfplan"
fi
