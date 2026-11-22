#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
source bench/env.sh
bash bench/ensure-service.sh
mkdir -p bench/results
bun bench/fixture.ts
PROJECT=$(bun -e 'console.log((await Bun.file("/tmp/ocr-bench/fixture.json").json()).projects[0])')
SESSION=$(bun -e 'console.log((await Bun.file("/tmp/ocr-bench/fixture.json").json()).sessionID)')
for run in 1 2 3; do
  for app in electron rune; do
    if [ "$app" = electron ]; then
      bundle=apps/desktop/release/mac-arm64/OpenCodex.app; driver=cdp
    else
      bundle='apps/rune/dist/OpenCodex Rune.app'; driver=marker
    fi
    bun bench/bench.ts --app "$bundle" --driver "$driver" --headless-safe --runs 1 \
      --idle-ms 10000 --name "$app-locked-$run" --project "$PROJECT" --source-session "$SESSION" \
      --out "bench/results/$app-locked-$run.json"
  done
done
bun bench/report.ts locked
