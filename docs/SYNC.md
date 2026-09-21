# Library sync

Kultr keeps a full copy of your library's *metadata* in the browser. Not the
audio — the names, the relationships, the play counts. That is what makes
browsing a 100,000-track library feel instant, and what lets the app stay
usable when the server is asleep or you are on a train.

---

## The two buttons

**Sync everything** — reads the artist index, the album index, and then every
album's track list. Exhaustive, and the only one that catches a track whose
tags changed without the album changing. Run it once at the start, and
occasionally after a big reorganisation.

**Check for updates** — reads the artist and album indexes, compares them
against what it already has, and only fetches track lists for albums that are
new or whose `songCount`, `changed` or `duration` moved. Albums that vanished
from the server are removed locally. This is the one you use day to day; on a
large library it is usually a handful of requests.

Both also refresh playlists and genres, which are cheap.

---

## What it costs your server

The album index is paged 500 at a time. Track lists are one request per album,
six at a time.

| Library | Full sync | Check with nothing new |
|---|---|---|
| 500 albums | ~501 requests | ~2 requests |
| 5,000 albums | ~5,010 requests | ~11 requests |
| 20,000 albums | ~20,040 requests | ~41 requests |

A full sync of a few thousand albums takes a minute or two against a local
server. It is bounded, cancellable, and you can keep listening while it runs.

If a few albums fail, the sync finishes anyway and tells you how many — it does
not abandon everything because one album is broken.

---

## Automatic checking

**Sync → Automatic syncing**

- **Check on startup** — an incremental check a few seconds after connecting.
  If nothing has ever been synced it runs a full sync instead.
- **Repeat check** — every 60 minutes by default. Set it to 0 to stop.
- **Include playlist contents** — fetches each playlist's track list. Turn it
  off if you have hundreds of playlists and do not need them available offline.

There is also a cheap probe that asks the server for its newest album and
compares track counts. When it notices a difference it shows a "your server has
changed" note with an **Update now** button, rather than re-reading the index
on a timer.

---

## Navidrome scans, Kultr syncs

Two different things, and mixing them up is the usual cause of "my new album is
not showing".

```
your files  ──Navidrome scan──▶  Navidrome's database  ──Kultr sync──▶  your browser
```

Navidrome finds new files on its own schedule. Kultr only ever reads what
Navidrome already knows about. So after adding music:

1. Let Navidrome scan (or press **Start a scan** on Kultr's Sync page — it asks
   Navidrome to rescan, which needs an admin account).
2. Wait for it to finish.
3. Press **Check for updates** in Kultr.

The Sync page shows Navidrome's scan status and track count next to Kultr's own,
so you can see at a glance which side is behind.

---

## What is stored, and where

Everything lives in IndexedDB under the origin you loaded Kultr from.

| Store | Contents |
|---|---|
| `songs`, `albums`, `artists`, `playlists`, `genres` | The library mirror |
| `analysis` | AutoMix measurements, one row per analysed track |
| `offline` | Audio files you explicitly saved, as blobs |
| `history` | What you played, when, and for how long |
| `meta` | Sync state |

Rough sizes: the mirror is about 1 KB per track, so 50,000 tracks is ~50 MB.
Analysis is a few hundred bytes per track. Offline audio is whatever your files
weigh.

Browsers grant storage by quota and can evict it under pressure. **Offline →**
shows what your browser has offered and how much is in use. To make eviction
unlikely, install Kultr as an app (PWA) — installed apps get persistent storage.

---

## Clearing it

- **Sync → Clear the local library** — removes the mirror only. Settings,
  offline files, history and analysis are kept. Sync again to rebuild.
- **Settings → Reset Kultr** — removes everything, including saved servers.

Neither touches your Navidrome server. Favourites, ratings, playlists and play
counts live there and come back on the next sync.

---

## Offline

The library mirror makes *browsing* work offline. Playing offline additionally
needs the audio, which you save per track: **track menu → Save for offline**.
Saved tracks appear under **Offline** in the sidebar.

With **Prefer offline copies** on (the default), a saved track always plays from
the browser rather than streaming — which is also nice on a metered connection
even when the server is reachable.

The app shell itself is cached by a service worker, so Kultr opens with no
network at all once you have loaded it once.
