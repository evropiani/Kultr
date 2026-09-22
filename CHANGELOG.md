# Changelog

Every change to Kultr, newest first, with the date and time it was made.
Times are UTC. Versions follow [semantic versioning](https://semver.org):
the middle number moves when features arrive, the last one when things are
only fixed.

---

## 1.1.0 — 2026-09-22

Tempo that meets in the middle, a real logo, a lot more control over how
Kultr looks, and a top bar that fits on a phone.

### 2026-09-22 09:45 — Version, changelog and screenshots

- Bumped to **1.1.0**. Enough arrived in this round — a new InjeKt
  behaviour, settings backup, five playhead designs, named servers — that
  a patch number would have undersold it.
- Started this changelog. Everything before today is collected under
  **1.0.0** below as the first release.
- Added screenshots to the README, captured from the real app running
  against a mock Navidrome rather than mocked up by hand.

### 2026-09-22 09:37 — Mobile: the top bar no longer runs off the edge

- At 390px the bar was trying to hold a menu button, back and forward, a
  search field, a full-width **Check for updates** pill and two icon
  buttons. The theme and server buttons fell off the right-hand side.
- Back and forward now go away on a phone, where the system's own gestures
  do the same job, and the flexible spacer goes with them.
- **Check for updates** keeps its icon and drops its label on a phone —
  except while a sync is running, when the percentage is the only sign of
  progress.
- Page actions stretch to fill the row instead of wrapping awkwardly.
- Verified at 390×844 in Chromium: nothing is clipped and the document has
  no horizontal scroll.

### 2026-09-22 09:31 — More ways to make Kultr look like yours

- **Accent colour** is no longer an either/or with *Colour from artwork*.
  It has its own row in both modes, and a new **How much of your colour**
  slider lays your accent over the album's at an opacity you choose. At 0%
  the artwork decides, at 100% you do, and in between the interface still
  moves with the music while staying recognisably yours.
- **Five new playhead designs** beside the plain one — Glow, Pulse, Wave,
  Comet and Equalizer — each animated, each previewing itself live in the
  picker. They are pure CSS over the elements the paint loop already
  writes to, so none of them costs anything at runtime, and they all stop
  moving under *Reduce motion*.
- **Clicking the time in the player** switches between elapsed and
  remaining, and the choice sticks. There is a switch for it in Settings
  too.
- **Corners** are adjustable: sharp, soft or round.
- Removed the CSS for the old text "K" marks, which nothing rendered any
  more.

### 2026-09-22 09:27 — Named servers, and a settings backup

- Servers can be **given a name when you add them**, not only renamed
  afterwards. "Living room" reads better than `music.example.com:4533` in
  the sidebar and the switcher. Leave it empty and the address is used, as
  before.
- **Settings → Backup** exports everything on that page as a small JSON
  file, and imports it back.
  - Servers, usernames and passwords are **never** in the file. They live
    in a different store, and the exporter works from a list of preference
    keys rather than from whatever happens to be in state, so there is
    nothing to leak even if the shape changes later.
  - Device-specific things — the download folder, whether you have been
    asked where downloads go — stay behind too, since restoring them on
    another machine is wrong.
  - Import validates key by key against the real defaults. Unknown keys,
    wrong types, `NaN` and anything credential-shaped are reported and
    dropped rather than trusted.

### 2026-09-22 09:25 — InjeKt meets the next track's tempo instead of dragging it

- A beat-match used to put the **entire** tempo difference on the incoming
  track: mixing 124 into 126 meant the new track played 1.6% slow for its
  first half-minute, which is exactly the part you listen to hardest.
- Now **both decks move**. The planner picks a meeting tempo — the
  geometric mean of the two, since tempo is a ratio — and the track
  already playing drifts into it over eight of its own bars *before* the
  blend begins, so by the time the next one appears they are locked.
- Each side moves half as far, so the stretch is half as audible, and
  pairs previously rejected as too far apart now match: the limit applies
  per deck, so an 8% limit covers roughly a 16% gap.
- The share is adjustable — **Settings → InjeKt → Tempo share**. At 0% the
  behaviour is exactly what it was before.
- The ramp is tracked in the outgoing track's own timeline rather than on
  the clock, so slowing the deck down does not also slow the ramp down,
  and it always lands on the bar where the blend starts.

### 2026-09-22 09:23 — The K becomes a real mark

- The plain "K" text in the sidebar, on the login screen and on the error
  screen is now the actual logo: a chrome K for light themes and a neon
  one for dark, both cut out with no background of their own.
- Both images are always in the DOM and CSS picks which is visible, so
  switching theme never shows a missing or half-loaded image.
- App icons, the favicon and the Apple touch icon are regenerated from the
  same artwork. The maskable and Apple icons keep a solid backdrop,
  because the OS composites those onto a shape.

---

## 1.0.0 — 2026-09-21

**First release.** Everything up to and including 21 September: the
Navidrome client itself, library sync, crossfade, InjeKt, offline
downloads, multiple servers, selection and drag-and-drop, the install
guides and the GitHub Pages deployment.
