import { useEffect, useState } from 'react'
import { getAnalysis } from '@/db'

/**
 * The beats of a track, from InjeKt's analysis, when it is sure enough of
 * the tempo. A track that has just started is usually still being analysed,
 * so it looks again for a while until the analysis is there.
 */
export function useBeatGrid(songId: string | undefined): { bpm: number; offset: number } | null {
  const [grid, setGrid] = useState<{ bpm: number; offset: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    let timer = 0
    let tries = 0
    setGrid(null)
    if (!songId) return
    const look = () => {
      void getAnalysis(songId)
        .then((analysis) => {
          if (cancelled) return
          if (analysis && analysis.bpm > 0) {
            if (analysis.bpmConfidence >= 0.25) setGrid({ bpm: analysis.bpm, offset: analysis.downbeatOffset || analysis.beatOffset || 0 })
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
  return grid
}
