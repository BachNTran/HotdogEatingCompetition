# Wiener Wars 🌭

A tiny hotdog-eating-contest tracker for a group of friends. One Node.js file, **zero npm
dependencies**, all state in a single `data.json` on disk. Built to run on a cheap
DigitalOcean droplet for about a month.

- 🔑 **Invite-key signup** — friends with the shared key make an account (name + their own PIN)
- 🏆 **Leaderboard** — total dogs, today's count, live online count
- 🌭 **Daily logging** with optional **proof photos**, compressed in the browser to ~15–20 KB
- 📡 **Community timeline** — who logged how many, and when (`date · HH:MM · 3m ago`)
- 👀 **Friend logs** — tap anyone to see their daily history
- 🟢 **Live presence** — 10s polling + a 35s window marks who's online now
- 🔒 PINs stored only as salted SHA-256 hashes; sessions via tokens that survive restarts

---

## UI sample

```
┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
│ ▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚ │    │ ▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚▞▚ │
│  WIENER WARS 🌭          🟢 3 online  │    │  WIENER WARS 🌭          🟢 3 online  │
│  The hotdog-eating championship       │    │                                       │
│                                       │    │  📡 Community timeline                │
│  ┌──────┐ ┌──────┐ ┌──────┐           │    │  Who's been eating, and when.         │
│  │  🔥  │ │  📈  │ │  📡  │           │    │ ┌──────────────────────────────────┐ │
│  │  42  │ │  9   │ │  3   │           │    │ │ 🐻 Big Tony logged 3 🌭 📸        │ │
│  │TOTAL │ │TODAY │ │ONLINE│           │    │ │    Jun 9 · 1:12 PM · 4m ago       │ │
│  └──────┘ └──────┘ └──────┘           │    │ │ 🦈 Mia    logged 2 🌭             │ │
│                                       │    │ │    Jun 9 · 1:03 PM · 13m ago      │ │
│  🏆 Leaderboard                       │    │ │ 🤠 You    logged 5 🌭 📸          │ │
│ ┌──────────────────────────────────┐  │    │ │    Jun 9 · 12:40 PM · 36m ago     │ │
│ │ 1👑 🐻 Big Tony      ████████ 18  │  │    │ └──────────────────────────────────┘ │
│ │ 2   🦈 Mia 🟢        ██████   14  │  │    │                                       │
│ │ 3   🤠 You  · you    █████    10  │  │    │                                       │
│ └──────────────────────────────────┘  │    │                                       │
│   Tap anyone to see their log 👀      │    │                                       │
│ ─────────────────────────────────────│    │ ─────────────────────────────────────│
│  🏆 BOARD  📡 TIMELINE  (+)  📸 FEED  🙂│    │  🏆 BOARD  📡 TIMELINE  (+)  📸 FEED  🙂│
└──────────────────────────────────────┘    └──────────────────────────────────────┘
            Leaderboard                                   Timeline
```

---

## Backend architecture

```
                     FRIENDS' PHONES / BROWSERS
       ┌───────────┐    ┌───────────┐    ┌───────────┐
       │  Tony 🐻  │    │  Mia 🦈   │    │  You 🤠   │
       │ compress  │    │           │    │ compress  │
       │ photo here│    │           │    │ photo here│
       └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
             │   GET /api/state every 10s      │
             │   POST /signup /login /log      │
             └────────────────┼────────────────┘
                              ▼  http://<droplet-ip>/  (port 80)
 ┌────────────────────────────────────────────────────────────────┐
 │               DIGITALOCEAN DROPLET (Ubuntu)                     │
 │   systemd "wiener-wars" → starts on boot, restarts on crash     │
 │  ┌──────────────────────────────────────────────────────────┐  │
 │  │  Node.js server (server.js, no deps)                      │  │
 │  │   • serves public/index.html (whole front-end)            │  │
 │  │   • API: /signup /login /log /state /logout               │  │
 │  │   • verifies invite key + session token                   │  │
 │  │   • every authed call → player.lastSeen = now             │  │
 │  │                    │  ▲                                    │  │
 │  │             save() │  │ load on startup                    │  │
 │  │                    ▼  │                                    │  │
 │  │   ┌──────────────────────────────────────────────┐        │  │
 │  │   │  data.json   ◄── THE DATABASE (one file)      │        │  │
 │  │   │   players{}  name, emoji, color, pinHash,     │        │  │
 │  │   │             days{}, total, joined, lastSeen   │        │  │
 │  │   │   pics[]     ≤40 compressed photos (base64)   │        │  │
 │  │   │   events[]   ≤200 timeline entries            │        │  │
 │  │   │   sessions{} token → username                 │        │  │
 │  │   └──────────────────────────────────────────────┘        │  │
 │  └──────────────────────────────────────────────────────────┘  │
 │   cron → backup.sh snapshots data.json every 6h (keeps 60)      │
 │   ufw firewall: only 22 (SSH) + 80 (HTTP) open                  │
 └────────────────────────────────────────────────────────────────┘

 Live/online detection (no websockets, just polling):
   browser ──every 10s──► GET /api/state  ──►  player.lastSeen = now
   on response:  online = (now − lastSeen) < 35s ?  🟢 : ⚪
```

---

## Run locally

```bash
cd wiener-wars
PORT=8080 SIGNUP_KEY=hotdog2026 node server.js
# open http://localhost:8080/ — Join with the invite key, pick a name + PIN
```

## Deploy to a droplet

From the repo root, with your SSH key already on an Ubuntu droplet:

```bash
DROPLET_IP=<ip> SSH_USER=root SSH_KEY=~/.ssh/your_key SIGNUP_KEY=hotdog2026 \
  bash wiener-wars/deploy/deploy.sh
```

Installs Node, opens only SSH(22) + HTTP(80), and installs a systemd service that
auto-starts on boot and restarts on crash. Then share `http://<ip>/` plus the invite key.

### Timestamped backups (optional)

```bash
ssh root@<ip> '( crontab -l 2>/dev/null; \
  echo "0 */6 * * * /opt/wiener-wars/deploy/backup.sh >> /var/log/wiener-backup.log 2>&1" ) | crontab -'
# snapshots → /opt/wiener-wars/backups/data-YYYYMMDD-HHMMSS.json  (keeps newest 60)
```

## Environment variables

| var          | default   | meaning                                          |
|--------------|-----------|--------------------------------------------------|
| `PORT`       | `80`      | port the server listens on                       |
| `SIGNUP_KEY` | `letmein` | shared invite key required to create an account  |

## Project layout

```
wiener-wars/
  server.js                  # the app server (reads PORT + SIGNUP_KEY from env)
  package.json               # no deps
  public/index.html          # the entire front-end (single file)
  deploy/setup.sh            # run ON the droplet: Node + firewall + systemd service
  deploy/deploy.sh           # run FROM your laptop: scp + remote setup in one command
  deploy/backup.sh           # timestamped data.json snapshots (installed to cron)
  deploy/wiener-wars.service # systemd unit template
```

> `data.json` and `backups/` are runtime-only and gitignored — no real data is in this repo.
