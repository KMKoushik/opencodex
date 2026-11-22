#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash bench/preflight.sh
source bench/env.sh
bash bench/ensure-service.sh
bun bench/fixture.ts
PROJECT=$(bun -e 'console.log((await Bun.file("/tmp/ocr-bench/fixture.json").json()).projects[0])')
SESSION=$(bun -e 'console.log((await Bun.file("/tmp/ocr-bench/fixture.json").json()).sessionID)')
mkdir -p bench/results
for run in 1 2 3; do
  for app in electron rune; do
    if [ "$app" = electron ]; then
      bundle=apps/desktop/release/mac-arm64/OpenCodex.app; driver=cdp
    else
      bundle='apps/rune/dist/OpenCodex Rune.app'; driver=marker
    fi
    bun bench/bench.ts --app "$bundle" --driver "$driver" --runs 1 --name "$app-visible-$run" \
      --project "$PROJECT" --source-session "$SESSION" --model opencode/big-pickle \
      --out "bench/results/$app-visible-$run.json"
  done
done
bun bench/report.ts visible
if [ "${1:-}" != --no-video ]; then bash bench/video.sh; fi
