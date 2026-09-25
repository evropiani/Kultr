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
