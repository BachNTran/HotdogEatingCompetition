# Wiener Wars 🌭

A tiny, self-contained hotdog-eating-contest tracker for a group of friends. Runs as a
single Node.js process (zero npm dependencies) and stores everything in one `data.json`
file on disk. Built to run on a cheap DigitalOcean droplet for ~a month.

## Features
- **Invite-key signup** — friends with the shared key create an account (name + their own PIN).
- **Leaderboard** — total dogs, today's count, live online count.
- **Daily logging** with optional **proof photos**, heavily compressed client-side
  (~440px / JPEG q0.42, ≈15–20 KB each) so storage stays tiny.
- **Community timeline** — who logged how many 🌭 and when (date · HH:MM · relative).
- **Friend logs** — tap anyone on the board to see their daily history.
- **Live presence** — 10s polling + a 35s `lastSeen` window marks who's online now.
- PINs stored only as salted SHA-256 hashes; sessions via tokens (survive restarts).

## Project layout
```
wiener-wars/
  server.js                  # the app server (reads PORT + SIGNUP_KEY from env)
  package.json               # no deps
  public/index.html          # the entire front-end (single file)
  deploy/setup.sh            # run ON the droplet: installs Node, firewall, systemd service
  deploy/deploy.sh           # run FROM your laptop: scp + remote setup in one command
  deploy/backup.sh           # timestamped data.json snapshots (installed to cron)
  deploy/wiener-wars.service # systemd unit template (SIGNUP_KEY substituted at install)
  data.json                  # created at runtime on the droplet — gitignored
```

## Run locally
```bash
cd wiener-wars
PORT=8080 SIGNUP_KEY=hotdog2026 node server.js
# open http://localhost:8080/  — Join with the invite key, pick a name + PIN
```

## Deploy to a droplet
From the repo root, with your SSH key already on an Ubuntu droplet:
```bash
DROPLET_IP=<ip> SSH_USER=root SSH_KEY=~/.ssh/your_key SIGNUP_KEY=hotdog2026 \
  bash wiener-wars/deploy/deploy.sh
```
This installs Node, opens only SSH(22) + HTTP(80), and installs a systemd service that
**auto-starts on boot and restarts on crash**. Share `http://<ip>/` plus the invite key.

### Backups
`deploy/backup.sh` snapshots `data.json` to `backups/data-YYYYMMDD-HHMMSS.json`. Install
on the droplet via cron (every 6h, keeps newest 60):
```bash
( crontab -l 2>/dev/null; echo "0 */6 * * * /opt/wiener-wars/deploy/backup.sh >> /var/log/wiener-backup.log 2>&1" ) | crontab -
```

## Environment variables
| var          | default    | meaning                                   |
|--------------|------------|-------------------------------------------|
| `PORT`       | `80`       | port the server listens on                |
| `SIGNUP_KEY` | `letmein`  | shared invite key required to create an account |

## Teardown
Destroy the droplet when the month is up (back up `data.json` first if you want to keep it).
