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
  # The pnpm that package.json's packageManager names, from pnpm's own
  # release; CI (pnpm/action-setup) and Netlify (corepack) install the same.
  pnpm = import ./nix/pnpm.nix {
    inherit pkgs;
    packageJson = ./package.json;
  };
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
  packages = [ pnpm ];
}
