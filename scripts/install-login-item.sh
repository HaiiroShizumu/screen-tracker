#!/bin/bash
# Registers Screen Tracker.app to launch at login via LaunchAgent (fallback/helper).
set -euo pipefail

APP="${1:-$HOME/Applications/Screen Tracker.app}"
if [[ ! -d "$APP" ]]; then
  APP="$(cd "$(dirname "$0")/.." && pwd)/release/mac-arm64/Screen Tracker.app"
fi

if [[ ! -d "$APP" ]]; then
  echo "Не найден Screen Tracker.app"
  echo "Сначала: npm run build:mac"
  echo "Или укажи путь: $0 \"/path/to/Screen Tracker.app\""
  exit 1
fi

LABEL="local.screen.tracker"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
BIN="$APP/Contents/MacOS/Screen Tracker"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${BIN}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "OK: автозапуск при входе → $APP"
echo "plist: $PLIST"
