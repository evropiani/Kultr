# InjeKt

InjeKt is Kultr's mixing engine. Instead of a fixed crossfade that fades out
wherever the track happens to be, it works out what each track *is* — tempo,
key, energy, structure — and plans a musical transition between the two, the
way a DJ would.

The name is the point: it *injects* one track into another rather than laying
one on top of the other.

Everything runs in your browser. Nothing is sent anywhere, nothing is written
to your server, and no external service is consulted.

---

## What gets measured

The first time Kultr needs a track, it streams it once at 96 kbps, decodes it to
mono at 22.05 kHz, and runs one analysis pass. The result is cached in the
browser, keyed by track, so it never happens twice.

| Property | How | Used for |
|---|---|---|
| **Tempo** | Spectral-flux onset envelope → autocorrelation to pick the octave → a matched pulse train to pin the exact period | Beat-matching |
| **Beat grid** | Phase of that pulse train, fitted at the head *and* the tail of the track | Starting the blend on a downbeat |
| **Key** | Chroma from the FFT, correlated against Krumhansl–Schmuckler profiles, reported in Camelot notation | Harmonic mixing |
| **Energy** | Median RMS across the track | Choosing the transition length |
| **Brightness** | Spectral centroid | Ranking what to play next |
| **Intro / outro** | Smoothed loudness envelope against a percentile threshold | Where to start and enter |

If the file has a BPM tag and Kultr's own estimate is weak, the tag wins.

### On tempo precision

Beat-matching is unforgiving. At 174 BPM, one analysis frame is about 1.5 BPM
wide — matching to that resolution would drift by most of a beat over a
16-bar transition, which you would hear immediately.

So the autocorrelation peak is only used to decide the *octave* (is this 87 or
174?). The precise period comes from correlating the onset envelope against a
pulse train, whose response sharpens with the length of the track. On synthetic
click tracks this lands within 0.01% — see `tests/dsp.test.ts`.

The beat *phase* is fitted twice: once over the head of the track and once over
the last 75 seconds. Even a 0.3% tempo error puts a grid fitted at 0:00 a whole
beat out by 4:00 — and the mix-out point is exactly where being out matters. The
planner snaps against whichever anchor is closer to the point it is using.

---

## How a transition is planned

As soon as a track starts playing, Kultr looks at what is next, analyses both
tracks if it has not already, and builds a plan. Planning at the start rather
than near the end means a first-time analysis has minutes to finish instead of
seconds, and the planner can choose its mix-out point from the whole track.
The next track's audio is only loaded into the spare deck about 30 seconds
before the mix begins. Anything that changes what comes next — a queue edit,
shuffle, repeat, a seek — throws the plan away and makes a new one.

**1. Can they be beat-matched, and at what tempo?**

It compares the two tempos, considering half and double time as well — a 140 BPM
track runs into a 70 BPM one perfectly well.

It then picks a tempo for them to **meet** at, rather than dragging the new
track onto the old one's. The meeting point is a geometric interpolation,
because tempo is a ratio: halfway from 120 to 130 BPM is 124.9, not 125. Where
it sits between the two is the **Tempo share** setting — 50% by default, which
splits the work evenly; 0% reproduces the older one-sided behaviour.

Both resulting stretches have to be within your limit (default 8%) and both
estimates have to be confident. Because the limit applies to each track
separately and the gap is shared, an 8% limit now covers roughly a 16% gap:
120 into 128 BPM is 6.3% for one deck alone — too far — but 3.2% each when
shared, which is comfortably inside it.

**2. How long should the blend be?**

Starts at your setting (default 8 bars) and shortens to 4 when the two tracks
clash — a big energy jump, keys that do not sit together, or no beat-match
available. Clamped to 2–24 seconds and never more than a third of the track.

**3. Where does it start?**

At the outro, snapped down to a downbeat of the outgoing track. If that point
has already passed, it moves forward and **re-snaps** — losing alignment there
is exactly the bug that makes "beat-matched" meaningless.

The approach ramp is measured backwards from here in the *outgoing track's own
timeline*, not on the clock, so slowing that deck down does not also stretch
the ramp, and it always finishes exactly on the bar where the blend starts. If
the plan is made too late for a full ramp, the ramp is shortened rather than
reaching back into the past.

**4. Where does the next track come in?**

At its first downbeat after the intro ends, so you get the track rather than
twenty seconds of pad. Capped at 45 seconds in.

**5. What happens during the blend?**

| | |
|---|---|
| **Equal-power fade** | Perceived loudness stays constant through the overlap. |
| **Tempo ramp, before and after** | The outgoing track drifts from its own tempo to the meeting tempo over the eight bars *leading up to* the blend, so the two are already locked when the overlap begins — done that slowly it is felt rather than heard. The incoming track enters at the meeting tempo and eases back to its own over the eight bars after. Pitch is preserved throughout: it time-stretches rather than detuning. |
| **Bass swap** | Outgoing low-shelf drops to −26 dB over the first 55% of the blend; incoming rises from −26 dB over the last 65%. Two kick drums never occupy the same space. |
| **Filter sweep** | When keys clash, a high-pass on the outgoing track sweeps from 20 Hz to 2.4 kHz instead of blending into a muddy chord. |

---

## Transition types

| Type | When | What it does |
|---|---|---|
| `blend` | Tempos match, keys agree | Beat-matched overlap with bass swap |
| `sweep` | Tempos match, keys clash | Filters the old track out from underneath |
| `crossfade` | Tempos too far apart, or no analysis | Plain equal-power fade |
| `gapless` | Crossfade off, gapless on | Next track starts the instant this one ends |
| `cut` | Both off | One after the other |

Open the **InjeKt** tab in the full-screen player while something is playing
and you can see the measurements for both tracks and exactly what was decided.

---

## Settings

**Settings → InjeKt**

| Setting | Default | Notes |
|---|---|---|
| Enable InjeKt | on | Off falls back to plain crossfade |
| Beat-match | on | Time-stretch both tracks onto a shared tempo |
| Meet in the middle | on | Move the current track too, instead of only the next |
| Tempo share | 50 / 50 | How much of the gap the current track closes |
| Maximum tempo shift | 8% | Per track. Above ~8% stretching starts to be audible |
| Transition length | 8 bars | Shortened automatically when tracks clash |
| Bass swap | on | Needs Web Audio — see [CORS.md](CORS.md) |
| Harmonic mixing | on | Uses the detected key |
| Skip long intros | on | Enter at the first real downbeat |
| Keep playing similar music | on | Continue when the queue empties |
| Analyse ahead | on | Also analyse the track after next, so a skip lands on a ready transition |

### Starting points

- **Subtle** — max shift 4%, tempo share 50, 16 bars, harmonic mixing on. Long,
  gentle blends that only happen when tracks genuinely fit.
- **Club** — max shift 10%, tempo share 50, 16 bars, bass swap on, skip intros
  on. Long beat-matched blends, as aggressive as it gets without sounding
  stretched.
- **Purist** — tempo share 0. Nothing touches the track you are listening to;
  only the incoming one is stretched, as older versions did.
- **Radio** — beat-match off, 4 bars. Quick tidy transitions, no stretching.
- **Album listening** — InjeKt off, crossfade off, gapless on. Nothing gets in
  the way of the record.

---

## Continuing the queue

When the queue runs out and **Keep playing similar music** is on, Kultr picks
what comes next from:

1. Your server's similarity endpoint, if it has one configured
2. The same artist
3. The same genre
4. Anything in the library

…then re-ranks the candidates by *mixability* — tempo proximity (counting half
and double time), Camelot distance, energy and brightness — using analysis it
has already cached. It never analyses dozens of tracks just to sort them, and it
shuffles among the best few so a session does not become repetitive.

---

## Analysing in bulk

**Sync → InjeKt analysis → Analyse missing.**

Two tracks at a time, each streamed once at 96 kbps and decoded to mono at
22 kHz. The FFT work runs in a Web Worker, so the UI stays responsive and
playback is unaffected. You can stop and resume at any point.

You do not have to do this. Kultr analyses the current and next track the
moment a track starts, and with **Analyse ahead** on, the one after that too,
so transitions come good from the first one of normal listening. Bulk analysis
just means no track ever has to be analysed on the spot.

The cache lives in your browser, so each device builds its own.

---

## Limitations

Worth knowing:

- **Tempo detection assumes a steady pulse.** Rubato classical, free jazz and
  ambient have no grid to find. Kultr notices the low confidence and does not
  attempt to beat-match — you get a plain crossfade, which is the right answer.
- **4/4 is assumed** for bar detection. A waltz will be beat-matched but its
  "bars" will not be musical bars.
- **Key detection is a global estimate.** A track that modulates gets one
  answer, usually the dominant section.
- **Time-stretching is the browser's**, not a studio algorithm. Under about 8%
  it is clean; push the limit to 20% and you will hear it.
- **Bass swap needs Web Audio**, which needs audio the browser lets it read:
  from the same address as Kultr, or from a server that sends CORS headers
  (Navidrome does). See [CORS.md](CORS.md).

---

## Testing it

The DSP and the planner are plain TypeScript with no DOM dependencies, so both
are tested directly:

```bash
npm test
```

`tests/dsp.test.ts` checks tempo detection against synthetic click tracks at six
tempos, verifies the beat grid is accurate at both the start and the end of a
four-minute track, and checks key detection and intro/outro detection.

`tests/injekt.test.ts` drives the planner with hand-written analysis data and
asserts the decisions: that close tempos produce a beat-matched blend with the
right stretch ratio, that clashing keys produce a sweep, that a plan is never
scheduled in the past, that a plan pushed forward keeps its bar alignment, that
the overlap always fits inside the track, and that every failure mode degrades
to a plain crossfade rather than breaking.
