# Pins bun to the version Dependabot's bun image runs. A newer bun writes a
# bun.lock format that version cannot parse, which breaks every Dependabot
# PR. Keep in sync with packageManager in package.json and BUN_VERSION in
# netlify.toml; scripts/check-bun-version.ts enforces the latter two.
{ pkgs, ... }:
let
  bun = pkgs.bun.overrideAttrs (_: rec {
    version = "1.3.14";
    src = pkgs.fetchurl {
      url = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-linux-x64.zip";
      hash = "sha256-lR7iruhV8IWVruxiJSJqKY0/6oOj3NZGXAnLzN9+hI8=";
    };
  });
in
{
  languages.javascript.enable = true;
  languages.javascript.bun = {
    enable = true;
    package = bun;
  };
}
