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
    # pnpm options that take a value, so the value is not a package.
    takes_value() {
      case "$1" in
        -C | --dir | -F | --filter | --filter-prod | --reporter | --loglevel | \
          --registry | --store-dir | --lockfile-dir | --modules-dir | \
          --virtual-store-dir | --state-dir | --cpu | --os | --libc | \
          --workspace-concurrency | --save-prefix | --save-catalog-name | \
          --allow-build | --npmrc-auth-file | --proxy | --https-proxy) return 0 ;;
      esac
      return 1
    }
    adds=
    valueopt=
    case "''${1-}" in
      add | install | i)
        skip=
        for arg in "''${@:2}"; do
          if [ -n "$skip" ]; then skip=; continue; fi
          case "$arg" in
            # npq drops these and installs for real.
            --dry-run | --pkgMgr* | --packageManager*) die "$arg is not supported with npq" ;;
            -*)
              if takes_value "$arg"; then
                skip=1
                # npq parses -F/--filter itself; it would read other values as packages.
                case "$arg" in -F | --filter) ;; *) valueopt=$arg ;; esac
              fi
              ;;
            # npq checks registry packages only; it would check an alias,
            # git, URL or path spec as some other package.
            *:* | .* | /* | "~"*) die "$arg: only registry packages (name, name@version, name@tag) can be added" ;;
            *) adds=1 ;;
          esac
        done
        if [ -n "$adds" ] && [ -n "$valueopt" ]; then
          die "$valueopt is not supported when adding a package"
        fi
        ;;
      -* | m | multi | recursive)
        # An add after global options or `recursive` would skip the check.
        seen=
        for arg in "$@"; do
          if [ -n "$seen" ]; then
            case "$arg" in -*) ;; *) die "put the subcommand first: pnpm $seen <pkg> [options]" ;; esac
          fi
          case "$arg" in add | install | i) seen=$arg ;; esac
        done
        ;;
    esac
    if [ -n "$adds" ]; then
      npq="$DEVENV_ROOT/node_modules/.bin/npq-hero"
      if [ ! -x "$npq" ]; then
        echo "npq is not installed yet: run pnpm install first" >&2
        exit 1
      fi
      # Each MARSHALL_DISABLE_<CHECK> variable turns off one npq check, so
      # none reach it from the caller.
      for var in $(compgen -e); do
        case "$var" in MARSHALL_*) unset "$var" ;; esac
      done
      # Auto-continue off: any finding stops an install that no one at a
      # terminal answers, agents included. Set here so a caller cannot
      # loosen it. npq runs `pnpm`, found first on PATH as the real one, and
      # parses arguments the way pnpm does.
      export PATH="${pnpmPackage}/bin:$PATH"
      exec env NPQ_DISABLE_AUTO_CONTINUE=true NPQ_PKG_MGR=pnpm "$npq" "$@"
    fi
    exec ${pnpm} "$@"
  '';
}
