# Changelog

Every change to Kultr, newest first, with the date and time it was made.
Times are UTC. Versions follow [semantic versioning](https://semver.org):
the middle number moves when features arrive, the last one when things are
only fixed.

---

## 1.5.2 — 2026-09-25

### 2026-09-25 10:56 — The web version, not a demo

web.kultr.cc is the full app running in the browser, so the README, FAQ,
Install and Troubleshooting guides stop calling it a demo. The GitHub Pages
section of INSTALL.md is now *Publishing your own copy on GitHub Pages*
(links updated).

Documentation only; the app itself is unchanged.

### 2026-09-25 10:29 — Kultr for iOS, in the README

The README and MOBILE.md still called a native iOS app planned. It is out:
**[Kultr for iOS](https://github.com/evropiani/Kultr_iOS)** is now linked at
the top beside the Android app, and the *Phones* section says how to get it
(the IPA from its latest release, sideloaded with a free Apple ID).

Documentation only; the app itself is unchanged.

### 2026-09-25 06:07 — The docs catch up, and stop giving advice that breaks things

The README and the guides said Navidrome does not allow cross-origin requests
by default, so the hosted app would be blocked unless you added CORS headers
in front of it. That is not true: Navidrome has sent
`Access-Control-Allow-Origin: *` on its API and its audio since at least 0.40
(2021) and still does in 0.64. Worse, the nginx and Caddy snippets in
CORS.md *added* a second header — and a browser rejects a response with two,
so following them broke a setup that was working. Checked in front of
Navidrome 0.64 with real nginx and Caddy: the old snippets blocked the API and
the audio, the corrected ones load both.

- **CORS.md** is rewritten around what actually gets in the way: an `http://`
  server with the HTTPS app, a proxy that adds a second header, a login
  gateway answering `/rest` with a login page, or a server other than
  Navidrome. It says not to add headers in front of Navidrome, shows how to
  *replace* them if you want to allow only the hosted app, and has an updated
  diagnosis table.
- **README**, **FAQ**, **Troubleshooting**, **InjeKt** and **Install** say the
  same, and no longer claim the equaliser needs Kultr and Navidrome on one
  address. The FAQ and Troubleshooting now name the real causes of
  compatibility mode.
- **Compatibility** in the README lists how Kultr fared against Gonic,
  Supysonic, Ampache and Airsonic-Advanced in testing, instead of "it will
  largely work".
- **When InjeKt plans**: the README and Troubleshooting still said transitions
  were analysed just before they happen; since 1.5.0 that is as soon as a
  track starts.
- The README's documentation table now mentions the Android app.

Documentation only; the app is unchanged.

### 2026-09-25 05:48 — Favourites can be taken back

Favouriting a track, an album or an artist and then clicking the heart again
did not remove it: the second click favourited it again. Every heart kept its
own idea of the state, but the toggle decided what to do from the copy of the
track the page was drawn with, which a click never updated. It now decides
from what the heart is showing. Fixed on track rows and their menu, the
album's **Favourite** button and the artist's **Follow** button. The full
player's heart also kept the previous track's state after a skip while it was
open; it now follows the track.

### 2026-09-25 05:48 — Transcoded streams play to the end

With **Streaming quality** or **Transcode format** set to something the server
has to convert (MP3, Opus or AAC from a FLAC library, for example), tracks
stalled a second or two before their end and never moved on to the next one,
and seeking could fail.

Kultr asked Navidrome to announce the size of each converted stream in
advance. Navidrome works that out from the bitrate, and when the real output
came out larger it cut the connection at the announced size — the browser was
left waiting for the rest. Tested against Navidrome 0.64 with its transcode
cache off: with the request, 17 of 18 converted streams were cut short;
without it, every one arrives whole, plays to its end, carries on into the
next track and seeks correctly. The duration still shows, from the track's
own metadata.

Original files were never affected, and **FLAC** as the transcode format is
not either: Navidrome sends FLAC files exactly as they are. The setting's
description now says so, and that Navidrome can make FLAC out of the box.

---

## 1.5.1 — 2026-09-24

### 2026-09-24 14:54 — Plays made in the background are counted again

Some plays never reached Navidrome: the first few tracks would show up in its
recently played, then nothing. The ones that went missing were the ones played
while Kultr was not on screen — another tab in front, the window minimised,
the phone locked.

Kultr's playback loop ran on animation frames, and browsers stop sending
those entirely to a page nobody is looking at. So in the background nothing
measured how long a track had been heard, no track ever reached the point
where it counts as played, and nothing was sent. The same loop starts InjeKt
transitions, so those were skipped in the background as well, and tracks
simply ran to their end.

- **The loop keeps going in the background.** When frames stop arriving, a
  timer takes over. Browsers keep timers running for a page that is playing
  audio.
- **Listening is measured by how far the track moved on**, not by how often
  the loop ran. Before, any gap of a second or more between two checks was
  thrown away, which is exactly what a background tab produces. A jump in
  position that the clock cannot account for is a seek, and still does not
  count.

Tested with animation frames switched off entirely: 1.5.0 never sent the play;
1.5.1 sends it once 50 seconds of a 100-second track have been heard, and
playback carries on into the next track.

---

## 1.5.0 — 2026-09-24

### 2026-09-24 13:50 — Listening data lives on your server

Recently played and the Listening page used to come from a history kept only
in the browser, so clearing its storage wiped them, and a phone and a laptop
never agreed. Navidrome already keeps what matters — each track's play count
and when it was last played — so Kultr now uses that, in both directions.

- **Out.** Every play is written down as *pending* and sent to Navidrome with
  the time it actually happened. If the server cannot be reached, it stays
  pending and goes out later — on the next sync, when the browser is back
  online, or from **Refresh from server** — still with its original time, and
  exactly once.
- **In.** Albums come back from the server with their own play count and
  last-played time. When those have moved, the album was played somewhere, so
  **Check for updates** re-reads its tracks. The same cheap check runs when you
  come back to the tab, which is usually when you come back from another device.
- **Jump back in** merges the server's last-played times with this browser's
  history, so plays from every device appear, and all of it returns after a
  fresh sync.
- **The Listening page** is rebuilt on the server's numbers: recently played,
  played the most, and top artists by plays, with a refresh button and a count
  of plays waiting to be sent. The day-by-day chart stays per-browser —
  Navidrome keeps a count per track, not a log of every play — and says so.
  Clearing it keeps plays that have not been sent yet.
- The setting is now called **Send plays to Navidrome** and explains what it is
  for. Internet radio is no longer sent: it is not a library track.

### 2026-09-24 13:50 — InjeKt plans as soon as a track starts

Transitions were planned about 35 seconds before the end of a track. For a
track InjeKt had not seen before, that left the analysis racing the clock, and
the planner could only choose a mix-out point from whatever was left.

Now the next transition is planned the moment a track starts playing: both
tracks are analysed then, and the plan — with its start point, overlap and
tempo changes — shows in the InjeKt panel within seconds. The next track's
audio is still only loaded into the spare deck about 30 seconds before the mix,
so no stream is held open for minutes. Editing the queue, shuffling, changing
repeat or seeking throws the plan away and makes a new one, and a change that
lands while a plan is being made is no longer lost. **Analyse ahead** now looks
one track further, so skipping lands on a ready transition too.

The InjeKt panel also used to keep saying *Not analysed yet* about a track the
plan had just been built from; it refreshes when a plan arrives.

### 2026-09-24 13:50 — Motion that goes both ways

Things animated in and then simply vanished. Now:

- **The full player** slides back down when you close it, as it slid up.
- **The sidebar highlight** slides from the page you were on to the one you
  picked. The slide starts on the click, before the new page renders, so it
  stays smooth even on a heavy page.
- **Switchers** — every segmented control in Settings and the tabs in the full
  player — slide their highlight the same way, and a new tab's content fades
  in.
- **Settings sections** grow open and shrink shut instead of appearing.
- **Pages** rise into place on navigation.
- **The queue, dialogs, menus, notices, the selection bar and the phone menu's
  backdrop** animate out as well as in. Menus grow from the corner nearest the
  pointer.
- **Reordering home shelves** in Settings slides the two rows past each other.
- The selection bar used to lurch sideways as it appeared; fixed.

All of it is quick, and **Reduce motion** (or the system setting) turns it off.

### 2026-09-24 13:50 — One search, in the top bar

The top bar's field and the Search page did the same thing. The Search entry is
gone from the sidebar; typing in the top bar now opens the results and updates
them as you type. The query is kept in the address, so Back returns to where you
were in one step, and Forward brings the search back.

---

## 1.4.2 — 2026-09-23

### 2026-09-23 22:37 — A new app icon

The K is now engraved in a grey tile and lit from inside, blue through violet
to amber. It replaces the cut-out chrome K everywhere: the browser tab, the
installed-app icons, the Apple touch icon, the sidebar, the sign-in screen and
the top of the README. It is still one image for both themes.

Each icon is cut from the same artwork to suit where it is shown:

- **Favicon, sidebar, sign-in, and the regular app icons** show the tile with
  its own rounded corners and a transparent background.
- **The Apple touch icon** fills the whole square. iOS rounds the corners
  itself, to almost the same radius as the tile, so the tile's edge is
  carried out into the corners for iOS to trim.
- **The maskable icon** (Android home screens) scales the K down to sit
  inside the circle Android always keeps, and extends the tile's grey out to
  the edges. The launcher can crop it to a circle, a squircle or a teardrop
  without touching the letter.

`logo-light.png` is now `logo.png`. The README screenshots were retaken, since
the sidebar and sign-in screen show the icon.

---

## 1.4.1 — 2026-09-23

### 2026-09-23 11:23 — Pointing to the Android app

**[Kultr for Android](https://github.com/evropiani/Kultr_Android)** is out, and
the README now says so: a link at the top beside the demo, and the *Phones*
section leads with it and its latest release. That section, and MOBILE.md, used
to say native apps were only planned; that is now true of iOS alone.

Documentation only; the app itself is unchanged.

### 2026-09-23 10:11 — Moving to web.kultr.cc, and a splash that says why

The demo moved to a custom domain, **<https://web.kultr.cc/>**, and came up as
nothing but a pulsing “KULTR”.

Nothing was wrong with the app. A build bakes in the path it will be served
from, and the one live at the time had been made for
`evropiani.github.io/Kultr/`. On the new domain the site lives at `/`, so the
page asked for `/Kultr/assets/…`, got GitHub's 404 page back, and the browser —
rightly — refused to run a web page as a script. Changing the domain in the
Pages settings does not start a build, so nothing noticed. Re-running the
deploy was the whole fix: the workflow asks GitHub where the site lives and
this time was told `/`.

So that this is never a mystery again:

- **The page diagnoses it in a fraction of a second.** A file of its own
  failing to load is now caught as it happens, rather than after an
  eight-second wait. If the path the build expects does not match the address
  it is being served from, it says exactly that, names both, and says to re-run
  the deploy. Checked against every shape it can be served in; it never fires
  on a healthy one.
- **Documented** in INSTALL.md (a new *Custom domains* section) and
  TROUBLESHOOTING.md, including the two side effects of moving address: local
  data stays with the old one, and CORS rules that named the old origin stop
  matching.
- **Links updated** — README, FAQ and the CORS examples now use the new
  address. CORS.md calls out that `https://evropiani.github.io` no longer
  matches, since anyone who allowed it on their server needs to change it.

Also corrects INSTALL.md, which still said the deploy *fails* when Pages is
set to a branch; it warns and wins the race instead, as of 1.2.1.

---

## 1.4.0 — 2026-09-22

### 2026-09-22 15:36 — Settings grouped by what you are actually doing

**Player is gone.** Its two settings had nothing to do with each other: *Show
lyrics tab* now sits directly under *Playhead* in Appearance, and *Keyboard
shortcuts* under *Built with* in About, which is where you go looking for a
reference anyway.

**Crossfade is now Playback**, and has gained *Resume where you left off* and
*Scrobble plays* from Audio — neither was about sound, both are about what
happens when you play something. Audio is left doing one job: loudness, and
what Kultr asks the server to send.

**Reset Kultr moved out of Servers**, where it was buried under the server
list, into **Backup and reset** — directly below the export, which is what you
want to run first.

**Appearance is ordered in runs** instead of the order things were added:
frame (theme, blur, corners, motion), then colour, then panel surfaces, then
list density, then the player's own chrome.

Section order is now roughly how often each is touched: Appearance, Home page,
Playback, InjeKt, Audio, Equaliser, Offline, Servers, Custom CSS, Backup and
reset, About.

### 2026-09-22 15:36 — Track shelves run in two columns

*Played the most*, *Something else* and *Jump back in* were a single column of
ten, which is a lot of scrolling for a glance. They are now five and five,
side by side, stacking back to one column below 1080px.

The album column went with the change — half the width has no room for it —
and so did the artist column that used to replace it, since the artist is
already named under the song title. What is left is the title, the artist
beneath it, the heart and the length.

---

## 1.3.0 — 2026-09-22

### 2026-09-22 15:08 — Settings is a list you can skim

Every section collapses. The page shows its headings and descriptions, and you
open the one you want with the arrow on the right. What is open is remembered,
and the body of a closed section is not rendered at all rather than hidden.

The order now follows how often things get touched: **Appearance, Home page,
Crossfade, InjeKt, Audio, Equaliser, Offline, Player, Custom CSS, Backup,
Servers, About**. *Interface* is now *Player*, which is what it was always
about.

### 2026-09-22 15:08 — Shelves fill the row at every grid size

A shelf always showed twelve cards. Twelve fills the row at the large size and
leaves a ragged gap at the other two, so it is now **12 large, 16 medium, 20
small**.

### 2026-09-22 15:08 — The pen edits the server, not just its name

It used to open a browser prompt that could only rename. It now opens a proper
dialog with the name, the **server address**, the **username**, the
**password** and the plain-password switch.

The stored password is never rendered back into the page — the box starts
empty and leaving it that way keeps the existing one. Changing the address or
the username makes this a different account, so the dialog says so before you
save, and saving reconnects if it is the server you are on.

### 2026-09-22 15:08 — Exporting your servers, if you ask

A second button beside **Export**: *Export with servers*. It asks first, and
says plainly that the file names where your music lives and should not be
shared.

**Usernames and passwords are never in it** — not just passwords. The list is
rebuilt field by field from the label, the address and the auth mode, so a
profile growing a new property later cannot start leaking into exports by
accident, and anything credential-shaped in a file being imported is ignored
rather than trusted. Imported servers arrive needing a username and password,
which the new dialog is how you supply.

### 2026-09-22 15:08 — The Discord link has the Discord mark

It was a generic speech bubble.

---

## 1.2.1 — 2026-09-22

### 2026-09-22 14:44 — Discord handle corrected

It was `@evropioani` in the About section and twice in the README. The link
behind it was always right; only the text was wrong.

### 2026-09-22 14:27 — The splash that never goes away, explained

The live site got stuck on a pulsing “KULTR” again. The app was not at fault:
every build, the service-worker upgrade path and the settings migration were
checked against a real library and booted cleanly.

The cause is a repository setting. **Pages is still set to “Deploy from a
branch”**, which means GitHub runs its own Jekyll build of the repository on
every push *as well as* the deploy workflow — two publishers, one site,
whichever finishes last wins. On the 1.1.0 push the workflow landed five
seconds after Jekyll and the site was fine. On the 1.2.0 push Jekyll landed
eight seconds after the workflow, so the published site became the repository
verbatim: an `index.html` asking for `/src/main.tsx`, which no browser can run.
Nothing ever mounts, so nothing ever removes the splash.

That coin flip has been there since the beginning; it has simply been landing
the right way up.

The fix is one setting — **Settings → Pages → Build and deployment → Source →
GitHub Actions** — which also stops the Jekyll build running at all. Until
that is changed, no push can be relied on to publish.

Three changes here so this can never be mysterious again:

- **The splash explains itself immediately.** The unbuilt-source case is
  visible the moment the document is parsed, so there is nothing to wait for.
  It used to pulse for eight seconds first, which is exactly long enough to
  look like a boot loop and not long enough for anyone to wait.
- **The deploy wins the race on purpose.** It tries to switch the setting
  itself first; `GITHUB_TOKEN` turns out to be allowed to *create* a Pages site
  but not to re-point an existing one, so that returns 403 and the workflow
  says so. It then waits for GitHub's Jekyll build of the same commit to
  finish before publishing, which makes this deploy the last word every time
  instead of most times. Once the source is switched by hand the Jekyll build
  stops running at all and the wait finds nothing.
- **Documented** in INSTALL.md and TROUBLESHOOTING.md, including the
  works-then-breaks symptom, which is the confusing part.

---

## 1.2.0 — 2026-09-22

A home page you choose the contents of, casting, custom CSS, and four fixes.

### 2026-09-22 13:50 — A home page you choose

- Fifteen shelves are available — most played, random, favourite and recently
  added, across tracks, albums, artists, playlists and internet radio — and
  **Settings → Home page** switches each one on or off and puts them in
  whatever order you like.
- Out of the box: most played tracks, most played albums, some random tracks,
  most played artists.
- A shelf with nothing to put in it is skipped rather than shown empty, so
  switching one on may change nothing until there is something to fill it.
- Artists and playlists have no play count of their own in Subsonic, so those
  two are worked out by adding up the play counts of the tracks underneath
  them. Playlists need their contents synced for this.
- Internet radio stations can be hearted. Subsonic has no notion of a
  favourite station, so this one is local to Kultr and travels with a settings
  export rather than to other clients.

### 2026-09-22 13:50 — The crossfade marker no longer escapes the bar

The shaded region showing where the next track begins was drawn from the last
transition plan, whatever track that plan was made for. Once playback moved on,
its positions were being measured against a different track's length — so on a
shorter one the marker landed past the end of the bar, as a stray mark beside
the time. Clicking it still counted as a click on the bar, which read as "seek
to the very end", and the track jumped.

A plan is now stored with the track it was built from and only drawn against
that track, the region is clamped to the bar regardless, and a press that is
not on the bar is ignored instead of being clamped into one.

### 2026-09-22 13:50 — The full player's controls are centred

Adding the favourite button to the transport had quietly pushed the play button
off-centre: with six controls in a row, the third one is not the middle.
The row is now three columns — side, play, side — so the play button sits on
the centre line however many controls flank it.

### 2026-09-22 13:50 — Casting

The player bar and the full player have a cast button: Chromecast and other
receivers through the Remote Playback API in Chromium, AirPlay in Safari. It
does not appear at all in browsers that have neither.

The receiver fetches the stream itself, so it needs to be able to reach your
Navidrome, and casting bypasses Web Audio, so the equaliser, crossfade and
InjeKt do not apply to it. Both are limits of the platform.

### 2026-09-22 13:50 — Accent borders, opacity, and custom CSS

- **Panel borders** can take the accent colour, so the outline of every panel
  and card moves with the artwork too, with an opacity slider of its own.
- **Panel opacity** decides how much of the background shows through the glass,
  from 20% to 200% of the theme's own value.
- **Settings → Custom CSS** takes a stylesheet of your own and applies it last,
  so it overrides everything else.

### 2026-09-22 13:50 — Removed: the visualizer

It did not earn its place. The tab, its setting and its canvas are gone. The
analyser node behind it stays, because it is what detects a silent Web Audio
graph and triggers the fallback to compatibility mode.

### 2026-09-22 13:50 — One logo, not two

The neon variant is gone. The chrome mark reads on light and dark alike, so it
is now used for both themes, for the favicon and for every app icon — which
also means there is no second image to load and nothing to swap when the theme
changes.

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
