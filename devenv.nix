{ pkgs, lib, ... }:
let
  # bun runs the unit tests and the scripts in scripts/, at the version in
  # .bun-version, which check.yml's setup-bun reads too.
  bun = pkgs.bun.overrideAttrs (_: rec {
    version = lib.fileContents ./.bun-version;
    src = pkgs.fetchurl {
      url = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-linux-x64.zip";
      hash = "sha256-lR7iruhV8IWVruxiJSJqKY0/6oOj3NZGXAnLzN9+hI8=";
    };
  });
  # pnpm comes from nixpkgs, and package.json's packageManager names the same
  # version, which CI (pnpm/action-setup) and Netlify (corepack) install.
  # After `devenv update` moves nixpkgs, this shell refuses to start and names
  # the version nixpkgs now provides; set packageManager to it.
  # scripts/check-pnpm-version.sh fails a commit where the two differ.
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
