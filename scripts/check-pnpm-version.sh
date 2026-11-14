#!/usr/bin/env bash
# Fails when package.json's packageManager names a different pnpm than the one
# devenv.nix takes from the nixpkgs devenv.lock pins. CI installs
# packageManager's version and devenv provides nixpkgs', so the two must
# agree. Run by .githooks/pre-commit when package.json, devenv.lock or
# devenv.nix is staged, on the staged files. Needs nix and jq; without them it
# skips, and `devenv shell` still refuses to start on a mismatch.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

for tool in nix jq; do
  if ! command -v "$tool" >/dev/null; then
    echo "check-pnpm-version: $tool not found; skipped (devenv shell checks the same)" >&2
    exit 0
  fi
done

pinned=$(git show :package.json | jq -r '.packageManager // ""')
pinned=${pinned#pnpm@}
pinned=${pinned%%+*}

# The attribute devenv.nix uses, e.g. `pnpm = pkgs.pnpm_12;`.
attr=$(git show :devenv.nix | sed -n 's/^[[:space:]]*pnpm = pkgs\.\([A-Za-z0-9_]*\);.*/\1/p' | head -n 1)
if [ -z "$attr" ]; then
  echo "check-pnpm-version: no 'pnpm = pkgs.<attr>;' line in devenv.nix" >&2
  exit 1
fi

ref=$(git show :devenv.lock | jq -r '.nodes.nixpkgs.locked | "github:\(.owner)/\(.repo)/\(.rev)"')
provided=$(nix --extra-experimental-features 'nix-command flakes' eval --raw "$ref#$attr.version")

if [ "$pinned" != "$provided" ]; then
  echo "package.json packageManager is pnpm@$pinned, but devenv's $attr ($ref) is $provided." >&2
  echo "Set packageManager to pnpm@$provided, or move nixpkgs with devenv update." >&2
  exit 1
fi
