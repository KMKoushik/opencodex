#!/bin/bash
# Test-only. All service discovery and OpenCode state stay below this temporary HOME.
set -euo pipefail
export T=${OPENCODEX_FIXTURE:-/tmp/ocr-m1}
export HOME=$T/home
export XDG_CONFIG_HOME=$HOME/.config XDG_DATA_HOME=$HOME/.local/share
export XDG_STATE_HOME=$HOME/.local/state XDG_CACHE_HOME=$HOME/.cache
export PATH=$T/pkg/node_modules/.bin:$PATH
mkdir -p "$HOME" "$T/pkg" "$T/proj"
case "${1:-}" in
  install) cd "$T/pkg"; npm i --silent @opencode/cli@2.3.2 ;;
  opencode) opencode service set port "${OPENCODEX_FIXTURE_SERVICE_PORT:-4901}"; exec opencode serve --service ;;
  gateway) PORT=${OPENCODEX_FIXTURE_GATEWAY_PORT:-4431} exec node --import tsx packages/gateway/src/cli.ts --production ;;
  *) echo 'Usage: tools/isolated.sh install|opencode|gateway' >&2; exit 1 ;;
esac
