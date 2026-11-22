#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p bench/.build
if [ ! -x bench/.build/preflight ] || [ bench/lib/preflight.swift -nt bench/.build/preflight ]; then
  swiftc -O bench/lib/preflight.swift -o bench/.build/preflight
fi
if [ "${1:-}" = --permissions ]; then exec bench/.build/preflight --permissions; fi
bun -e 'import {requireVisibleScreen} from "./bench/lib/screen"; requireVisibleScreen()'
bench/.build/preflight --permissions
bench/.build/preflight
