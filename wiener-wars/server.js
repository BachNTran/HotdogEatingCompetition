// Wiener Wars — self-contained server (Node.js built-ins only, zero npm deps).
// Serves the front-end from ./public and stores all data in ./data.json on disk.
//
// Auth model:
//   - A shared SIGNUP_KEY (the invite) lets a friend create an account.
//   - Each friend signs up with a name + their own PIN (their personal password).
//   - On signup/login the server hands back a session token; the client sends it
//     back as the "x-token" header. Tokens are persisted so a restart doesn't log
//     everyone out. PINs are stored only as salted hashes, never in the clear.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ----------------------------- config -----------------------------
const PORT = parseInt(process.env.PORT || "80", 10);
// SIGNUP_KEY is the invite friends type to create an account (ROOM_PIN kept as a fallback alias).
const SIGNUP_KEY = process.env.SIGNUP_KEY || process.env.ROOM_PIN || "letmein";
const DATA_FILE = path.join(__dirname, "data.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_PICS = 40;            // keep the photo feed (and data.json) bounded
const MAX_EVENTS = 200;         // community timeline length
const ONLINE_WINDOW_MS = 35000; // "online" = seen within the last 35s (poll runs every 10s)

// ----------------------------- state ------------------------------
// players: username -> { name, emoji, color, pinHash, pinSalt, days, total, joined, lastTs, lastSeen }
// pics:    [{ username, name, emoji, color, count, date, ts, img }]   (img = compressed dataURL)
// events:  [{ username, name, emoji, color, count, date, ts, hasImg }] (lightweight, no image)
// sessions: token -> username
let state = { players: {}, pics: [], events: [], sessions: {} };
try {
  state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  state.players = state.players || {};
  state.pics = state.pics || [];
  state.events = state.events || [];
  state.sessions = state.sessions || {};
} catch { /* first run, start empty */ }

let saving = false, pending = false;
function save() {
  // serialize writes so concurrent logs don't corrupt the file
  if (saving) { pending = true; return; }
  saving = true;
  fs.writeFile(DATA_FILE, JSON.stringify(state), (err) => {
    saving = false;
    if (err) console.error("save failed:", err);
    if (pending) { pending = false; save(); }
  });
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const slug = (n) => String(n).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

// ----------------------------- helpers -----------------------------
function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > 8e6) req.destroy(); }); // ~8MB cap
    req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}
function hashPin(pin, salt) {
  return crypto.createHash("sha256").update(salt + ":" + pin).digest("hex");
}
function newToken() { return crypto.randomBytes(18).toString("hex"); }

// username for the token on this request, or null
function authUser(req, u) {
  const token = req.headers["x-token"] || (u && u.searchParams.get("token"));
  if (!token) return null;
  const username = state.sessions[token];
  if (username && state.players[username]) return username;
  return null;
}

// Public view of state: strip secrets, add online flags + counts. Never leaks pinHash/sessions/img-in-events.
function publicState(meUser) {
  const now = Date.now();
  const players = {};
  let onlineCount = 0;
  for (const [k, p] of Object.entries(state.players)) {
    const online = now - (p.lastSeen || 0) < ONLINE_WINDOW_MS;
    if (online) onlineCount++;
    players[k] = {
      name: p.name, emoji: p.emoji, color: p.color,
      days: p.days || {}, total: p.total || 0,
      joined: p.joined, lastTs: p.lastTs || 0, online,
    };
  }
  return { players, pics: state.pics, events: state.events, onlineCount, me: meUser };
}

// ----------------------------- server -----------------------------
const server = http.createServer(async (req, res) => {
  let u;
  try { u = new URL(req.url, "http://x"); } catch { u = { pathname: req.url, searchParams: new URLSearchParams() }; }
  const urlPath = u.pathname;

  // ---------- API ----------
  if (urlPath.startsWith("/api/")) {
    try {
      // ---- sign up (needs the shared invite key) ----
      if (urlPath === "/api/signup" && req.method === "POST") {
        const b = await readBody(req);
        if (b.key !== SIGNUP_KEY) return send(res, 401, { error: "bad_key" });
        const name = String(b.name || "").trim();
        const pin = String(b.pin || "").trim();
        const username = slug(name);
        if (!username) return send(res, 400, { error: "bad_name" });
        if (!/^\d{4,8}$/.test(pin)) return send(res, 400, { error: "bad_pin" });
        const existing = state.players[username];
        if (existing && existing.pinHash) {
          // name already claimed — only let them in if the PIN matches (i.e. it's really them)
          if (hashPin(pin, existing.pinSalt) !== existing.pinHash)
            return send(res, 409, { error: "name_taken" });
        } else {
          const salt = crypto.randomBytes(8).toString("hex");
          state.players[username] = {
            name, emoji: b.emoji, color: b.color,
            pinSalt: salt, pinHash: hashPin(pin, salt),
            days: {}, total: 0, joined: Date.now(), lastSeen: Date.now(),
          };
        }
        // refresh avatar choices on (re)entry
        state.players[username].name = name;
        state.players[username].emoji = b.emoji;
        state.players[username].color = b.color;
        state.players[username].lastSeen = Date.now();
        const token = newToken();
        state.sessions[token] = username;
        save();
        const p = state.players[username];
        return send(res, 200, { token, me: { username, name, emoji: p.emoji, color: p.color } });
      }

      // ---- log in (existing account, no invite key needed) ----
      if (urlPath === "/api/login" && req.method === "POST") {
        const b = await readBody(req);
        const username = slug(b.name || "");
        const pin = String(b.pin || "").trim();
        const p = state.players[username];
        if (!p || !p.pinHash || hashPin(pin, p.pinSalt) !== p.pinHash)
          return send(res, 401, { error: "bad_login" });
        p.lastSeen = Date.now();
        const token = newToken();
        state.sessions[token] = username;
        save();
        return send(res, 200, { token, me: { username, name: p.name, emoji: p.emoji, color: p.color } });
      }

      // ---- everything below requires a valid session token ----
      const meUser = authUser(req, u);
      if (!meUser) return send(res, 401, { error: "no_session" });
      const me = state.players[meUser];
      me.lastSeen = Date.now(); // any authed call counts as presence

      if (urlPath === "/api/logout" && req.method === "POST") {
        const token = req.headers["x-token"];
        if (token) delete state.sessions[token];
        save();
        return send(res, 200, { ok: true });
      }

      if (urlPath === "/api/state" && req.method === "GET") {
        return send(res, 200, publicState(meUser));
      }

      if (urlPath === "/api/log" && req.method === "POST") {
        const b = await readBody(req);
        const n = Math.max(0, parseInt(b.count, 10) || 0);
        if (!n) return send(res, 400, { error: "bad_input" });
        const t = todayStr();
        me.days = me.days || {};
        me.days[t] = (me.days[t] || 0) + n;
        me.total = (me.total || 0) + n;
        me.lastTs = Date.now();
        const ev = { username: meUser, name: me.name, emoji: me.emoji, color: me.color,
                     count: n, date: t, ts: Date.now(), hasImg: !!b.img };
        state.events.unshift(ev);
        state.events = state.events.slice(0, MAX_EVENTS);
        if (b.img) {
          state.pics.unshift({ username: meUser, name: me.name, emoji: me.emoji, color: me.color,
                               count: n, date: t, ts: Date.now(), img: b.img });
          state.pics = state.pics.slice(0, MAX_PICS);
        }
        save();
        return send(res, 200, publicState(meUser));
      }

      return send(res, 404, { error: "not_found" });
    } catch (e) {
      return send(res, 500, { error: String(e) });
    }
  }

  // ---------- static files ----------
  let file = urlPath === "/" ? "/index.html" : urlPath;
  const safe = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
  const fp = path.join(PUBLIC_DIR, safe);
  if (!fp.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(fp);
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
    res.writeHead(200, { "Content-Type": types[ext] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`🌭 Wiener Wars running on port ${PORT} (signup key set: ${SIGNUP_KEY ? "yes" : "no"})`));
