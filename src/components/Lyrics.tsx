import { useEffect, useRef, useState } from 'react'
import type { Song, StructuredLyrics } from '@/api/types'
import { maybeClient } from '@/api/subsonic'
import { engine } from '@/audio/engine'
import { Spinner } from './ui'

interface Line {
  start: number | null
  text: string
}

/**
 * Lyrics pane. Prefers OpenSubsonic's `getLyricsBySongId`, which can return
 * time-synced lines; falls back to the classic unsynced endpoint.
 */
export function Lyrics({ song }: { song: Song }) {
  const [lines, setLines] = useState<Line[] | null>(null)
  const [synced, setSynced] = useState(false)
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLines(null)
    setSynced(false)

    const load = async () => {
      const client = maybeClient()
      if (!client) return

      let structured: StructuredLyrics[] = []
      try {
        structured = await client.getLyricsBySongId(song.id)
      } catch {
        /* older servers do not implement it */
      }

      const best = structured.find((entry) => entry.synced && entry.line?.length) ?? structured[0]
      if (best?.line?.length) {
        if (cancelled) return
        const offset = (best.offset ?? 0) / 1000
        setLines(
          best.line.map((line) => ({
            start: line.start !== undefined ? line.start / 1000 + offset : null,
            text: line.value,
          })),
        )
        setSynced(Boolean(best.synced))
        setLoading(false)
        return
      }

      try {
        const plain = await client.getLyrics(song.artist, song.title)
        if (cancelled) return
        if (plain?.value?.trim()) {
          setLines(plain.value.split(/\r?\n/).map((text) => ({ start: null, text })))
        } else {
          setLines([])
        }
      } catch {
        if (!cancelled) setLines([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [song.id, song.artist, song.title])

  // Follow playback on animation frames, but only re-render when the active
  // line actually changes — once every few seconds instead of sixty times a
  // second.
  useEffect(() => {
    if (!synced || !lines?.length) {
      setActiveIndex(-1)
      return
    }
    let raf = 0
    let current = -1
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const time = engine.currentTime
      let index = -1
      for (let i = 0; i < lines.length; i++) {
        const start = lines[i].start
        if (start !== null && start <= time + 0.15) index = i
        else if (start !== null) break
      }
      if (index !== current) {
        current = index
        setActiveIndex(index)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lines, synced])

  useEffect(() => {
    if (activeIndex < 0 || !containerRef.current) return
    const element = containerRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIndex])

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 30 }}>
        <Spinner />
      </div>
    )
  }

  if (!lines?.length) {
    return (
      <p className="row__hint" style={{ padding: 12 }}>
        No lyrics for this track. Navidrome reads lyrics from the file's tags (or a matching
        <code> .lrc</code> file next to it) — add them there and they will show up here, time-synced
        if the <code>.lrc</code> has timestamps.
      </p>
    )
  }

  return (
    <div className="lyrics" ref={containerRef}>
      {lines.map((line, index) => (
        <p
          key={index}
          data-index={index}
          className="lyrics__line"
          data-active={synced && index === activeIndex}
          data-past={synced && index < activeIndex}
        >
          {line.text || ' '}
        </p>
      ))}
    </div>
  )
}
