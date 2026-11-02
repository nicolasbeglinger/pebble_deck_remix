{
  description = "pebble_deck - a terminal-inspired Pebble watchface";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    pebble.url = "github:pebble-dev/pebble.nix";
  };

  outputs = { self, nixpkgs, flake-utils, pebble, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # pebble.nix is still on pebble-tool 5.0.40, and only 5.1+ with pypkjs 3 can run plugins
        # in the emulator. Drop this overlay once it catches up.
        pebblePkgs = import pebble.inputs.nixpkgs {
          inherit system;
          overlays = [
            pebble.overlays.default
            (final: prev:
              let
                quickjs-ng = final.python3Packages.buildPythonPackage rec {
                  pname = "quickjs-ng";
                  version = "0.17.0.2";

                  src = final.fetchPypi {
                    pname = "quickjs_ng";
                    inherit version;
                    hash = "sha256-Q9LkgnIghyGnquqOPwLUuTGPEu8gzE9UIbWdmkcHBu8=";
                  };

                  pyproject = true;
                  build-system = [ final.python3Packages.setuptools ];
                };
              in
              {
                pypkjs = prev.pypkjs.overridePythonAttrs (old: rec {
                  version = "3.0.3";

                  src = final.fetchPypi {
                    pname = "pypkjs";
                    inherit version;
                    hash = "sha256-ZVtRRKEOrXRN03YorwQ8rofKVMlRSdzBZAfgEVWEykQ=";
                  };

                  propagatedBuildInputs =
                    builtins.filter (dep: dep.pname or "" != "stpyv8") old.propagatedBuildInputs
                    ++ [ quickjs-ng ];
                });

                pebble-tool = prev.pebble-tool.overridePythonAttrs (old: rec {
                  version = "5.1.2";

                  src = final.fetchPypi {
                    pname = "pebble_tool";
                    inherit version;
                    hash = "sha256-fHRePe+fKajsFvYRcmfY4FZGPIik4D/TRSA9mFQEw+M=";
                  };
                });
              })
          ];
        };

        pebbleEnv = pebblePkgs.callPackage "${pebble}/buildTools/pebbleEnv.nix" { };
      in
      {
        devShells.default = pebbleEnv {
          packages = with pkgs; [
            gnumake
          ];

          shellHook = ''
            if [ -f package.json ] && [ ! -d node_modules ]; then
              echo "Installing npm dependencies..."
              npm install
            fi
            export PEBBLE_EMULATOR='emery'
            echo "Pebble dev environment loaded. Use 'pebble build' to compile."
          '';
        };
      });
}
