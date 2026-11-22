#!/bin/sh
# Arguments are data, not interpolated shell source. Only explicit Restart runs this.
set -eu
parent="$1"; target="$2"; replacement="$3"
root="$(dirname "$replacement")"
backup="$root/previous.app"
attempt=0
while kill -0 "$parent" 2>/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -gt 120 ]; then exit 1; fi
  sleep 1
done
mv "$target" "$backup"
if ! mv "$replacement" "$target"; then mv "$backup" "$target"; exit 1; fi
if ! /usr/bin/open -n "$target"; then
  mv "$target" "$replacement"
  mv "$backup" "$target"
  /usr/bin/open -n "$target"
  exit 1
fi
# Only remove this helper's private staging directory after a successful swap.
rm -rf "$root"
