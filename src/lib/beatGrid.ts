import { useEffect, useMemo, useState } from 'react'
import type { TrackAnalysis } from '@/audio/analysis'
import { getAnalysis } from '@/db'

/**
 * InjeKt's analysis of a track. A track that has just started is usually
 * still being analysed, so it looks again for a while until it is there.
 */
export function useTrackAnalysis(songId: string | undefined): TrackAnalysis | null {
  const [analysis, setAnalysis] = useState<TrackAnalysis | null>(null)
  useEffect(() => {
    let cancelled = false
    let timer = 0
    let tries = 0
    setAnalysis(null)
    if (!songId) return
    const look = () => {
      void getAnalysis(songId)
        .then((found) => {
          if (cancelled) return
          if (found) {
            setAnalysis(found)
            return
          }
          if (++tries < 15) timer = window.setTimeout(look, 2000)
        })
        .catch(() => {})
    }
    look()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [songId])
  return analysis
}

/** The beats of a track, when InjeKt is sure enough of the tempo. */
export function useBeatGrid(songId: string | undefined): { bpm: number; offset: number } | null {
  const analysis = useTrackAnalysis(songId)
  return useMemo(
    () => (!analysis || analysis.bpm <= 0 || analysis.bpmConfidence < 0.25 ? null : { bpm: analysis.bpm, offset: analysis.downbeatOffset || analysis.beatOffset || 0 }),
    [analysis],
  )
}
