# Phones and tablets

## Today: install it as an app

Kultr is a progressive web app. Installed, it runs full-screen with no browser
chrome, keeps working offline for anything you have downloaded, and appears on
the lock screen with artwork and transport controls.

**iOS / iPadOS** — open Kultr in Safari, tap **Share**, then **Add to Home
Screen**. Must be Safari; other iOS browsers cannot install web apps.

**Android** — Chrome offers **Install app** in the menu, or you will get a
prompt.

**Desktop** — Chrome and Edge show an install icon in the address bar.

Installing needs HTTPS (or `localhost`). See
[a real domain with HTTPS](INSTALL.md#7-a-real-domain-with-https).

### What you get

- Media-session integration: lock screen, notification shade, Bluetooth and
  headset buttons, CarPlay and Android Auto media controls.
- Offline playback for saved tracks, and the whole interface offline.
- Persistent storage — installed apps are not evicted under storage pressure,
  which matters if you keep a lot offline.
- Safe-area handling, so it sits correctly around notches and home indicators.

### What the web cannot do

Worth being straight about, because these are the reasons to build native:

- **Background playback is at the OS's discretion.** iOS in particular may
  suspend a web app that is not in the foreground.
- **No filesystem-level downloads.** Offline tracks live inside the browser's
  storage, not in Files or your music folder.
- **No system-wide integration** beyond the media session — no widgets, no
  Shortcuts/Tasker actions, no Watch app.
- **Web Audio can be interrupted** by other audio on the device more abruptly
  than a native player would be.

---

## Next: native apps

Planned, and the codebase is already arranged for it.

### Why it ports cleanly

The parts that were hard to build do not touch the DOM:

| Module | Depends on |
|---|---|
| `audio/dsp.ts` | Nothing. Takes a `Float32Array`, returns numbers. |
| `audio/injekt.ts` | The analysis shape and a settings object. |
| `sync/engine.ts` | The API client and a storage interface. |
| `api/subsonic.ts` | `fetch` and `crypto.getRandomValues`. |
| `lib/md5.ts` | Nothing. |

So tempo detection, key detection, the transition planner, the sync logic and
the auth hashing all move across unchanged. What has to be rewritten is the
platform edge: audio output, storage, and the interface.

### The two approaches

**Capacitor** — wrap this app, replace the web audio layer with a native
plugin. Fastest path, one codebase, and the UI is already designed for touch.
The audio layer is the real work: two `AVAudioPlayerNode`s on iOS or two
`ExoPlayer` instances on Android, with the same crossfade and bass-swap
scheduling the web engine does.

**React Native / native** — a real native shell, with the TypeScript core
shared as a package. More work, better background behaviour and OS integration.
This is probably the right answer for iOS specifically, where background audio
rules are strict.

### Where native genuinely wins

- Reliable background playback, including with the screen off
- Real file downloads, with resumable transfers
- Hardware-accelerated time-stretching — better beat-matching quality than the
  browser's `preservesPitch` at larger stretch ratios
- Widgets, Shortcuts, Android Auto and CarPlay beyond basic media controls
- Analysing a library on-device using all cores

### Helping

The most useful contributions right now are a Capacitor audio plugin that
implements the `AudioEngine` interface in `src/audio/engine.ts` — it is
deliberately small: load, play, pause, seek, set gain, schedule a fade, set
playback rate, set a low-shelf gain. Everything above that is already written
and tested.

Open an issue if you want to take it on.
