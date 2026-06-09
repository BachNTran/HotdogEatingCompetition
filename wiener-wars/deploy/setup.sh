#!/usr/bin/env bash
# Run this ON the droplet, from /opt/wiener-wars, as root (or with sudo).
# Usage:  SIGNUP_KEY=hotdog2026 bash deploy/setup.sh
#
# Installs Node + ufw, opens the firewall (SSH + port 80), and installs a
# systemd service that starts on boot, restarts on crash, and reads the
# shared invite key (SIGNUP_KEY) friends type to create their accounts.
set -euo pipefail

APP_DIR="/opt/wiener-wars"
# SIGNUP_KEY is the invite key; ROOM_PIN still works as an alias for old habits.
SIGNUP_KEY="${SIGNUP_KEY:-${ROOM_PIN:-letmein}}"

echo "==> Installing Node.js + ufw (if missing)"
apt-get update -y
apt-get install -y nodejs ufw
node --version

echo "==> Opening firewall (SSH + HTTP)"
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw --force enable || true

echo "==> Setting file ownership"
chown -R www-data:www-data "$APP_DIR"
# data.json must be writable by the service user (created on first run if absent)
touch "$APP_DIR/data.json" && chown www-data:www-data "$APP_DIR/data.json"

echo "==> Installing systemd service with your invite key"
# Use a non-/ delimiter so keys containing slashes still work.
sed "s|CHANGE_ME|${SIGNUP_KEY}|" "$APP_DIR/deploy/wiener-wars.service" > /etc/systemd/system/wiener-wars.service
systemctl daemon-reload
systemctl enable wiener-wars
systemctl restart wiener-wars

sleep 1
echo "==> Status:"
systemctl --no-pager --lines=5 status wiener-wars || true
echo ""
echo "Done. Visit http://<this-droplet-ip>/"
echo "Share the invite key with friends so they can sign up: ${SIGNUP_KEY}"
