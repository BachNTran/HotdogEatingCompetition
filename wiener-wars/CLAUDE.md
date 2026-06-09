# CLAUDE.md — Wiener Wars deployment brief

You are helping deploy **Wiener Wars**, a hotdog-eating-contest tracker with a friends
leaderboard, onto the user's own DigitalOcean droplet. Read this whole file first.

## What this is
A small, self-contained web app:
- A **Node.js server** (`server.js`, zero npm dependencies — built-ins only) that:
  - serves the front-end from `public/`,
  - exposes a tiny JSON API (`/api/check-pin`, `/api/state`, `/api/join`, `/api/log`),
  - stores everything in **`data.json`** on the droplet's own disk.
- A **front-end** (`public/index.html`) that talks to that API. PIN gate, leaderboard,
  daily hotdog logging, optional proof photos (compressed client-side), live updates
  via polling every 10s.
- The **PIN is enforced server-side**: write/read endpoints reject a wrong PIN.

There is **no Firebase and no third-party service**. Data lives only on the droplet.

## Context / decisions already made (do not relitigate)
- The user only needs this running for ~1 month, on a DigitalOcean droplet.
- A droplet's public IPv4 is static for the life of the droplet, so the IP they hand
  friends won't change unless the droplet is destroyed.
- They want minimum fuss. Keep explanations short. Don't propose Firebase/Netlify/etc.

## Project layout
```
wiener-wars/
  server.js                  # the app server (port 80, reads ROOM_PIN from env)
  package.json               # no deps
  public/index.html          # front-end
  deploy/wiener-wars.service # systemd unit (template; PIN substituted at install)
  deploy/setup.sh            # run ON the droplet to install + start everything
  data.json                  # created at runtime; DO NOT ship a copy with real data
```

## Your deployment task
Deploy to the droplet over SSH and leave the service running. Steps:

1. **Get details from the user** if not already provided:
   - Droplet public IP (`<DROPLET_IP>`).
   - SSH login user (DigitalOcean default is `root`).
   - The PIN they want friends to type (e.g. `1234`).
   - Confirm they added their SSH key to the droplet at creation (key auth preferred).
     If they only have password auth, ask before proceeding.

2. **Copy the project to the droplet** (run from this folder on the user's machine):
   ```bash
   ssh root@<DROPLET_IP> 'mkdir -p /opt/wiener-wars'
   scp -r ./server.js ./package.json ./public ./deploy root@<DROPLET_IP>:/opt/wiener-wars/
   ```

3. **Install and start it** (on the droplet):
   ```bash
   ssh root@<DROPLET_IP> 'cd /opt/wiener-wars && ROOM_PIN=<THE_PIN> bash deploy/setup.sh'
   ```
   `setup.sh` installs Node, opens the firewall (SSH + port 80), and installs a
   systemd service that runs on boot and restarts on crash.

4. **Verify**:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://<DROPLET_IP>/        # expect 200
   curl -s -X POST http://<DROPLET_IP>/api/check-pin \
        -H 'Content-Type: application/json' -d '{"pin":"<THE_PIN>"}'    # expect {"ok":true}
   ```
   Then tell the user to open `http://<DROPLET_IP>/` in a browser, enter the PIN,
   log a hotdog, and refresh — it should persist (data is on the droplet's disk).

5. Give the user the share URL: **`http://<DROPLET_IP>/`** plus the PIN.

## Guardrails (important)
- **Never type the user's passwords or paste credentials into anything.** Use their
  existing SSH key. If a step needs a secret, ask the user to provide/run it.
- Before any **destructive** command (deleting files, `ufw` resets, `rm`, reformatting),
  state exactly what it does and get a yes.
- Don't open ports beyond SSH (22) and HTTP (80).
- Don't commit or upload a `data.json` that contains real entries.

## Good-to-know / troubleshooting
- **Logs:** `ssh root@<DROPLET_IP> 'journalctl -u wiener-wars -n 50 --no-pager'`
- **Restart:** `systemctl restart wiener-wars`  ·  **Status:** `systemctl status wiener-wars`
- **Change the PIN later:** edit `/etc/systemd/system/wiener-wars.service`
  (`Environment=ROOM_PIN=...`), then `systemctl daemon-reload && systemctl restart wiener-wars`.
- **Port 80 won't bind:** confirm the unit has `AmbientCapabilities=CAP_NET_BIND_SERVICE`.
  As a fallback, set `Environment=PORT=3000` and use `http://<DROPLET_IP>:3000/`
  (also `ufw allow 3000/tcp`).
- **HTTPS (optional):** if they want `https://` and have a domain, point the domain at
  the droplet IP and add Caddy or nginx + certbot in front. Not required for a casual run.
- **Backups:** the only state is `data.json`. To back up:
  `scp root@<DROPLET_IP>:/opt/wiener-wars/data.json ./backup-data.json`.
- **Teardown after the month:** destroy the droplet in the DigitalOcean dashboard so it
  stops accruing cost once the trial credit ends. (Back up `data.json` first if wanted.)
