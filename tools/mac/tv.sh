#!/usr/bin/env bash
# Dev helper for the Vega Virtual Device: `tv.sh key KEY_ENTER`, `tv.sh shot out.png`.
source ~/vega/env
case "$1" in
  key) vega device run-cmd -c "inputd-cli button_press $2" >/dev/null 2>&1 ;;
  wid) swift "$(dirname "$0")/winid.swift" | awk '/Vega Virtual Device/ {print $1; exit}' ;;
  shot) screencapture -x -o -l "$("$0" wid)" "$2" ;;
esac
