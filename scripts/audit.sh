#!/usr/bin/env bash
# Gate the dependency tree on high and critical advisories.
#
# Single source of truth for the ignore list, called from both check.yml (gates
# pull requests) and security.yml (scheduled sweep). Those catch different
# things: check.yml stops a PR that introduces a vulnerable dependency,
# security.yml catches a new advisory published against dependencies that have
# not changed. Neither subsumes the other.
#
# This matters more here than in most repos: GitHub's dependency graph does not
# parse bun.lock, so Dependabot alerts only ever see our direct dependencies.
# `bun audit` is the only thing that sees the full transitive tree.
set -euo pipefail

# Accepted advisories. Each is unfixable from our package.json — the vulnerable
# package is transitive and a parent pins the range below the fix (confirmed:
# `bun update` does not move them). Drop an entry once upstream releases within
# range, and this script starts enforcing it again. Reasoning describes the
# exposure class, not dependency paths — paths churn on every update and go
# stale immediately.
#
#   GHSA-5wm8-gmm8-39j9  fast-xml-builder, attribute-quote bypass in XMLBuilder
#     Reached only when @astrojs/rss serializes our RSS feed, building XML from
#     our own post frontmatter. No attacker-controlled attribute values.
#
#   GHSA-v39h-62p7-jpjc  fast-uri, host confusion via percent-encoded authority
#   GHSA-q3j6-qgpj-74h6  fast-uri, path traversal via percent-encoded dot segments
#     Reached only through @astrojs/check's language server. Runs against our
#     own source during type checking, never against untrusted input.
#
#   GHSA-v2hh-gcrm-f6hx  fast-uri, host confusion via literal backslash authority
#     Same language-server-only exposure as the two fast-uri entries above.
#     Unlike those, this one is TEMPORARY: the fix (3.1.4) is in ajv's range
#     but was published 2026-07-19, inside the 7-day release-age window. Drop
#     this entry and re-resolve fast-uri on or after 2026-07-26.
#
#   GHSA-c2c7-rcm5-vvqj  picomatch, ReDoS via extglob quantifiers
#     Reached only through build-time glob handling, over glob patterns we
#     author ourselves. No attacker-controlled input reaches it. (picomatch
#     arrives via several separate chains; they churn on every update, hence
#     the exposure description rather than a path list.)
#
#   GHSA-52cp-r559-cp3m  js-yaml, quadratic CPU via YAML merge-key chains
#     Reached only through astro's build-time frontmatter/config parsing, over
#     YAML we author ourselves. No attacker-controlled documents.
#
# KNOWN AND DELIBERATELY NOT IGNORED:
#
#   GHSA-3v7f-55p6-f55p  picomatch, method injection in POSIX character classes
#     Same build-time exposure argument as GHSA-c2c7-rcm5-vvqj, but currently
#     scored moderate so it sits below this gate. Left out of the ignore list
#     on purpose: if it is ever re-scored to high, CI should fail loudly rather
#     than stay silent. If you are reading this because that just happened, the
#     finding is expected — add it above with the same reasoning.
IGNORES=(
  --ignore=GHSA-5wm8-gmm8-39j9
  --ignore=GHSA-v39h-62p7-jpjc
  --ignore=GHSA-q3j6-qgpj-74h6
  --ignore=GHSA-v2hh-gcrm-f6hx
  --ignore=GHSA-c2c7-rcm5-vvqj
  --ignore=GHSA-52cp-r559-cp3m
)

bun audit --audit-level=high "${IGNORES[@]}"
