#!/bin/sh
# Orbital Fire Support - run to play (Linux).
# Opens the game in its own window with a Chromium-based browser if one is installed, otherwise in your default browser.
cd "$(dirname "$0")" || exit 1
GAME="$(pwd)/Orbital-Fire-Support.html"
if [ ! -f "$GAME" ]; then echo "Could not find Orbital-Fire-Support.html next to this file."; exit 1; fi
URL="file://$(printf '%s' "$GAME" | sed 's/ /%20/g')"
for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser; do
  if command -v "$b" >/dev/null 2>&1; then
    "$b" --app="$URL" --window-size=1280,760 >/dev/null 2>&1 &
    exit 0
  fi
done
xdg-open "$GAME" >/dev/null 2>&1 || echo "Open $GAME in your browser."
