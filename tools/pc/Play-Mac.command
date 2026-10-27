#!/bin/bash
# Orbital Fire Support - double-click to play (macOS).
# Opens the game in its own window with Chrome, Edge, Brave or Chromium if you have one, otherwise in your default browser.
cd "$(dirname "$0")" || exit 1
GAME="$(pwd)/Orbital-Fire-Support.html"
if [ ! -f "$GAME" ]; then echo "Could not find Orbital-Fire-Support.html next to this file."; exit 1; fi
URL="file://$(printf '%s' "$GAME" | sed 's/ /%20/g')"
for app in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium"; do
  if [ -d "/Applications/$app.app" ]; then
    open -na "$app" --args --app="$URL" --window-size=1280,760
    exit 0
  fi
done
open "$GAME"
