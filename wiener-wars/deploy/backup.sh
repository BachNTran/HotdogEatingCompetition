#!/usr/bin/env bash
# Periodic snapshot of the app's only state file (data.json), timestamped.
# Installed to run from cron on the droplet. Keeps the newest $KEEP snapshots.
set -euo pipefail

APP_DIR="/opt/wiener-wars"
SRC="$APP_DIR/data.json"
DEST="$APP_DIR/backups"
KEEP=60   # at every-6h, ~15 days of history

mkdir -p "$DEST"
# Nothing to back up until the first friend writes data.
[ -s "$SRC" ] || exit 0

ts="$(date +%Y%m%d-%H%M%S)"
cp "$SRC" "$DEST/data-$ts.json"

# Rotate: delete everything older than the newest $KEEP snapshots.
ls -1t "$DEST"/data-*.json 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
