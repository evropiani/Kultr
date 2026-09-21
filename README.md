<div align="center">

<img src="public/icon-192.png" width="104" alt="Kultr" />

# Kultr

**A liquid-glass web client for [Navidrome](https://www.navidrome.org/).**

Mirrors your whole library locally, crossfades properly, and mixes tracks like a DJ.

[Try the live demo](https://evropiani.github.io/Kultr/) · [Install](#install) · [AutoMix](#automix) · [Troubleshooting](docs/TROUBLESHOOTING.md)

</div>

---

> **The demo is the real app.** It runs entirely in your browser and connects to
> *your* Navidrome server. It stores nothing, ships no music, and has no backend
> — if you would rather not trust a page on the internet with your password,
> [run it yourself](#install); it takes about a minute.

## What it does

|  | |
|---|---|
| **Full library sync** | One button mirrors every artist, album, track, playlist and genre into your browser. Browsing, sorting and searching are then instant and work with the server switched off. A second button checks for changes and pulls in only what moved. |
| **Crossfade** | Real dual-deck overlap with a configurable length (0–20s) and four fade shapes. Not a volume trick on one player — two decks actually play at once. |
| **AutoMix** | Beat-matched, key-aware transitions. Kultr works out each track's tempo, musical key, energy and where its intro and outro are, then blends like a DJ: starts at the outro, time-stretches the incoming track onto the beat, swaps the basslines over, skips long intros. [How it works →](docs/AUTOMIX.md) |
| **Gapless** | Turn crossfade off and the next track starts the instant the current one ends. |
| **Offline** | Save individual tracks into the browser and play them with no server at all. Installable as a PWA on desktop, Android and iOS. |
| **Equaliser** | Ten bands, nine presets, pre-amp. |
| **Volume levelling** | ReplayGain, per track or per album, with clipping protection. |
| **Lyrics** | Synced line-by-line when your files have them, plain text otherwise. |
| **Everything else** | Queue with drag-to-reorder, favourites, ratings, playlists, scrobbling, sleep timer, internet radio, listening stats, visualizer, keyboard shortcuts, multiple servers, light and dark themes. |

The interface takes its colour from whatever is playing — the glass, the
highlights and the backdrop all retint from the album art.

---

## Install

Three ways, fastest first. All of them end up at **http://localhost:4180**.

> **Which one should I pick?**
> Already run Navidrome in Docker → [A](#a-docker-with-navidrome-you-already-run).
> Starting from nothing → [B](#b-docker-navidrome--kultr-together).
> No Docker, or you want to hack on it → [C](#c-from-source).

### A. Docker, with Navidrome you already run

```bash
git clone https://github.com/evropiani/Kultr.git
cd Kultr
docker compose up -d
```

Then open **http://localhost:4180**.

If your Navidrome is not reachable at `http://host.docker.internal:4533`, point
Kultr at it and restart:

```bash
# Edit the address, then restart
sed -i 's|http://host.docker.internal:4533|http://192.168.1.10:4533|' docker-compose.yml
docker compose up -d --force-recreate
```

On the login screen, **leave the server field blank** and enter your Navidrome
username and password. (Blank works because Kultr is proxying Navidrome for you
— see [Why the server field can be blank](#why-the-server-field-can-be-blank).)

### B. Docker, Navidrome + Kultr together

Starting from nothing. This brings up both, wired together.

```bash
git clone https://github.com/evropiani/Kultr.git
cd Kultr

# Point this at your music folder
echo "MUSIC_DIR=/path/to/your/music" > .env

docker compose -f docker-compose.full.yml up -d
```

Then:

1. Open **http://localhost:4533** and create your Navidrome account. *(Do this
   first — the first account you create becomes the admin.)*
2. Wait for the first scan to finish.
3. Open **http://localhost:4180**, leave the server field blank, and log in with
   the account you just made.
4. Press **Sync my library**.

<details>
<summary>Windows (PowerShell) version of the same thing</summary>

```powershell
git clone https://github.com/evropiani/Kultr.git
cd Kultr

# Use forward slashes, even on Windows
"MUSIC_DIR=C:/Users/you/Music" | Out-File -Encoding utf8 .env

docker compose -f docker-compose.full.yml up -d
```
</details>

### C. From source

You need [Node.js 20 or newer](https://nodejs.org/). Check with `node --version`.

```bash
git clone https://github.com/evropiani/Kultr.git
cd Kultr
npm install
npm run build

# Serve it, proxying your Navidrome so there is nothing else to configure
KULTR_NAVIDROME_URL=http://localhost:4533 npm run serve
```

Open **http://localhost:4180** and leave the server field blank.

<details>
<summary>Windows (PowerShell)</summary>

```powershell
git clone https://github.com/evropiani/Kultr.git
cd Kultr
npm install
npm run build

$env:KULTR_NAVIDROME_URL = "http://localhost:4533"
npm run serve
```
</details>

<details>
<summary>Keep it running after you close the terminal (Linux, systemd)</summary>

```bash
sudo tee /etc/systemd/system/kultr.service > /dev/null <<'EOF'
[Unit]
Description=Kultr
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/opt/kultr
Environment=PORT=4180
Environment=KULTR_NAVIDROME_URL=http://localhost:4533
ExecStart=/usr/bin/node server/serve.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Adjust YOUR_USER and the path above, then:
sudo systemctl daemon-reload
sudo systemctl enable --now kultr
sudo systemctl status kultr
```
</details>

More detail, including macOS, a Raspberry Pi and putting it on a real domain
with HTTPS: **[docs/INSTALL.md](docs/INSTALL.md)**.

---

## First run

1. **Log in.** Leave the server address blank if Kultr is proxying Navidrome
   for you (options A, B and C above). Otherwise type the full address, e.g.
   `https://music.example.com`.
2. **Press “Sync my library”** on the Sync page. One request per album, so a
   few thousand albums take a minute or two. It only happens once.
3. **Press “Analyse missing”** under AutoMix analysis if you want every
   transition beat-matched from the very first play. This streams each track
   once at a low bitrate to measure it — it is optional, and Kultr analyses
   tracks on the fly anyway, just-in-time before each transition.

After that, **Check for updates** re-reads the album index and only pulls what
actually changed. Kultr also does this automatically on startup and hourly,
which you can change on the Sync page.

---

## Why the server field can be blank

This is the one thing that trips people up, so it is worth 30 seconds.

A browser will not let a page served from one address make API calls to a
different address unless that other server explicitly allows it. That rule is
called CORS, and Navidrome does not opt in to it by default.

Every install option above dodges the problem the same way: **Kultr's own
server forwards `/rest` and `/share` to Navidrome**, so the browser only ever
sees one address. Leave the field blank and the app talks to the page's own
origin.

It is not only about convenience. Same-origin audio is also what lets the
browser hand the audio data to Web Audio, which powers the **equaliser**, the
**visualizer** and AutoMix's **bass swap**. Without it Kultr still plays and
still crossfades, but those three go away and you will see a note saying so.

Using the hosted demo, or typing a server address by hand, means the browser
*does* make a cross-origin request — which works only if something in front of
your Navidrome adds the right headers. Putting both behind one reverse proxy
is the clean fix: see [docs/CORS.md](docs/CORS.md), plus ready-made
[Caddy](deploy/Caddyfile) and [nginx](deploy/nginx.conf) configs.

---

## AutoMix

Apple Music's AutoMix, rebuilt from scratch in the browser.

Kultr decodes each track once and measures it: tempo and beat grid, musical key
(Camelot notation, for harmonic mixing), loudness and brightness, and the points
where the intro ends and the outro begins. When one track is about to hand over
to the next, it plans a transition from those numbers:

- **Beat-matching** — time-stretches the incoming track onto the outgoing
  track's tempo, then eases it back to its own over the next eight bars. Pitch
  is preserved; a limit you control (default 8%) stops it from stretching
  anything too far.
- **Bar alignment** — the blend starts on a downbeat of the outgoing track and
  the incoming track enters on one of its own, so the grids actually line up.
- **Bass swap** — the outgoing bass rolls off before the incoming bass comes up,
  so two kick drums never fight.
- **Harmonic mixing** — when the two keys clash, it filter-sweeps out of the old
  track instead of blending into a muddy chord.
- **Intro skipping** — brings the next track in at its first real downbeat
  rather than 20 seconds of ambient pad.
- **Auto-continuation** — when the queue empties, it keeps going with tracks
  chosen by tempo, key and energy proximity, so the set keeps flowing.

Every part degrades gracefully. No analysis yet, tempos too far apart, or Web
Audio unavailable, and it quietly becomes a good ordinary crossfade. Open the
**AutoMix** tab in the full-screen player to see exactly what it decided and why.

Details and tuning: **[docs/AUTOMIX.md](docs/AUTOMIX.md)**.

---

## Configuration

Everything that matters is in Settings. These are for deployment.

| Variable | Used by | Default | What it does |
|---|---|---|---|
| `KULTR_NAVIDROME_URL` | `npm run serve`, Docker | *(unset)* | Reverse-proxy `/rest` and `/share` to this Navidrome. Setting it is what makes the blank server field work. |
| `PORT` | `npm run serve`, Docker | `4180` | Port to listen on. |
| `HOST` | `npm run serve`, Docker | `0.0.0.0` | Address to bind. |
| `KULTR_BASE` | build | `/` | Public path, if serving from a sub-directory. |
| `KULTR_PROXY_TARGET` | `npm run dev` | *(unset)* | Navidrome to proxy during development. |
| `VITE_NAVIDROME_URL` | build | *(unset)* | Pre-fills the server field. |
| `VITE_LOCK_SERVER` | build | *(unset)* | `1` hides the server field entirely. |
| `MUSIC_DIR` | `docker-compose.full.yml` | `./music` | Your music folder on the host. |

Copy [`.env.example`](.env.example) to `.env` to set them.

---

## Keyboard shortcuts

| | | | |
|---|---|---|---|
| <kbd>Space</kbd> | Play / pause | <kbd>M</kbd> | Mute |
| <kbd>←</kbd> <kbd>→</kbd> | Seek 5s | <kbd>S</kbd> | Shuffle |
| <kbd>Shift</kbd>+<kbd>←</kbd> <kbd>→</kbd> | Previous / next | <kbd>R</kbd> | Repeat |
| <kbd>↑</kbd> <kbd>↓</kbd> | Volume | <kbd>L</kbd> | Favourite |
| <kbd>/</kbd> | Search | <kbd>Q</kbd> | Queue |
| <kbd>?</kbd> | All shortcuts | <kbd>F</kbd> | Full player |

---

## Your data

- Your password is kept in this browser, because Subsonic authentication needs
  it to hash a token on every request. Turn off **Stay signed in** and it is
  dropped when you close the tab. It is never sent anywhere except your own
  server.
- The library mirror, offline tracks, AutoMix analysis and listening history
  live in IndexedDB in your browser. **Settings → Reset Kultr** erases the lot.
- Kultr talks to exactly one host: your Navidrome. No analytics, no telemetry,
  no third-party requests, no fonts loaded from anyone's CDN.

---

## Phones

Kultr is a PWA, so you can install it today: **Share → Add to Home Screen** on
iOS, or **Install app** from the Chrome menu on Android. It runs full-screen,
keeps working offline for anything you have downloaded, and shows up on the
lock screen.

Native iOS and Android apps are planned and the codebase is laid out for it —
the player, the sync engine and all of the AutoMix DSP are plain TypeScript
with no DOM dependencies, so they port as-is.
See **[docs/MOBILE.md](docs/MOBILE.md)**.

---

## Development

```bash
npm install

# Point the dev server at your Navidrome so there is no CORS to fight
echo "KULTR_PROXY_TARGET=http://localhost:4533" > .env
npm run dev

npm run typecheck   # TypeScript, strict
npm test            # DSP and AutoMix planner suites
npm run check       # both
```

Architecture, where everything lives, and how to add a feature:
**[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

---

## Documentation

| | |
|---|---|
| [INSTALL.md](docs/INSTALL.md) | Every install path, per OS, with HTTPS |
| [CORS.md](docs/CORS.md) | Why connections fail and how to fix them properly |
| [AUTOMIX.md](docs/AUTOMIX.md) | The DSP and the mixing rules |
| [SYNC.md](docs/SYNC.md) | What sync does, and what it costs your server |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Architecture and contributing |
| [MOBILE.md](docs/MOBILE.md) | PWA today, native apps next |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | When something is broken |
| [FAQ.md](docs/FAQ.md) | Short answers |

---

## Compatibility

Kultr speaks the Subsonic API (v1.16.1) with the OpenSubsonic extensions
Navidrome provides, so it will largely work against other Subsonic-compatible
servers — but Navidrome is what it is built and tested against.

Needs a current browser: Chrome/Edge 111+, Firefox 113+, Safari 16.4+.
Older browsers fall back to a simpler player rather than breaking.

## License

[Apache 2.0](LICENSE).
