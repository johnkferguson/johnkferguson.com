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
  # Kept off PATH: devenv turns scripts into packages, so listing it as well
  # would put two pnpm binaries in one profile. The `pnpm` script below
  # stands in for it.
  pnpmPackage = import ./nix/pnpm.nix {
    inherit pkgs;
    packageJson = ./package.json;
  };
  pnpm = "${pnpmPackage}/bin/pnpm";
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

  # A command that adds a package (`pnpm add <pkg>`, or `pnpm install <pkg>`
  # and `pnpm i <pkg>`, which pnpm treats the same) is checked by npq (a
  # devDependency) first; every other command goes straight to the real pnpm.
  # It catches mistakes; a deliberate workaround (npm, bun, editing
  # package.json) gets past it.
  scripts.pnpm.exec = ''
    die() { echo "pnpm (devenv wrapper): $*" >&2; exit 2; }
    adds=
    case "''${1-}" in
      add | install | i)
        skip=
        for arg in "''${@:2}"; do
          if [ -n "$skip" ]; then skip=; continue; fi
          case "$arg" in
            # npq drops these and installs for real.
            --dry-run | --pkgMgr* | --packageManager*) die "$arg is not supported with npq" ;;
            # Options that take a value; the value is not a package.
            -C | --dir | -F | --filter | --reporter | --loglevel | --registry | \
              --store-dir | --lockfile-dir | --modules-dir | --virtual-store-dir) skip=1 ;;
            -*) ;;
            *) adds=1 ;;
          esac
        done
        ;;
      -* | m | multi | recursive)
        # An add after global options or `recursive` would skip the check.
        for arg in "$@"; do
          case "$arg" in
            add | install | i) die "put the subcommand first: pnpm $arg <pkg> [options]" ;;
          esac
        done
        ;;
    esac
    if [ -n "$adds" ]; then
      npq="$DEVENV_ROOT/node_modules/.bin/npq-hero"
      if [ ! -x "$npq" ]; then
        echo "npq is not installed yet: run pnpm install first" >&2
        exit 1
      fi
      # Set here so a caller cannot loosen them. With auto-continue off, any
      # finding stops an install that no one at a terminal answers, agents
      # included. npq hands the install to the real pnpm, not this wrapper.
      exec env -u NPQ_ALLOW_NON_INTERACTIVE_INSTALL \
        NPQ_DISABLE_AUTO_CONTINUE=true NPQ_PKG_MGR=${pnpm} "$npq" "$@"
    fi
    exec ${pnpm} "$@"
  '';
}
