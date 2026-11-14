# pnpm at the version package.json's packageManager names, from pnpm's own
# GitHub release, so devenv and CI run the same pnpm. nixpkgs builds pnpm 12
# from source and trails its releases.
#
# After moving packageManager to a new version, replace each hash with
#   nix store prefetch-file --json \
#     https://github.com/pnpm/pnpm/releases/download/v<version>/pnpm-<asset>.tar.gz | jq -r .hash
# Until then devenv fails with a hash mismatch rather than running another pnpm.
{ pkgs, packageJson }:
let
  packageManager = (builtins.fromJSON (builtins.readFile packageJson)).packageManager or "";
  # Drops an integrity suffix such as "+sha512.<hash>".
  version = builtins.head (pkgs.lib.splitString "+" (pkgs.lib.removePrefix "pnpm@" packageManager));

  # The Linux builds are static (musl), so they run on NixOS without patching.
  assets = {
    x86_64-linux = {
      name = "linux-x64-musl";
      hash = "sha256-+q7VhWUn5PHo1eFu33l8bmQ8vhUh49FeLXkegpVIn7E=";
    };
    aarch64-linux = {
      name = "linux-arm64-musl";
      hash = "sha256-hsgOt0Sx/0HKdAC7H4yl+1IrIQHaOayTvUXzvGUuXPs=";
    };
    x86_64-darwin = {
      name = "darwin-x64";
      hash = "sha256-NMyQ+6oGDEWLWH+9sfP5R36X4/0/jp/7LUPKRcDJsAU=";
    };
    aarch64-darwin = {
      name = "darwin-arm64";
      hash = "sha256-m2R/Y01+jyMWLJ09HQ4JUNEVJALKD0wzFYPtfHXNNwY=";
    };
  };
  asset =
    assets.${pkgs.stdenv.hostPlatform.system}
      or (throw "nix/pnpm.nix has no pnpm build for ${pkgs.stdenv.hostPlatform.system}");
in
assert pkgs.lib.assertMsg (pkgs.lib.hasPrefix "pnpm@" packageManager)
  "package.json packageManager must name pnpm, not \"${packageManager}\"";
pkgs.stdenvNoCC.mkDerivation {
  pname = "pnpm";
  inherit version;
  src = pkgs.fetchurl {
    url = "https://github.com/pnpm/pnpm/releases/download/v${version}/pnpm-${asset.name}.tar.gz";
    inherit (asset) hash;
  };
  sourceRoot = ".";
  dontBuild = true;
  # The binary finds its bundled dist/ next to its real path.
  installPhase = ''
    runHook preInstall
    mkdir -p $out/libexec/pnpm $out/bin
    cp -R pnpm dist $out/libexec/pnpm/
    ln -s $out/libexec/pnpm/pnpm $out/bin/pnpm
    runHook postInstall
  '';
  dontStrip = true;
  dontPatchELF = true;
  meta.mainProgram = "pnpm";
}
