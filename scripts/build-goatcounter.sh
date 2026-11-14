#!/usr/bin/env bash
# Vendor GoatCounter's count.js, minified, into src/assets/.
#
# Vendored rather than loaded from gc.zgo.at so the Lighthouse third-party
# budget of 0 holds. Imported through Vite (?url) in BaseLayout, which hashes
# the filename but copies the bytes as-is, so minifying happens here.
#
# Usage: scripts/build-goatcounter.sh [commit]
# With no commit, takes the latest upstream change to public/count.js.
set -euo pipefail

repo=arp242/goatcounter
commit=${1:-$(gh api "repos/$repo/commits?path=public/count.js&per_page=1" --jq '.[0].sha')}
out=src/assets/goatcounter-count.js

src=
tmp=
trap 'rm -f "$src" "$tmp"' EXIT
src=$(mktemp --suffix=.js)
# Next to the output, so the final mv is a rename on one filesystem.
tmp=$(mktemp "$out.XXXXXX")
curl -fsSL "https://raw.githubusercontent.com/$repo/$commit/public/count.js" -o "$src"

{
	printf '/*! GoatCounter count.js, ISC license: https://opensource.org/licenses/ISC\n'
	printf ' * Vendored and minified by scripts/build-goatcounter.sh from\n'
	printf ' * https://github.com/%s/blob/%s/public/count.js */\n' "$repo" "$commit"
	pnpm exec esbuild "$src" --minify --legal-comments=none --log-level=warning
} >"$tmp"
# Replace the vendored file only once esbuild has succeeded.
chmod 644 "$tmp"
mv "$tmp" "$out"

echo "$out: $(wc -c <"$out") bytes, $(gzip -c "$out" | wc -c) gzipped, from $commit"
