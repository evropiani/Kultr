# Troubleshooting

Grouped by what you are seeing. If it is a connection error,
[CORS.md](CORS.md) goes deeper.

---

## The page never loads

### A pulsing “KULTR” and nothing else

The app is not running. Wait a second and the splash replaces itself with what
went wrong; the usual answer is that the host is serving Kultr's *source*
rather than a build of it, and the page is asking the browser for
`/src/main.tsx`, which no browser can execute.

On GitHub Pages this is one setting: **Settings → Pages → Build and deployment
→ Source → GitHub Actions**. See
[INSTALL.md](INSTALL.md#publishing-your-own-copy-on-github-pages).

### It worked yesterday and is broken today, with no relevant change

Same cause, one step removed. A repository whose Pages **Source** is still a
branch gets *two* publishers on every push: the deploy workflow, and GitHub's
own Jekyll build of the repository (a run called *pages build and deployment*).
They publish to the same site, so whichever finishes last wins — and which one
that is varies by a few seconds each time. The site then alternates between
working and showing the splash.

Switching Source to **GitHub Actions** stops the Jekyll build running at all.

### It broke right after I added a custom domain

The build was made for the old address. A build bakes in the path it is
served from — `/<repo>/` on `github.io`, `/` on a custom domain — and changing
the domain under **Settings → Pages** does not start a new build. So the page
asks for its files at `/<repo>/assets/…`, where nothing exists any more, and
gets the 404 page back.

Run **Actions → Deploy to GitHub Pages → Run workflow** once. It asks GitHub
where the site now lives and builds for that. The page also tells you when this
is the problem: it names the path it was built for next to the address it is
being served from.

After moving, sign in and sync again — the local library belongs to the old
address — and update any CORS rule on your server that named the old origin.

---

## I cannot log in

### "Could not reach the server"

The browser never got a reply. In order of likelihood:

1. **Mixed content.** An HTTPS page — the hosted app, for one — cannot call
   an `http://` address. Either both over HTTPS, or both over plain HTTP.
2. **Wrong address.** Include the scheme and the port:
   `http://192.168.1.10:4533`, not `192.168.1.10`.
3. **Something in front of the server.** A reverse proxy that adds its own
   CORS header (Navidrome already sends one, and two are rejected), or a login
   gateway that answers `/rest` with a login page. See [CORS.md](CORS.md).
4. **`localhost` from another device.** On your phone, `localhost` is the
   phone. Use the server's LAN address.
5. **A server that does not allow cross-origin requests.** Navidrome does;
   some other Subsonic servers do not. Put Kultr and the server on one
   address — see [CORS.md](CORS.md).

Test the server itself from a terminal:

```bash
curl -s "http://YOUR-SERVER:4533/rest/ping?u=x&p=x&v=1.16.1&c=Kultr&f=json"
```

JSON back means Navidrome is fine and the problem is in the browser's view of
it.

### "Wrong username or password"

You reached the server, so this really is credentials. Note that the Navidrome
password is the one you set when you created the account, not a token. Try
logging in to Navidrome's own interface to confirm.

### "Token authentication is disabled on this server"

Turn on **Plain password** under Advanced options on the login screen. Use
HTTPS if you do — it sends the password hex-encoded, which is not encryption.

### It logs in, then immediately asks again

Third-party or all cookies blocked, or private browsing with storage disabled.
Kultr needs `localStorage`/`sessionStorage` to keep a session. Allow storage
for the site.

---

## Nothing is in my library

### The library is empty after logging in

Press **Sync my library** on the Sync page. Kultr reads from its local mirror,
which starts out empty.

### A new album is not showing up

Navidrome has to find the file before Kultr can see it. Check the Sync page: it
shows Navidrome's own track count next to Kultr's.

- Navidrome's count is also low → Navidrome has not scanned yet. Press **Start
  a scan**, wait, then **Check for updates**.
- Navidrome's count is higher than Kultr's → press **Check for updates**.

### Some albums are missing after a sync

The sync summary reports how many albums could not be read. Usually those are
albums Navidrome itself is unhappy about — check its log. A full sync retries
everything.

### "Start a scan" does nothing

That endpoint needs an admin account. Trigger the scan from Navidrome's own
interface instead.

---

## Playback problems

### Nothing plays, no error

Browsers block audio until you interact with the page. Press play once.

### "This file format is not supported by your browser"

Most likely FLAC in Safari, or something exotic. Set **Settings → Audio →
Transcode format** to `mp3` or `opus` and Navidrome will convert on the fly.

### Playback stutters or stops

- Set a **Streaming quality** lower than Original on a slow connection.
- If Navidrome is transcoding, check its CPU — a Pi transcoding FLAC to MP3 for
  several clients will struggle.
- Save tracks for offline if your connection is unreliable.

### The equaliser does nothing

Kultr is in compatibility mode, which does not use Web Audio. **Settings →
Audio → Audio engine** says which mode is active: set it to Auto and reload.
If it drops back to compatibility on its own, the browser could not run Web
Audio or Kultr heard the audio come through it silent. Playback and crossfade
are unaffected either way; the EQ and InjeKt's bass swap are.

### Volume jumps between tracks

Turn on **Settings → Audio → Volume levelling** (ReplayGain). It needs
ReplayGain tags in your files; Navidrome exposes them when they exist. Without
tags there is nothing to level with — tag your library with a tool like
`rsgain`.

---

## Crossfade and InjeKt

### Crossfade is not happening

- Check it is on, and the length is not 0.
- It cannot overlap more than a third of a track, so very short tracks get a
  shorter fade.
- Skipping manually uses a short fade (or none), not the full crossfade —
  that is **Also fade when you skip**.

### InjeKt is not beat-matching

Open the **InjeKt** tab in the full-screen player; it says exactly why.

- **"Not analysed yet"** → it is analysed within seconds of the track
  starting (the first time a track is heard); or press **Analyse now**. For
  the whole library: **Sync → Analyse missing**.
- **"tempos too far apart to match"** → correct behaviour. Raise **Maximum
  tempo shift** if you want it to try harder, at the cost of audible stretching.
- Low confidence → the track has no steady pulse (classical, ambient, live
  recordings). Kultr will not beat-match something it cannot measure.

### Analysis is slow

It streams and decodes each track once. Expect roughly a second or two per
track. It runs two at a time in a Web Worker so it does not block the UI — leave
it running and keep listening.

### Transitions sound stretched or wobbly

Lower **Maximum tempo shift** to 4–6%. Under about 8% the browser's
time-stretching is clean; above that you hear it.

---

## Music on this computer

### "Kultr found no music it can play"

Kultr reads MP3, FLAC, AAC/M4A (not Apple's DRM-protected `.m4p`), Ogg Vorbis,
Opus, WAV and AIFF, in the folder you chose and every folder inside it. Check
that you picked the folder that *holds* the music rather than one beside it,
then press **Rescan** under **Settings → Music on this computer**. Hidden
folders (names starting with a dot) are skipped.

### A banner says Kultr needs permission to read a folder again

Chrome and Edge forget a folder's permission when the browser restarts, and
only let a page ask again after you click something. Press **Allow** on the
banner (or beside the folder in Settings) and confirm in the browser's prompt.
To stop the prompts, install Kultr as an app from the address bar, where
Chrome can remember the choice, or use the desktop app, which never asks.

### An album is split in two, or two albums are merged

Albums are grouped like most players do it: by album name and **album
artist** when the files name one, otherwise by album name within one folder.
So:

- An album split by featured artists needs the same *album artist* tag on
  every track (a compilation: *Various Artists*).
- Two different albums with the same name merge when they share an album
  artist; give them distinct album names, or remove the album artist from one
  and keep them in separate folders.

Fix the tags in a tagger such as Mp3tag, MusicBrainz Picard or Kid3, then
**Rescan**: only the files you changed are read again.

### Covers are missing

Kultr uses an image beside the files named `cover`, `folder`, `front` or
`album` (`.jpg`, `.jpeg`, `.png` or `.webp`), or the only picture in that
folder if there is just one; failing that, the picture inside the files. Add
one of those and **Rescan**.

### Imported music disappeared (Firefox, Safari)

Music you **import** is copied into the browser's own storage, and a browser
can clear that when the disk runs low or when you clear site data. Install
Kultr as an app so its storage is marked persistent, keep the originals, and
re-import if it happens. Chrome, Edge and the desktop app read the folder
where it is and have nothing to lose.

### Favourites and play counts are not on my phone

They are kept on this computer, because music files cannot hold them and
there is no server to send them to. For favourites everywhere, put the music
in Navidrome.

---

## The desktop app

### Windows says it protected your PC

The app is not signed with a paid certificate, so SmartScreen does not know
it yet. Choose **More info → Run anyway**. Downloads come only from the
[releases page](https://github.com/evropiani/Kultr/releases/latest), built by
GitHub Actions from the source in this repository.

### The AppImage does not start

Make it executable (`chmod +x Kultr-*.AppImage`). If it complains about FUSE,
install `libfuse2` (`sudo apt install libfuse2` on Ubuntu 22.04 and later), or
run it with `--appimage-extract-and-run`. The `.deb` needs neither.

### "Kultr could not start: No free port for Kultr"

The app serves itself on `127.0.0.1`, ports 41814 to 41817, and all four were
taken — usually by copies of Kultr that did not close. Quit them (or restart),
then open it again.

### It cannot connect to my server

The desktop app talks to Navidrome the same way the browser does, from
`http://127.0.0.1:41814`, so an `http://` server works there even though the
HTTPS web version cannot reach it. If it still fails, see
[I cannot log in](#i-cannot-log-in): a proxy or login gateway in front of
Navidrome is the usual cause.

### Where does it keep its data?

In the app's profile folder: `%APPDATA%\Kultr` on Windows, `~/.config/Kultr`
on Linux. Deleting that folder starts it afresh; your music files are never
touched.

---

## Offline and installing

### No "install" option

Needs HTTPS (or `localhost`). See
[a real domain with HTTPS](INSTALL.md#7-a-real-domain-with-https).

### Offline tracks disappeared

Browsers evict storage under pressure. Install Kultr as an app — installed apps
get persistent storage that is not evicted.

### "QuotaExceededError"

Out of browser storage. Remove some offline tracks, or clear the analysis cache
under Sync.

---

## Performance

### Scrolling is heavy

Set **Settings → Appearance → Surface blur** to **Reduced** or **Off**. The
blur is the expensive part. **Reduce motion** also helps.

### A huge library is sluggish

Track lists above 120 rows are virtualised and grids load as you scroll, so
size alone should be fine. If it is not, turn on **Compact track rows** and use
**Small** grid size.

---

## Starting over

- **Sync → Clear the local library** — rebuild the mirror, keep everything else.
- **Settings → Reset Kultr** — erase everything in this browser.

Neither touches your server.

---

## Reporting a bug

Please include:

- What you did and what happened
- Browser and version, operating system
- Navidrome version (shown on Kultr's Sync page)
- Anything red in the browser console (<kbd>F12</kbd>)
- Which audio engine mode is active (**Settings → Audio**)

<https://github.com/evropiani/Kultr/issues>
