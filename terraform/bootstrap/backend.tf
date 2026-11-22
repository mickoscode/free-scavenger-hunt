# State lives in the bucket this configuration creates (state.tf). On the very first run scripts/bootstrap.sh sets
# this file aside, creates the bucket with local state, then moves the state here.
terraform {
  backend "s3" {
    bucket       = "free-scavenger-hunt-tfstate-722937635825"
    key          = "bootstrap/terraform.tfstate"
    region       = "ap-southeast-2"
    use_lockfile = true
    encrypt      = true
  }
}
