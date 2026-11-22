#!/usr/bin/env bash
# Packages the API for Lambda into build/backend.zip (the AWS SDK is provided by the Lambda runtime).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf build
mkdir -p build/backend
cp -R api/. build/backend/
(cd build/backend && zip -qr ../backend.zip .)
echo "build/backend.zip: $(du -h build/backend.zip | cut -f1)"
