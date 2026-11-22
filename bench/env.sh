#!/bin/bash
# Source only from benchmark scripts. Never inherit the user's service/profile.
export HOME=/tmp/ocr-bench/home
export XDG_CONFIG_HOME=$HOME/.config XDG_DATA_HOME=$HOME/.local/share
export XDG_STATE_HOME=$HOME/.local/state XDG_CACHE_HOME=$HOME/.cache
export PATH=/tmp/ocr-bench/pkg/node_modules/.bin:$PATH
unset OPENCODEX_GATEWAY OPENCODE_URL ELECTRON_RUN_AS_NODE NODE_OPTIONS
