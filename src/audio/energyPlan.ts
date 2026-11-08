import type { Song } from '@/api/types'
import type { TrackAnalysis } from './analysis'
import { camelotDistance } from './dsp'

/**
 * The energy planner: draw how a set should feel, calm to peak, and Kultr
 * builds one that follows the line, with tempos and keys that mix. Ported
 * from Kultr for iOS (EnergyPlan.swift).
 */

/** The shape of a set: energy from 0 to 1 at evenly spaced points from its start to its end. */
export type EnergyCurve = number[]

/** A curve with at least two points, each clamped to 0–1. */
export function curve(points: number[]): EnergyCurve {
  return points.length >= 2 ? points.map((p) => Math.min(1, Math.max(0, p))) : [0.5, 0.5]
}

/** Where the line is at `fraction` (0 to 1) of the set. */
export function valueAt(points: EnergyCurve, fraction: number): number {
  const c = curve(points)
  const f = Math.min(1, Math.max(0, fraction)) * (c.length - 1)
  const i = Math.min(c.length - 2, Math.floor(f))
  const t = f - i
  return c[i] * (1 - t) + c[i + 1] * t
}

/** The same shape with `count` points, for drawing over. */
export function resampled(points: EnergyCurve, count: number): EnergyCurve {
  const n = Math.max(2, count)
  return Array.from({ length: n }, (_, i) => valueAt(points, i / Math.max(1, n - 1)))
}

export const CURVES: { id: string; name: string; points: EnergyCurve }[] = [
  { id: 'warm-up-and-peak', name: 'Warm up and peak', points: [0.35, 0.5, 0.65, 0.8, 0.95, 0.9, 0.7, 0.5] },
  { id: 'steady', name: 'Steady', points: [0.6, 0.6] },
  { id: 'build', name: 'Build', points: [0.3, 0.95] },
  { id: 'wind-down', name: 'Wind down', points: [0.7, 0.45, 0.25, 0.15] },
]

/** One track of a planned set: when it starts, and the energy the line asked for there. */
export interface PlannedTrack {
  song: Song
  energy: number
  target: number
  /** Seconds from the start of the set. */
  startsAt: number
}

type Mixable = Pick<TrackAnalysis, 'bpm' | 'camelot'>

/** How well `b` mixes out of `a`: close tempo (or half or double) and a neighbouring key. */
export function mixScore(a: Mixable, b: Mixable): number {
  const ratio = a.bpm > 0 && b.bpm > 0 ? b.bpm / a.bpm : 1
  const tempoDistance = Math.min(Math.abs(ratio - 1), Math.abs(ratio - 2) / 2, Math.abs(ratio - 0.5) * 2)
  const tempo = Math.exp(-tempoDistance * 10)
  const key = 1 - Math.min(1, camelotDistance(a.camelot, b.camelot) / 6)
  return tempo * 0.6 + key * 0.4
}

/**
 * A set of about `minutes` that follows `points`: each next track is the one
 * whose energy is closest to where the line is at that moment, that mixes
 * well out of the one before (tempo and key), isn't by the same artist and
 * hasn't been used. Mixes overlap by `overlap` seconds.
 */
export function planSet(
  points: EnergyCurve,
  minutes: number,
  candidates: [Song, Pick<TrackAnalysis, 'bpm' | 'camelot' | 'energy' | 'duration'>][],
  overlap = 8,
  random: () => number = Math.random,
): PlannedTrack[] {
  const total = Math.max(1, minutes) * 60
  const used = new Set<string>()
  const usable = candidates.filter(([song, analysis]) => analysis.duration >= 60 && !song.kultrStreamUrl)
  const out: PlannedTrack[] = []
  let elapsed = 0
  let previous: (typeof usable)[number] | null = null
  while (elapsed < total && out.length < 300) {
    const target = valueAt(points, elapsed / total)
    let best: (typeof usable)[number] | null = null
    let bestScore = -Infinity
    for (const candidate of usable) {
      if (used.has(candidate[0].id)) continue
      const fit = 1 - Math.min(1, Math.abs(candidate[1].energy - target) * 3)
      let score = fit * 0.65 + (previous ? mixScore(previous[1], candidate[1]) : 1) * 0.35
      if (previous && previous[0].artistId && previous[0].artistId === candidate[0].artistId) score *= 0.7
      score += random() * 0.04
      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }
    if (!best) break
    used.add(best[0].id)
    out.push({ song: best[0], energy: best[1].energy, target, startsAt: elapsed })
    elapsed += Math.max(30, best[1].duration - overlap)
    previous = best
  }
  return out
}
