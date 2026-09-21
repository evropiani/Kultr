# Troubleshooting

Grouped by what you are seeing. If it is a connection error,
[CORS.md](CORS.md) goes deeper.

---

## I cannot log in

### "Could not reach the server"

The browser never got a reply. In order of likelihood:

1. **Cross-origin block.** The usual cause. Fix it properly by putting Kultr
   and Navidrome on one address — see [CORS.md](CORS.md).
2. **Wrong address.** Include the scheme and the port:
   `http://192.168.1.10:4533`, not `192.168.1.10`.
3. **`localhost` from another device.** On your phone, `localhost` is the
   phone. Use the server's LAN address.
4. **Mixed content.** An HTTPS page cannot call an `http://` address. Either
   both over HTTPS, or both over plain HTTP.

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

### The equaliser does nothing / the visualizer is empty

Kultr is in compatibility mode because it cannot read the audio data. There is
a note under **Settings → Audio** confirming which mode is active. The fix is
same-origin audio — see [CORS.md](CORS.md). Playback and crossfade are
unaffected; the EQ, the visualizer and InjeKt's bass swap are.

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

- **"Not analysed yet"** → it will analyse just-in-time, or press **Analyse
  now**. For the whole library: **Sync → Analyse missing**.
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

Set **Settings → Appearance → Glass** to **Frosted** or **Solid**. The blur is
the expensive part. **Reduce motion** also helps.

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
