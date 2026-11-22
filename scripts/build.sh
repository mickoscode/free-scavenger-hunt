#!/usr/bin/env bash
# Assembles dist/ = the exact contents of the site bucket.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
cp -R web/. dist/
