# Installing Kultr

The quickest ways need no installing at all:

- **The web version** at **https://web.kultr.cc/** — open it, sign in to your
  Navidrome, or choose a folder of music on your computer. In Chrome or Edge,
  **Install** in the address bar puts it in the Start menu or app launcher
  like any other app, and it keeps working offline.
- **The desktop app** for Windows and Linux — [below](#desktop-app-windows-and-linux).
  Everything is inside the download: it plays the music on your computer with
  no internet connection and no server, and connects to Navidrome too.

The rest of this guide is for running Kultr yourself, next to Navidrome. Every
path there ends with Kultr running at `http://localhost:4180`, talking to your
Navidrome, with no cross-origin problems to solve.

- [Desktop app (Windows and Linux)](#desktop-app-windows-and-linux)
- [Docker, alongside Navidrome you already run](#1-docker-alongside-an-existing-navidrome)
- [Docker, Navidrome and Kultr together](#2-docker-navidrome--kultr-together)
- [From source — Linux](#3-from-source-linux)
- [From source — Windows](#4-from-source-windows)
- [From source — macOS](#5-from-source-macos)
- [Raspberry Pi / NAS](#6-raspberry-pi-or-nas)
- [Putting it on a real domain with HTTPS](#7-a-real-domain-with-https)
- [Unraid, Synology, Proxmox](#8-unraid-synology-proxmox)
- [Updating](#updating)
- [Uninstalling](#uninstalling)

For options 1–8 you need **Navidrome already working**. If you do not have it
yet, use [option 2](#2-docker-navidrome--kultr-together), which installs both —
or skip the server entirely: the web version and the desktop app play the
music on your computer by themselves.

---

## Desktop app (Windows and Linux)

Kultr as an app of its own, with everything it needs inside: it opens with no
internet connection, reads your music folders straight from disk, and
connects to Navidrome whenever you sign in to one. Download it from the
[latest release](https://github.com/evropiani/Kultr/releases/latest).

### Windows

1. Download **`Kultr-Setup-<version>.exe`**.
2. Run it. Windows may say it *protected your PC*, because the app is not
   signed with a paid certificate: choose **More info → Run anyway**.
3. Choose where to install (your user folder by default; no administrator
   rights needed). Kultr appears in the Start menu and on the desktop.

Rather not install anything? **`Kultr-<version>-portable.exe`** runs as it is
— from a USB stick, too.

### Linux

**AppImage** (any distribution):

```bash
chmod +x Kultr-<version>-x86_64.AppImage
./Kultr-<version>-x86_64.AppImage
```

If it complains about FUSE, install it (`sudo apt install libfuse2` on
Ubuntu 22.04 and later), or run it with `--appimage-extract-and-run`.

**.deb** (Debian, Ubuntu, Mint, Pop!_OS):

```bash
sudo apt install ./kultr_<version>_amd64.deb
```

Kultr is then in your app launcher, under Audio.

### First start

On the sign-in screen, either sign in to Navidrome as usual, or choose
**Choose a music folder** under *No server? Play the music on this computer*.
Kultr reads every folder inside it, the tags in each file and the pictures
beside them, and remembers the folder: no permission prompts, and it is still
there after a restart. Add more folders, rescan or remove them in **Settings →
Music on this computer**.

A Navidrome on your own network over plain `http://` works in the desktop app
(a page on `https://` would block it).

### Updates

Kultr checks GitHub once a day and offers the new version when there is one
(**Kultr → Check for updates…** in the menu checks now; press <kbd>Alt</kbd>
if the menu is hidden). Install it over the old one; your library, folders and
settings stay.

### Where it keeps things

Your settings, library and the list of music folders live in your user
profile: `%APPDATA%\Kultr` on Windows, `~/.config/Kultr` on Linux. Your music
is never changed or copied.

---

## 1. Docker, alongside an existing Navidrome

The quickest path if Navidrome is already running.

```bash
git clone https://github.com/evropiani/Kultr.git
cd Kultr
docker compose up -d
```

Open <http://localhost:4180>, leave the server field blank, log in.

**If Navidrome is not at `host.docker.internal:4533`,** tell Kultr where it is.
Open `docker-compose.yml` and edit this line:

```yaml
      KULTR_NAVIDROME_URL: 'http://host.docker.internal:4533'
```

What to put there depends on where Navidrome runs:

| Navidrome runs… | Use |
|---|---|
| In another container, same Docker network | `http://navidrome:4533` |
| Directly on this machine | `http://host.docker.internal:4533` |
| On another machine | `http://192.168.1.10:4533` |
| Behind HTTPS somewhere | `https://music.example.com` |

Then:

```bash
docker compose up -d --force-recreate
docker compose logs -f kultr     # watch it start
```

**Already have a Navidrome compose file?** Add Kultr to it instead of running a
second stack — then they share a network and you can use the service name:

```yaml
  kultr:
    image: ghcr.io/evropiani/kultr:latest
    container_name: kultr
    restart: unless-stopped
    ports:
      - '4180:4180'
    environment:
      KULTR_NAVIDROME_URL: 'http://navidrome:4533'
    depends_on:
      - navidrome
```

```bash
docker compose up -d
```

---

## 2. Docker, Navidrome + Kultr together

Starting from nothing. One command brings up both, already wired together.

```bash
git clone https://github.com/evropiani/Kultr.git
cd Kultr

# Tell it where your music is
echo "MUSIC_DIR=/path/to/your/music" > .env

docker compose -f docker-compose.full.yml up -d
```

Then, **in this order**:

1. Open <http://localhost:4533> — this is Navidrome. Create your account. The
   first account you create becomes the administrator.
2. Wait for the first scan. Large libraries take a while; watch it with
   `docker compose -f docker-compose.full.yml logs -f navidrome`.
3. Open <http://localhost:4180> — this is Kultr. Leave the server field blank
   and log in with the account from step 1.
4. Press **Sync my library**.

Your music is mounted read-only. Navidrome's database lives in `./navidrome/data`
— back that up and you keep your play counts, favourites and playlists.

---

## 3. From source (Linux)

<details open>
<summary><strong>Debian / Ubuntu</strong></summary>

```bash
# Node.js 22 (the version in apt is usually too old)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

node --version    # must be 20 or newer

git clone https://github.com/evropiani/Kultr.git
cd Kultr
npm install
npm run build

KULTR_NAVIDROME_URL=http://localhost:4533 npm run serve
```
</details>

<details>
<summary><strong>Fedora / RHEL</strong></summary>

```bash
sudo dnf install -y nodejs npm git
node --version

git clone https://github.com/evropiani/Kultr.git
cd Kultr
npm install
npm run build

KULTR_NAVIDROME_URL=http://localhost:4533 npm run serve
```
</details>

<details>
<summary><strong>Arch</strong></summary>

```bash
sudo pacman -S --needed nodejs npm git

git clone https://github.com/evropiani/Kultr.git
cd Kultr
npm install
npm run build

KULTR_NAVIDROME_URL=http://localhost:4533 npm run serve
```
</details>

Open <http://localhost:4180>.

### Keep it running in the background

`npm run serve` stops when you close the terminal. To run it as a service:

```bash
# Put the app somewhere sensible
sudo mkdir -p /opt/kultr
sudo cp -r . /opt/kultr
sudo chown -R "$USER":"$USER" /opt/kultr

sudo tee /etc/systemd/system/kultr.service > /dev/null <<EOF
[Unit]
Description=Kultr
Documentation=https://github.com/evropiani/Kultr
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/kultr
Environment=PORT=4180
Environment=HOST=0.0.0.0
Environment=KULTR_NAVIDROME_URL=http://localhost:4533
ExecStart=$(command -v node) server/serve.js
Restart=on-failure
RestartSec=5

# Nothing here needs write access or elevated privileges.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=/opt/kultr

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now kultr
systemctl status kultr
```

Logs: `journalctl -u kultr -f`

---

## 4. From source (Windows)

Install [Node.js LTS](https://nodejs.org/) and [Git](https://git-scm.com/download/win),
then in **PowerShell**:

```powershell
node --version    # must be v20 or newer

git clone https://github.com/evropiani/Kultr.git
cd Kultr
npm install
npm run build

$env:KULTR_NAVIDROME_URL = "http://localhost:4533"
npm run serve
```

Open <http://localhost:4180>.

### Start it automatically at login

```powershell
# Creates a scheduled task that starts Kultr when you log in
$node = (Get-Command node).Source
$dir  = (Get-Location).Path

$action  = New-ScheduledTaskAction -Execute $node -Argument "server\serve.js" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "Kultr" -Action $action -Trigger $trigger -Settings $settings
```

Set the environment variable permanently so the task picks it up:

```powershell
[Environment]::SetEnvironmentVariable("KULTR_NAVIDROME_URL", "http://localhost:4533", "User")
```

To remove it later: `Unregister-ScheduledTask -TaskName "Kultr" -Confirm:$false`

---

## 5. From source (macOS)

```bash
# Homebrew, if you do not have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node git
node --version

git clone https://github.com/evropiani/Kultr.git
cd Kultr
npm install
npm run build

KULTR_NAVIDROME_URL=http://localhost:4533 npm run serve
```

Open <http://localhost:4180>.

### Keep it running

```bash
cat > ~/Library/LaunchAgents/com.kultr.server.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.kultr.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(command -v node)</string>
    <string>$(pwd)/server/serve.js</string>
  </array>
  <key>WorkingDirectory</key><string>$(pwd)</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>KULTR_NAVIDROME_URL</key><string>http://localhost:4533</string>
    <key>PORT</key><string>4180</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.kultr.server.plist
```

Stop it with `launchctl unload ~/Library/LaunchAgents/com.kultr.server.plist`.

---

## 6. Raspberry Pi or NAS

Kultr's runtime is a single Node process serving static files, so it is
comfortable on a Pi 4 or any NAS that runs Docker.

**Building on the Pi itself** works but is slow (a few minutes). Either be
patient, or use the published multi-arch image:

```bash
docker run -d \
  --name kultr \
  --restart unless-stopped \
  -p 4180:4180 \
  -e KULTR_NAVIDROME_URL=http://192.168.1.10:4533 \
  ghcr.io/evropiani/kultr:latest
```

A note on the device doing the *listening*: InjeKt analysis runs in the
browser on whatever device you are using, not on the server. A Pi serving the
app is fine; analysing a large library from a low-powered browser is the slow
part. Analysis is cached per browser, so it is a one-time cost each place you
use Kultr.

---

## 7. A real domain with HTTPS

Worth doing: HTTPS is required for the "install to home screen" prompt and for
offline mode to work outside `localhost`.

Both configs put Kultr and Navidrome on one hostname, which is also what keeps
the browser happy about cross-origin requests.

### Caddy (easiest — automatic certificates)

```bash
sudo apt install -y caddy     # or: brew install caddy

sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/music.example.com/YOUR.DOMAIN.COM/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

That is the whole job — Caddy gets and renews the certificate itself.

### nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/kultr
sudo sed -i 's/music.example.com/YOUR.DOMAIN.COM/' /etc/nginx/sites-available/kultr
sudo ln -s /etc/nginx/sites-available/kultr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Certificate
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR.DOMAIN.COM
```

The supplied config expects the built files at `/srv/kultr/dist`:

```bash
sudo mkdir -p /srv/kultr
sudo cp -r dist /srv/kultr/
```

There is a commented block in the file if you would rather proxy the Node
server than serve the files directly.

---

## 8. Unraid, Synology, Proxmox

**Unraid** — *Docker → Add Container*:

| Field | Value |
|---|---|
| Repository | `ghcr.io/evropiani/kultr:latest` |
| Port | `4180` → `4180` |
| Variable | `KULTR_NAVIDROME_URL` = `http://YOUR-UNRAID-IP:4533` |

**Synology** — *Container Manager → Registry*, search `ghcr.io/evropiani/kultr`,
download `latest`, then when creating the container set port `4180:4180` and
add the environment variable `KULTR_NAVIDROME_URL`.

**Proxmox** — use a Debian LXC and follow
[the Linux instructions](#3-from-source-linux). Give it 1 vCPU and 512 MB; the
Node server is tiny.

---

## Publishing your own copy on GitHub Pages

Kultr is static files, so a fork can host its own copy for free. There is a
workflow for it at `.github/workflows/deploy.yml` — it builds on every push to
`main` and publishes the result.

**One setting has to be changed first**, and it is the thing people get wrong:

1. Go to **Settings → Pages** in your fork.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

If Source is left on *Deploy from a branch*, GitHub serves the repository
contents verbatim — and the repository contains TypeScript source, not a built
app. The root `index.html` asks the browser for `/src/main.tsx`, which no
browser can run, so you get a pulsing “KULTR” splash and nothing else. The
build step is what turns the source into something a browser understands, and
only the *GitHub Actions* source runs it.

Worse, it does not fail consistently. Leaving Source on a branch means
**GitHub runs its own Jekyll build on every push as well**, alongside the
workflow — you will see a run called *pages build and deployment* next to
*Deploy to GitHub Pages*. Both publish to the same site, so whichever finishes
last wins. The site then works after one push and breaks after the next, for no
reason visible in the diff. Switching Source to *GitHub Actions* stops the
Jekyll build running at all, which is what removes the race.

The workflow checks this on every run. It cannot change the setting itself —
the token a workflow gets may create a Pages site but not re-point one — so
it warns, then waits for GitHub's Jekyll build to finish before publishing, so
its own deploy always lands last. That makes the site correct, but only the
setting makes the race go away.

After that, pushing to `main` publishes to
`https://<your-username>.github.io/<repo>/`. The workflow works out the
sub-path on its own and copies `index.html` to `404.html` so deep links work.

### Custom domains: rebuild after changing one

The build bakes in the path it will be served from — `/<repo>/` on
`github.io`, `/` on a custom domain — because every link to its own files
depends on it. The workflow asks GitHub for that path each time it runs, so
it always gets it right *for the address at that moment*.

What it cannot do is notice the address changing afterwards. Adding, changing
or removing a custom domain under **Settings → Pages** does not start a build,
so the site keeps serving files built for the old address: the page asks for
`/<repo>/assets/…` on a domain where they live at `/assets/…`, gets the 404
page back instead, and the splash never goes away.

The fix is one click, straight after changing the domain: **Actions → Deploy to
GitHub Pages → Run workflow**. The page itself also says so — if its files
are missing it names the path it was built for and the one it is being served
from, instead of leaving the splash pulsing.

Two side effects of moving address, both because a browser keys everything to
the address it came from:

- **Local data does not follow.** The library mirror, settings and saved
  servers belong to the old address. Sign in and sync again on the new one;
  **Settings → Backup and reset → Export** from the old address first carries
  your settings over, if it still opens.
- **CORS rules that name the old origin stop matching.** Anyone who allowed the
  old address on their Navidrome needs to allow the new one — see
  [CORS.md](CORS.md).

A note on what you are publishing: the site is only the client. It contains no
music, no credentials and no server. Visitors type in their own Navidrome
address, and their browser talks to their server directly — nothing passes
through GitHub. Navidrome allows that out of the box, but their server does
need HTTPS, since your Pages site is HTTPS; [CORS.md](CORS.md) covers that and
the other things that can get in the way.

---

## Updating

**Docker:**

```bash
cd Kultr
git pull
docker compose up -d --build
```

Or with the published image:

```bash
docker compose pull && docker compose up -d
```

**From source:**

```bash
cd Kultr
git pull
npm install
npm run build
sudo systemctl restart kultr    # if you set up the service
```

**Desktop app:** download the new version from the
[latest release](https://github.com/evropiani/Kultr/releases/latest) and
install it over the old one (Kultr offers this itself once a day).

After updating, Kultr may offer to reload for a new version. Your library
mirror, settings and offline tracks survive updates.

---

## Uninstalling

**Docker:**

```bash
docker compose down            # add -v to delete Navidrome's database too
```

**From source:**

```bash
sudo systemctl disable --now kultr
sudo rm /etc/systemd/system/kultr.service
sudo rm -rf /opt/kultr
```

**Desktop app:** on Windows, *Settings → Apps → Kultr → Uninstall* (the
portable version is just the one file). On Linux, delete the AppImage, or
`sudo apt remove kultr`. Your settings and library stay in `%APPDATA%\Kultr`
or `~/.config/Kultr` until you delete that folder too.

Kultr also stores data **in your browser**. To clear it, open Kultr and use
**Settings → Reset Kultr**, which removes the library mirror, offline tracks,
analysis and saved servers.

---

Stuck? [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) covers the common failures,
and [docs/CORS.md](CORS.md) covers connection errors specifically.
