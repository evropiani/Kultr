import type { Song } from '@/api/types'
import { maybeClient } from '@/api/subsonic'
import { allSongs, getAnalysis, songsByArtist } from '@/db'
import { settings, type CrossfadeCurve } from '@/store/settings'
import { analyseTrack, type TrackAnalysis } from './analysis'
import { camelotDistance } from './dsp'

/**
 * InjeKt — Kultr's DJ-style transition engine.
 *
 * Given the track that is playing and the track that comes next, the planner
 * decides *where* to start the blend, *how long* it should last, whether the
 * two tracks can be beat-matched, and which tricks to use (bass swap, filter
 * sweep, intro skip). The engine then just executes the plan.
 *
 * Everything degrades gracefully: with no analysis available it produces a
 * plain equal-power crossfade, and with crossfade switched off entirely it
 * produces a gapless hand-off.
 */

export type TransitionType = 'gapless' | 'crossfade' | 'blend' | 'sweep' | 'cut'

export interface TransitionPlan {
  type: TransitionType
  /** Length of the overlap in seconds. */
  duration: number
  /** Position in the outgoing track at which the overlap begins. */
  startAt: number
  /** Position in the incoming track to start from. */
  inStartOffset: number
  /** playbackRate applied to the incoming track for beat-matching. */
  incomingRate: number
  /** Seconds over which the incoming track eases back to its natural tempo. */
  tempoRelease: number
  bassSwap: boolean
  sweep: boolean
  curve: CrossfadeCurve
  /** Short label for the UI, e.g. "Beat-matched · 124 → 126 BPM · 8 bars". */
  label: string
  /** Longer explanation, shown in the InjeKt panel. */
  reason: string
}

const MIN_TRANSITION = 2
const MAX_TRANSITION = 24

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Pick whichever downbeat anchor was fitted closest to `time`.
 *
 * Analysis records two: one from the head of the track and one from the tail.
 * Snapping the mix-out point against the head anchor would inherit every bit
 * of tempo error accumulated over the whole track.
 */
function barOrigin(analysis: TrackAnalysis, time: number): number {
  const head = analysis.downbeatOffset ?? 0
  const tail = analysis.outroDownbeat ?? head
  return Math.abs(time - tail) < Math.abs(time - head) ? tail : head
}

/** Round `time` down to the nearest bar boundary of `analysis`'s grid. */
function snapDownToBar(analysis: TrackAnalysis, time: number): number {
  const bar = (60 / analysis.bpm) * 4
  if (!Number.isFinite(bar) || bar <= 0) return time
  const origin = barOrigin(analysis, time)
  const bars = Math.floor((time - origin) / bar)
  return Math.max(0, origin + bars * bar)
}

/** First bar boundary at or after `time`. */
function snapUpToBar(analysis: TrackAnalysis, time: number): number {
  const bar = (60 / analysis.bpm) * 4
  if (!Number.isFinite(bar) || bar <= 0) return time
  const origin = barOrigin(analysis, time)
  const bars = Math.ceil((time - origin) / bar)
  return Math.max(0, origin + bars * bar)
}

function gaplessPlan(durationA: number): TransitionPlan {
  return {
    type: 'gapless',
    duration: 0.18,
    startAt: Math.max(0, durationA - 0.18),
    inStartOffset: 0,
    incomingRate: 1,
    tempoRelease: 0,
    bassSwap: false,
    sweep: false,
    curve: 'linear',
    label: 'Gapless',
    reason: 'Tracks run straight into each other with no silence between them.',
  }
}

/** No overlap at all: the next track begins when this one has finished. */
function hardCutPlan(durationA: number): TransitionPlan {
  return {
    type: 'cut',
    duration: 0,
    startAt: Math.max(0, durationA - 0.05),
    inStartOffset: 0,
    incomingRate: 1,
    tempoRelease: 0,
    bassSwap: false,
    sweep: false,
    curve: 'linear',
    label: 'No crossfade',
    reason: 'Crossfade and gapless are both off, so tracks simply follow one another.',
  }
}

function crossfadePlan(durationA: number, seconds: number, curve: CrossfadeCurve): TransitionPlan {
  const duration = clamp(Math.min(seconds, durationA * 0.4), 0.2, MAX_TRANSITION)
  return {
    type: 'crossfade',
    duration,
    startAt: Math.max(0, durationA - duration),
    inStartOffset: 0,
    incomingRate: 1,
    tempoRelease: 0,
    bassSwap: false,
    sweep: false,
    curve,
    label: `Crossfade · ${duration.toFixed(1)}s`,
    reason: `The outgoing track fades out over ${duration.toFixed(1)} seconds while the next one fades in.`,
  }
}

export interface PlanContext {
  /** Real duration of the outgoing track, from the audio element. */
  durationA: number
  /** Where playback currently is, so a plan is never scheduled in the past. */
  currentTime: number
}

/**
 * Build the transition from `current` to `next`.
 *
 * Analysis is only awaited for InjeKt; with InjeKt off this returns
 * synchronously-shaped plans without touching the network.
 */
export async function planTransition(
  current: Song,
  next: Song,
  context: PlanContext,
): Promise<TransitionPlan> {
  const s = settings()
  const durationA = context.durationA || current.duration || 0

  if (durationA <= 0) return gaplessPlan(durationA)

  if (!s.injektEnabled) {
    if (!s.crossfadeEnabled || s.crossfadeSeconds <= 0) {
      return s.gapless ? gaplessPlan(durationA) : hardCutPlan(durationA)
    }
    return crossfadePlan(durationA, s.crossfadeSeconds, s.crossfadeCurve)
  }

  // InjeKt needs to know both tracks. Analysis is cached, so this is usually
  // instant; the first time it costs one low-bitrate fetch per track.
  let analysisA: TrackAnalysis | null = null
  let analysisB: TrackAnalysis | null = null
  try {
    analysisA = (await getAnalysis(current.id)) ?? (await analyseTrack(current))
    analysisB = (await getAnalysis(next.id)) ?? (await analyseTrack(next))
  } catch {
    /* fall through to a plain crossfade */
  }

  if (!analysisA || !analysisB || !analysisA.bpm || !analysisB.bpm) {
    return crossfadePlan(
      durationA,
      s.crossfadeEnabled ? s.crossfadeSeconds : 4,
      s.crossfadeCurve,
    )
  }

  const bpmA = analysisA.bpm
  const bpmB = analysisB.bpm

  // Consider half/double time too — a 140 BPM track mixes fine into a 70 BPM one.
  const candidates = [bpmB, bpmB * 2, bpmB / 2]
  let bestRate = 1
  let bestShift = Infinity
  for (const candidate of candidates) {
    if (candidate < 50 || candidate > 220) continue
    const rate = bpmA / candidate
    const shift = Math.abs(rate - 1)
    if (shift < bestShift) {
      bestShift = shift
      bestRate = rate
    }
  }

  const maxShift = s.injektMaxTempoShift / 100
  const confident = analysisA.bpmConfidence >= 0.2 && analysisB.bpmConfidence >= 0.2
  const beatMatch = s.injektBeatMatch && confident && bestShift <= maxShift

  const keyDistance = camelotDistance(analysisA.camelot, analysisB.camelot)
  const harmonicClash = s.injektHarmonic && keyDistance > 2
  const energyDelta = Math.abs(analysisA.energy - analysisB.energy)

  // A calm blend gets long bars; a jarring pair gets a short, decisive one.
  let bars = s.injektBars
  if (energyDelta > 0.35) bars = Math.min(bars, 4)
  if (harmonicClash) bars = Math.min(bars, 4)
  if (!beatMatch) bars = Math.min(bars, 4)

  const barSeconds = (60 / bpmA) * 4
  let duration = clamp(bars * barSeconds, MIN_TRANSITION, MAX_TRANSITION)
  duration = Math.min(duration, durationA * 0.35)

  // Prefer the musical outro; never start before "now" and never overrun.
  const latestStart = durationA - duration
  let startAt = Math.min(analysisA.outroStart, latestStart)
  startAt = Math.max(startAt, context.currentTime + 1)

  // The blend has to begin on a bar of the outgoing track, otherwise the two
  // beat grids meet at an arbitrary offset and "beat-matched" means nothing.
  // Snapping happens *after* the clamp above, so a plan pushed forward to
  // avoid the past does not quietly lose its alignment.
  if (beatMatch) {
    const aligned = snapDownToBar(analysisA, startAt)
    startAt = aligned >= context.currentTime + 0.5 ? aligned : aligned + barSeconds
  }

  startAt = clamp(startAt, 0, Math.max(0, durationA - 0.5))
  // Shorten rather than overrun if alignment pushed the start point late.
  duration = Math.min(duration, Math.max(0.5, durationA - startAt))

  // Where the next track comes in: skip a long intro, land on a downbeat.
  let inStartOffset = 0
  if (s.injektSkipIntro && analysisB.introEnd > 2.5) {
    inStartOffset = Math.min(analysisB.introEnd, 45)
  }
  if (beatMatch) {
    inStartOffset = snapUpToBar(analysisB, inStartOffset)
  }
  inStartOffset = clamp(inStartOffset, 0, Math.max(0, (next.duration ?? analysisB.duration) - 30))

  const type: TransitionType = harmonicClash ? 'sweep' : beatMatch ? 'blend' : 'crossfade'
  const incomingRate = beatMatch ? clamp(bestRate, 0.75, 1.35) : 1
  const matchedBpm = bpmB * incomingRate

  const details: string[] = []
  if (beatMatch) {
    details.push(
      `Beat-matched ${bpmB.toFixed(0)} → ${matchedBpm.toFixed(0)} BPM (${((incomingRate - 1) * 100).toFixed(1)}%)`,
    )
  } else {
    details.push(`${bpmA.toFixed(0)} BPM into ${bpmB.toFixed(0)} BPM, tempos too far apart to match`)
  }
  details.push(`keys ${analysisA.camelot} → ${analysisB.camelot}`)
  if (harmonicClash) details.push('keys clash, so the outgoing track is filtered out instead of blended')
  if (inStartOffset > 1) details.push(`intro skipped to ${inStartOffset.toFixed(1)}s`)

  const label = beatMatch
    ? `InjeKt · ${bpmA.toFixed(0)}→${matchedBpm.toFixed(0)} BPM · ${bars} bars`
    : `InjeKt · ${duration.toFixed(1)}s ${harmonicClash ? 'sweep' : 'blend'}`

  return {
    type,
    duration,
    startAt,
    inStartOffset,
    incomingRate,
    tempoRelease: beatMatch ? clamp((60 / bpmB) * 4 * 8, 4, 30) : 0,
    bassSwap: s.injektBassSwap && (type === 'blend' || type === 'sweep'),
    sweep: type === 'sweep',
    curve: type === 'sweep' ? 'sharp' : 'equalPower',
    label,
    reason: details.join(' · '),
  }
}

// --------------------------------------------------------------- auto queue --

/**
 * How well `candidate` follows `from`, 0..1. Used to keep the flow going when
 * the queue runs out. Candidates are scored on our own analysis, so the next
 * track is one that will actually mix.
 */
export function affinity(from: TrackAnalysis, candidate: TrackAnalysis): number {
  const tempoRatio = from.bpm > 0 && candidate.bpm > 0 ? candidate.bpm / from.bpm : 1
  const tempoDistance = Math.min(
    Math.abs(tempoRatio - 1),
    Math.abs(tempoRatio - 2) / 2,
    Math.abs(tempoRatio - 0.5) * 2,
  )
  const tempoScore = Math.exp(-tempoDistance * 10)
  const keyScore = 1 - Math.min(1, camelotDistance(from.camelot, candidate.camelot) / 6)
  const energyScore = 1 - Math.min(1, Math.abs(from.energy - candidate.energy) * 1.6)
  const brightnessScore = 1 - Math.min(1, Math.abs(from.brightness - candidate.brightness) * 1.4)
  return tempoScore * 0.4 + keyScore * 0.25 + energyScore * 0.25 + brightnessScore * 0.1
}

export interface AutoQueueOptions {
  count?: number
  exclude?: Set<string>
}

/**
 * Pick tracks to continue the session with.
 *
 * Candidates come from the server's similarity endpoint first (it knows about
 * Last.fm-style relationships), then the same artist, then the same genre, and
 * finally anything in the library. Whatever we get is re-ranked by mixability
 * using cached analysis — we never analyse dozens of tracks just to sort them.
 */
export async function buildAutoQueue(
  seed: Song,
  options: AutoQueueOptions = {},
): Promise<Song[]> {
  const count = options.count ?? 10
  const exclude = options.exclude ?? new Set<string>()
  const pool = new Map<string, Song>()

  const add = (songs: Song[]) => {
    for (const song of songs) {
      if (song.id === seed.id || exclude.has(song.id) || pool.has(song.id)) continue
      pool.set(song.id, song)
    }
  }

  const client = maybeClient()
  if (client) {
    try {
      add(await client.getSimilarSongs2(seed.id, 60))
    } catch {
      /* similarity needs Last.fm configured; carry on */
    }
  }

  if (pool.size < count * 3 && seed.artistId) {
    try {
      add(await songsByArtist(seed.artistId))
    } catch {
      /* ignore */
    }
  }

  if (pool.size < count * 3) {
    const everything = await allSongs()
    const genre = seed.genre
    const sameGenre = genre ? everything.filter((song) => song.genre === genre) : []
    const source = sameGenre.length >= count * 3 ? sameGenre : everything
    // Sample randomly rather than taking the alphabetical head of the library.
    for (let i = 0; i < Math.min(300, source.length); i++) {
      const song = source[Math.floor(Math.random() * source.length)]
      if (song) add([song])
    }
  }

  const candidates = [...pool.values()]
  if (!candidates.length) return []

  const seedAnalysis = await getAnalysis(seed.id)
  if (!seedAnalysis) {
    return shuffle(candidates).slice(0, count)
  }

  const scored: { song: Song; score: number }[] = []
  for (const song of candidates) {
    const analysis = await getAnalysis(song.id)
    // Unanalysed tracks get a middling score so they still get a turn.
    const score = analysis ? affinity(seedAnalysis, analysis) : 0.45 + Math.random() * 0.1
    scored.push({ song, score })
  }

  scored.sort((a, b) => b.score - a.score)
  // Keep it from becoming repetitive: take the best 3x and shuffle lightly.
  const top = scored.slice(0, Math.max(count, count * 3)).map((entry) => entry.song)
  return shuffle(top).slice(0, count)
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
