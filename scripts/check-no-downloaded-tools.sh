#!/usr/bin/env bash
# Fails when a workflow, script or config runs a tool downloaded outside the
# lockfile, in one of the spellings listed below. Add the tool as a
# devDependency and run it from node_modules, so the lockfile and the 7-day
# wait apply to it. A fixed list of spellings catches mistakes; a deliberate
# workaround can get past it.
#
# Uses git grep, which every checkout has (ripgrep is not on GitHub's runner
# images), with POSIX classes for word boundaries, since git on macOS does not
# read \b in extended regexes. --cached searches what is staged, which in CI
# is the checked-out commit. Run from CI and as a pre-commit hook.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

paths=(.github .githooks scripts package.json netlify.toml .mcp.json devenv.nix devenv.yaml .envrc nix astro.config.mjs)

# A path that matches no tracked file would be searched as "no match".
for p in "${paths[@]}"; do
  if [ -z "$(git ls-files --cached -- "$p" | head -n 1)" ]; then
    echo "check-no-downloaded-tools: $p is not a tracked path; update paths" >&2
    exit 2
  fi
done

b='(^|[^[:alnum:]_-])'  # start of a word
e='([^[:alnum:]_-]|$)'  # end of a word
s='[[:space:]]+'

status=0
git grep --cached -nIE \
  -e "${b}(npx|bunx|pnpx|uvx)${e}" \
  -e "${b}bun(${s}-[^[:space:]]+)*${s}x${e}" \
  -e "${b}npm(${s}-[^[:space:]]+)*${s}(x|exec)${e}" \
  -e "${b}(pnpm|yarn)(${s}-[^[:space:]]+)*${s}dlx${e}" \
  -e "${b}uv${s}tool${s}run${e}" \
  -e "${b}pipx${s}run${e}" \
  -e "@latest${e}" \
  -e "(curl|wget)[^|]*\|[[:space:]]*(sudo(${s}-[^[:space:]]+)*${s}|env${s})?(ba|z)?sh${e}" \
  -e "${b}((ba|z)?sh${s}(-c${s})?|eval${s}|source${s}|\.${s})[\"']?(<\(|\\\$\()[[:space:]]*(curl|wget)${e}" \
  -- "${paths[@]}" ':!scripts/check-no-downloaded-tools.sh' || status=$?

case $status in
  0)
    echo "Downloaded tool found. Add it as a devDependency and run it from node_modules." >&2
    exit 1
    ;;
  1) exit 0 ;;                       # no match
  *) echo "git grep failed (exit $status)" >&2; exit "$status" ;;
esac
