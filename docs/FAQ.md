# FAQ

### Does Kultr replace Navidrome?

No. Navidrome holds your music, scans it, and serves it. Kultr is a different
front end for it. Navidrome's own interface keeps working exactly as before,
and you can use both.

### Do I have to install it? What is the demo?

The demo at <https://evropiani.github.io/Kultr/> is the same app, served from
GitHub Pages. It has no backend, stores no data on any server, and connects to
whatever Navidrome you point it at. It is there so you can see the thing before
committing to an install.

Two caveats: your browser will block the connection unless your Navidrome
allows cross-origin requests ([CORS.md](CORS.md)), and you are trusting a page
on the internet with your password. Self-hosting takes about a minute and has
neither problem.

### Where is my password stored?

In your browser. Subsonic authentication hashes the password with a fresh
random salt on every request, so the client has to keep the password itself —
a stored token is not possible. Turn off **Stay signed in** and it is held only
until you close the tab.

It is never sent anywhere except your own server.

### Does it phone home?

No. Kultr makes requests to exactly one host: your Navidrome. No analytics, no
error reporting, no fonts from a CDN, no external APIs. The whole thing is
static files.

### Why does it download my whole library?

Metadata only — names and relationships, about 1 KB per track. That is what
makes browsing and searching instant, and what lets the app work when the
server is unreachable. Audio is streamed as normal unless you explicitly save a
track offline.

### Will syncing hammer my server?

A full sync is one request per album, six at a time. A few thousand albums
takes a minute or two. Afterwards, **Check for updates** is a handful of
requests. Details and numbers in [SYNC.md](SYNC.md).

### What is InjeKt?

Kultr's mixing engine, and the reason the K is capitalised. It measures every
track — tempo, beat grid, musical key, energy, where the intro ends and the
outro starts — and then *injects* the next track into the current one at a
point that works musically: beat-matched, on a downbeat, with the basslines
swapped over so two kick drums never fight.

Unlike a plain crossfade it is not a fixed number of seconds. A pair of tracks
that sit well together gets a long blend; a pair that clash get a short one, or
a filter sweep instead. It also shows its working — the InjeKt tab tells you
both tracks' tempo and key and exactly what it decided and why.

See [INJEKT.md](INJEKT.md).

### Does InjeKt send my music anywhere?

No. Analysis decodes the audio in your browser and the results stay in your
browser. Nothing is uploaded and nothing is written to your server.

### Why is the equaliser greyed out?

Kultr is in compatibility mode, which happens when the browser cannot read the
audio data — a cross-origin restriction. Playback and crossfade work; the EQ,
and InjeKt bass swap need Web Audio. [CORS.md](CORS.md) explains
the fix.

### Does it work with Airsonic / Gonic / Ampache / other servers?

Probably. Kultr speaks Subsonic 1.16.1 with OpenSubsonic extensions where
available and degrades when they are missing. It is built and tested against
Navidrome, so that is what is supported. Reports about other servers are
welcome.

### Can several people use one install?

Yes. Kultr is static files — everyone loads the same app and logs in with their
own Navidrome account. All state is per browser, so people do not see each
other's queues, history or offline tracks. Kultr adds no accounts of its own;
permissions are whatever Navidrome says.

### Can I connect to more than one server?

Yes. Add another from the account menu, and switch between them. Each keeps its
own mirror.

### Does it scrobble to Last.fm / ListenBrainz?

Kultr scrobbles to Navidrome, and Navidrome forwards to whatever you have
configured there. So set Last.fm or ListenBrainz up in Navidrome and it works.

### Can it edit tags or delete tracks?

No, by design. Kultr reads your library and writes only the things Subsonic
supports: favourites, ratings, playlists and play counts. Tag editing belongs
in a tagger; deletion belongs nowhere near a music player.

### Does it use a lot of battery or data?

Streaming is streaming. Two things are Kultr-specific:

- During a crossfade two tracks stream at once, briefly.
- InjeKt analysis streams each track once at 96 kbps. On a metered connection,
  turn off **Analyse ahead** and do the analysis at home.

The blur effects cost GPU. Set **Surface blur** to **Reduced** or **Off** on a
laptop running on battery.

### Why is it called Kultr?

It is short, it was available, and the silver K looked good.

### How do I get rid of it?

[Uninstalling](INSTALL.md#uninstalling). Nothing on your Navidrome server is
affected — favourites, playlists and play counts live there.
