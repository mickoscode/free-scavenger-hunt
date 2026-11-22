#!/usr/bin/env bash
# Assembles dist/ = the exact contents of the site bucket: web/ plus the vendored Bootstrap CSS and QR code library.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist/css dist/js/vendor
cp -R web/. dist/
cp node_modules/bootstrap/dist/css/bootstrap.min.css dist/css/bootstrap.min.css
cp node_modules/qrcode-generator/dist/qrcode.mjs dist/js/vendor/qrcode.mjs
