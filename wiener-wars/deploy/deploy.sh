#!/usr/bin/env bash
# Run this FROM YOUR LAPTOP, inside the wiener-wars/ folder. It copies the app to
# your DigitalOcean droplet over SSH and starts it as a permanent service.
#
# Usage:
#   DROPLET_IP=203.0.113.10 SIGNUP_KEY=hotdog2026 bash deploy/deploy.sh
#   # optional: SSH_USER (default root)
#
# Prereqs: your SSH key is already on the droplet (key auth). No passwords are
# typed or stored by this script.
set -euo pipefail

DROPLET_IP="${DROPLET_IP:?Set DROPLET_IP=your.droplet.ip}"
SSH_USER="${SSH_USER:-root}"
SIGNUP_KEY="${SIGNUP_KEY:-letmein}"
REMOTE="${SSH_USER}@${DROPLET_IP}"
# Optional: path to a specific private key (e.g. SSH_KEY=~/.ssh/digital_ocean).
KEYOPT=""
[ -n "${SSH_KEY:-}" ] && KEYOPT="-i ${SSH_KEY}"

# Always run from the project root (folder that contains server.js).
cd "$(dirname "$0")/.."

echo "==> Creating /opt/wiener-wars on ${REMOTE}"
ssh $KEYOPT "$REMOTE" 'mkdir -p /opt/wiener-wars'

echo "==> Copying app (server.js, package.json, public/, deploy/) — not data.json"
scp $KEYOPT -r ./server.js ./package.json ./public ./deploy "${REMOTE}:/opt/wiener-wars/"

echo "==> Installing + starting service (invite key: ${SIGNUP_KEY})"
ssh $KEYOPT "$REMOTE" "cd /opt/wiener-wars && SIGNUP_KEY='${SIGNUP_KEY}' bash deploy/setup.sh"

echo "==> Verifying"
code=$(ssh $KEYOPT "$REMOTE" "curl -s -o /dev/null -w '%{http_code}' http://localhost/")
echo "    homepage HTTP ${code} (expect 200)"

echo ""
echo "✅ Live at:  http://${DROPLET_IP}/"
echo "   Friends sign up with the invite key:  ${SIGNUP_KEY}"
echo "   Each picks their own name + PIN to log back in."
