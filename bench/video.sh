#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p bench/.build
for helper in capture tile input winwatch; do
  if [ ! -x "bench/.build/$helper" ] || [ "bench/lib/$helper.swift" -nt "bench/.build/$helper" ]; then
    if [ "$helper" = capture ]; then
      swiftc -O -parse-as-library "bench/lib/$helper.swift" -o "bench/.build/$helper"
    else
      swiftc -O "bench/lib/$helper.swift" -o "bench/.build/$helper"
    fi
  fi
done
if [ "${1:-}" = --self-test ]; then
  bench/.build/tile --dry-run
  echo 'SYNTHETIC COMPOSITION TEST — NOT A BENCHMARK' > bench/.build/synthetic-card.txt
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=c=0x182230:s=1920x1080:r=60:d=3' -c:v libx264 -pix_fmt yuv420p bench/.build/synthetic.mov
  bash bench/compose.sh bench/.build/synthetic.mov bench/.build/synthetic.mp4 bench/.build/synthetic-card.txt
  exit
fi
bash bench/preflight.sh
if [ ! -f bench/results/COMPARISON.md ]; then echo 'Run bash bench/run-visible.sh first; the video needs real visible benchmark end cards.' >&2; exit 2; fi
source bench/env.sh
bash bench/ensure-service.sh
bun bench/report.ts visible > /dev/null
bun bench/video.ts
bash bench/compose.sh bench/.build/capture.mov bench/results/rune-vs-electron.mp4
