#!/usr/bin/env bash
# Fails when package.json's packageManager names a different pnpm than the
# pnpm_12 in the nixpkgs devenv.lock pins. CI installs packageManager's
# version and devenv provides nixpkgs', so the two must agree. Run as a
# pre-commit hook when either file changes; needs nix and jq.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Staged versions, which are what the commit takes.
pinned=$(git show :package.json | jq -r '.packageManager // ""')
pinned=${pinned#pnpm@}
pinned=${pinned%%+*}

lock=$(git show :devenv.lock)
ref=$(jq -r '.nodes.nixpkgs.locked | "github:\(.owner)/\(.repo)/\(.rev)"' <<<"$lock")
provided=$(nix eval --raw "$ref#pnpm_12.version")

if [ "$pinned" != "$provided" ]; then
  echo "package.json packageManager is pnpm@$pinned, but devenv's nixpkgs ($ref) provides pnpm $provided." >&2
  echo "Set packageManager to pnpm@$provided, or move nixpkgs with devenv update." >&2
  exit 1
fi
