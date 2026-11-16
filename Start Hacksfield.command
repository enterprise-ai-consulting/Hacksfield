#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd "$(dirname "$0")"
if [ ! -f .next/BUILD_ID ]; then
  echo "Run npm ci and npm run build in this folder first."
  exit 1
fi
exec npm start -- -p "${HACKSFIELD_PORT:-3001}"
