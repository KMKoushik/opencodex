#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
INPUT=${1:?input video required}; OUTPUT=${2:?output mp4 required}
CARD=${3:-bench/results/endcard.txt}
mkdir -p bench/.build/video-art
if [ ! -x bench/.build/video-art-render ] || [ bench/lib/video-art.swift -nt bench/.build/video-art-render ]; then
  swiftc -O bench/lib/video-art.swift -o bench/.build/video-art-render
fi
bench/.build/video-art-render bench/.build/video-art "$CARD"
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$INPUT")
ffprobe -v error -show_entries stream=codec_name,width,height,avg_frame_rate,r_frame_rate,nb_frames \
  -show_entries format=duration,size -of json "$INPUT" > "$OUTPUT.source.probe.json"
# Cap bitrate from actual duration, including eight-second end card, to stay below 60 MB.
BITRATE=$(bun -e 'console.log(Math.min(4500000,Math.floor(54e6*8/(Number(process.argv[1])+8))))' "$DURATION")
ffmpeg -hide_banner -loglevel warning -y -i "$INPUT" \
  -framerate 1 -i bench/.build/video-art/timer-%03d.png \
  -loop 1 -framerate 60 -i bench/.build/video-art/endcard.png \
  -filter_complex "[0:v]scale=1920:1018:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:62,setsar=1,fps=60[screen];[screen][1:v]overlay=0:0:shortest=1,trim=duration=$DURATION,setpts=PTS-STARTPTS[main];[2:v]trim=duration=8,setpts=PTS-STARTPTS,setsar=1[end];[main][end]concat=n=2:v=1:a=0[out]" \
  -map '[out]' -an -c:v libx264 -preset fast -b:v "$BITRATE" -maxrate "$BITRATE" -bufsize "$((BITRATE * 2))" \
  -pix_fmt yuv420p -movflags +faststart "$OUTPUT"
bun -e 'const f=Bun.file(process.argv[1]);if(f.size>60e6)throw new Error("Video exceeds 60 MB"); console.log(process.argv[1],f.size,"bytes")' "$OUTPUT"
ffprobe -v error -show_entries stream=codec_name,width,height,avg_frame_rate -show_entries format=duration,size -of json "$OUTPUT" > "$OUTPUT.probe.json"
