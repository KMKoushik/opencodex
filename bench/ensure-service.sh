#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
source bench/env.sh
healthy() {
  bun -e 'import {connect} from "./bench/lib/opencode";const {url}=await connect();if(new URL(url).port!=="4989")throw new Error("Wrong isolated service port")' >/dev/null 2>&1
}
if healthy; then exit; fi
if lsof -nP -iTCP:4989 -sTCP:LISTEN -t >/dev/null; then
  echo 'Port 4989 is occupied but isolated discovery failed. Inspect /tmp/ocr-bench; no process has been stopped.' >&2
  exit 2
fi
if [ ! -x /tmp/ocr-bench/pkg/node_modules/.bin/opencode ]; then
  OPENCODEX_FIXTURE=/tmp/ocr-bench bash apps/rune/tools/isolated.sh install
fi
mkdir -p /tmp/ocr-bench
nohup env OPENCODEX_FIXTURE=/tmp/ocr-bench OPENCODEX_FIXTURE_SERVICE_PORT=4989 \
  bash apps/rune/tools/isolated.sh opencode > /tmp/ocr-bench/service.log 2>&1 &
echo "$!" > /tmp/ocr-bench/service.pid
for _ in $(seq 1 60); do
  if healthy; then exit; fi
  sleep 0.5
done
echo 'Isolated OpenCode did not become healthy. See /tmp/ocr-bench/service.log. No user service was touched.' >&2
exit 1
