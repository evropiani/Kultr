import type { TrackAnalysis } from './analysis'
import { camelotDistance } from './dsp'

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
