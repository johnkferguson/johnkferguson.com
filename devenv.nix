{ pkgs, lib, ... }:
let
  # bun runs the unit tests and the scripts in scripts/. Pinned to the version
  # check.yml installs, so local runs match CI.
  bun = pkgs.bun.overrideAttrs (_: rec {
    version = "1.3.14";
    src = pkgs.fetchurl {
      url = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-linux-x64.zip";
      hash = "sha256-lR7iruhV8IWVruxiJSJqKY0/6oOj3NZGXAnLzN9+hI8=";
    };
  });
  # pnpm comes from nixpkgs, and package.json's packageManager names the same
  # version, which CI (pnpm/action-setup) and Netlify (corepack) install.
  # After `devenv update` moves nixpkgs, set packageManager to `pnpm --version`
  # from the new shell; until then this shell refuses to start, and
  # scripts/check-pnpm-version.sh fails the commit.
  pnpm = pkgs.pnpm_12;
  packageManager = (lib.importJSON ./package.json).packageManager or "";
  pinned = builtins.head (lib.splitString "+" (lib.removePrefix "pnpm@" packageManager));
in
{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    bun = {
      enable = true;
      package = bun;
    };
  };
  packages =
    assert lib.assertMsg (pinned == pnpm.version)
      "package.json packageManager is \"${packageManager}\", but devenv's nixpkgs provides pnpm ${pnpm.version}";
    [ pnpm ];
}
