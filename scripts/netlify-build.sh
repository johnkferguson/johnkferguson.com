#!/usr/bin/env bash
# Netlify's build command. Fails unless Netlify installed the pnpm that
# package.json's packageManager names (it reads that field through corepack),
# so a green deploy shows the pinned pnpm ran. Then builds the site.
set -euo pipefail

want=$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "").split("+")[0]')
have=$(pnpm --version)
echo "pnpm $have (packageManager pins $want)"
if [ "$have" != "$want" ]; then
  echo "netlify-build: Netlify ran pnpm $have, not the pinned $want" >&2
  exit 1
fi
exec pnpm run build
