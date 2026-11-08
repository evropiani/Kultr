# Development

```bash
git clone https://github.com/evropiani/Kultr.git
cd Kultr
npm install

# Proxy your Navidrome through the dev server so there is no CORS to fight
echo "KULTR_PROXY_TARGET=http://localhost:4533" > .env

npm run dev          # http://localhost:5173
```

Leave the server field blank on the login screen — the dev server forwards
`/rest` and `/share` for you.

| Command | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run typecheck` | TypeScript, strict, no emit |
| `npm test` | DSP and InjeKt planner suites |
| `npm run check` | Both of the above |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run serve` | Serve `dist/`, optionally proxying Navidrome |

---

## Layout

```
src/
  api/          Subsonic client and response types
  audio/        Playback and analysis — the interesting part
    engine.ts       Two-deck player: crossfade, EQ, ReplayGain
    injekt.ts      Transition planner and queue continuation
    analysis.ts     Orchestration, caching, worker pool
    analysis.worker.ts
    dsp.ts          FFT, tempo, key, structure — pure, no DOM
    context.ts      Shared AudioContext, decoding
  components/   UI
  db/           IndexedDB schema and accessors
  local/        Music on this computer: tag reader, album builder, folder
                access, scanner, and a LocalClient that answers the
                Subsonic calls from the files
  lib/          Helpers: md5, formatting, artwork, hooks, actions
  routes/       Pages
  store/        Zustand stores: auth, settings, player, sync, ui
  styles/       tokens.css, glass.css, app.css
server/         Zero-dependency static server with Navidrome proxy
desktop/        Electron app for Windows and Linux (its own package.json)
tests/          Test suites and stubs
deploy/         Caddy and nginx configs
```

### The rules that shape it

**`src/audio/dsp.ts` has no DOM dependencies.** It takes a `Float32Array` and
returns numbers. That is why it can run in a Web Worker, why it is directly
testable on Node, and why it will port to native mobile unchanged. Keep it that
way.

**The engine does not know about the queue.** It owns two decks and asks for
what it needs through callbacks (`prepareNext`, `onAdvance`). The player store
owns the queue and answers. Neither imports the other's internals.

**Nothing writes to the server without also patching the local mirror.**
`lib/actions.ts` does both, so the UI does not need to refetch after starring
something.

**Degrade, do not break.** Every audio feature has a fallback path: no Web
Audio → element-volume crossfade; no analysis → plain crossfade; no
`getLyricsBySongId` → plain lyrics; no similarity endpoint → local candidates.

---

## The audio engine

```
deck A ─▶ lowshelf ─▶ highpass ─▶ gain ─┐
                                        ├─▶ bus ─▶ 10× EQ ─▶ preamp ─▶ analyser ─▶ master ─▶ out
deck B ─▶ lowshelf ─▶ highpass ─▶ gain ─┘
```

Two real `<audio>` elements. During a transition both play at once, each
through its own gain and filters — which is what makes a bass swap possible at
all.

**Web Audio mode vs compatibility mode.** `createMediaElementSource` silences
audio the browser cannot read cross-origin. Kultr watches for the analyser
reporting flat zero while a track is clearly playing and, if it sees it,
rebuilds both decks without Web Audio and tells the user. A `MediaElementSource`
can never be detached, so the decks have to be replaced — that is what
`fallbackToElementMode` is doing.

**Gain scheduling.** In Web Audio mode fades are `setValueCurveAtTime` with a
256-point curve, which is sample-accurate. In compatibility mode they are
`requestAnimationFrame` ramps on `el.volume`. Same curve functions either way.

---

## Adding a feature

**A new Subsonic endpoint** → add the method to `SubsonicClient` and the types
it returns to `api/types.ts`.

**Something to store locally** → add the store to the schema in `db/index.ts`
and bump `DB_VERSION`, with an `upgrade` branch. Existing users get migrated;
do not renumber existing versions.

**A new setting** → add it to `SettingsState` *and* `DEFAULT_SETTINGS` in
`store/settings.ts`. The persist middleware merges defaults on read, so old
saved settings pick up new keys automatically. Add the control to
`routes/Settings.tsx`.

**A change to the DSP** → bump `ANALYSIS_VERSION` in `audio/analysis.ts`.
Cached rows with an older version are recomputed on demand rather than trusted.

---

## Tests

The testable core is pure TypeScript, so there is no test framework — `npm test`
bundles each suite with the esbuild inside Vite and runs it on Node.

`tests/dsp.test.ts` is self-contained: it generates synthetic signals and
asserts on the numbers. MD5 is cross-checked against Node's `crypto` for every
input length.

`tests/injekt.test.ts` tests the planner, which normally reaches for IndexedDB,
the settings store and the Subsonic client. Those three modules are aliased to
`tests/stubs/`, letting a suite hand the planner exact analysis data and assert
on the plan it produces.

Adding a case is a function call:

```ts
reset()
analysis('a', { bpm: 124, camelot: '8A', outroStart: 205 })
analysis('b', { bpm: 126, camelot: '9A' })
const p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
assert('beat-matched', Math.abs(p.incomingRate - 124 / 126) < 1e-6)
```

Anything touching tempo, key or transition planning should come with one.

`tests/local.test.ts` builds audio files byte by byte (ID3v2.3 and 2.4, FLAC,
MP4, WAV, AIFF, Ogg Vorbis and Opus) and checks what the tag reader gets from
them, then checks the album rules — the same cases as Kultr for iOS's
`LocalLibraryTests`, so the apps read a music folder alike.

## The desktop app

`desktop/` wraps the built web app in Electron. `main.cjs` serves `dist/`
(copied to `desktop/app`) from `http://127.0.0.1:41814` — a real origin, so
storage persists, and plain http, so a Navidrome on `http://` is not blocked
— and reads music folders for the page through `preload.cjs`, which exposes
`window.kultrDesktop` (pick a folder, list its files, a URL for a file).
Files are served with byte ranges, only from folders picked in the dialog,
and only with a token made at each launch.

```bash
npm run build:only          # the web app, into dist/
cd desktop
npm install
npm start                   # copies dist/ in and opens the app
npm run dist:linux          # AppImage and .deb into desktop/release/
npm run dist:win            # installer and portable .exe (on Windows)
```

`.github/workflows/desktop.yml` builds both on every push and, on `main`,
attaches them to the release for the version in `package.json`.

---

## Styling

Three files, no CSS framework, no CSS-in-JS.

- `tokens.css` — variables and reset. The palette is Cream, the same as Kultr
  for iOS: `--bg`, `--bg-elevated`, the `--ink` steps, `--sand` (the fill of a
  tinted button) and `--line`, per theme. `--accent-r/g/b` and `--on-accent`
  are written at runtime: the chosen colour, darkened on cream until it reads
  as text there (`readableOnLight` in `lib/artwork.ts`), or the artwork's.
- `glass.css` — surfaces and controls. A `.glass` element is a flat panel: one
  colour, a hairline edge, a soft shadow, and a blur for what scrolls under
  it. Pills are sand with an accent label; `pill-accent` (or `data-active`) is
  solid accent. The class names describe the rendering, not the product.
- `app.css` — layout and components.

Use the tokens rather than literal colours, so the themes and the accent keep
working. No gradients for decoration: the album cover is the colourful thing. Respect `prefers-reduced-motion`, which the `--motion` attribute also
drives from settings.

---

## Contributing

1. Fork, branch.
2. `npm run check` must pass.
3. Match the surrounding style — the codebase explains *why*, not *what*.
4. Open a pull request describing the change and how you tested it.

Especially welcome: other Subsonic servers tested against, better tempo
detection for non-4/4 material, translations, and native mobile shells
([MOBILE.md](MOBILE.md)).
