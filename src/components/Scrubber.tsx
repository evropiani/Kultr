import { useCallback, useEffect, useRef, useState } from 'react'
import { formatTime } from '@/lib/format'

/**
 * Progress bar with drag-to-seek.
 *
 * The position is read through `getTime` on every animation frame and written
 * *straight to the DOM* — no React state. A 60 Hz `setState` would re-render
 * the whole player subtree sixty times a second for the entire length of every
 * track, which costs real battery and never lets the page go idle.
 *
 * When a transition is scheduled we shade the overlap region, so you can see
 * exactly where the next track will start bleeding in.
 */
export function Scrubber({
  getTime,
  duration,
  onSeek,
  overlap,
  compact,
  active = true,
}: {
  getTime: () => number
  duration: number
  onSeek: (seconds: number) => void
  overlap?: { start: number; duration: number } | null
  compact?: boolean
  /** While false the paint loop is not scheduled at all. */
  active?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef<HTMLSpanElement>(null)
  const [dragging, setDragging] = useState(false)
  const previewRef = useRef(0)

  const positionFromEvent = useCallback(
    (clientX: number) => {
      const element = trackRef.current
      if (!element || duration <= 0) return 0
      const rect = element.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * duration
    },
    [duration],
  )

  // Paint the current position without going through React, and only when the
  // result would actually look different. Writing an unchanged width every
  // frame keeps the compositor busy for nothing and stops the page ever
  // reaching idle.
  useEffect(() => {
    if (!active && !dragging) return

    let raf = 0
    let lastLabel = ''
    let lastPixel = -1

    const paint = () => {
      raf = requestAnimationFrame(paint)
      const seconds = dragging ? previewRef.current : getTime()
      const percent = duration > 0 ? Math.min(100, Math.max(0, (seconds / duration) * 100)) : 0

      // Quantise to whole pixels of the actual track width: on a four-minute
      // track that is about two writes a second instead of sixty.
      const width = trackRef.current?.clientWidth ?? 0
      const pixel = Math.round((percent / 100) * width)
      if (pixel !== lastPixel) {
        lastPixel = pixel
        if (fillRef.current) fillRef.current.style.width = `${percent}%`
        if (knobRef.current) knobRef.current.style.left = `${percent}%`
      }

      const label = formatTime(seconds)
      if (label !== lastLabel && elapsedRef.current) {
        elapsedRef.current.textContent = label
        lastLabel = label
      }
    }

    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [getTime, duration, dragging, active])

  useEffect(() => {
    if (!dragging) return
    const onMove = (event: PointerEvent) => {
      previewRef.current = positionFromEvent(event.clientX)
    }
    const onUp = (event: PointerEvent) => {
      onSeek(positionFromEvent(event.clientX))
      setDragging(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, onSeek, positionFromEvent])

  useEffect(() => {
    if (active || dragging) return
    const percent = duration > 0 ? Math.min(100, Math.max(0, (getTime() / duration) * 100)) : 0
    if (fillRef.current) fillRef.current.style.width = `${percent}%`
    if (knobRef.current) knobRef.current.style.left = `${percent}%`
    if (elapsedRef.current) elapsedRef.current.textContent = formatTime(getTime())
  }, [active, dragging, duration, getTime])

  const overlapLeft = overlap && duration > 0 ? (overlap.start / duration) * 100 : 0
  const overlapWidth = overlap && duration > 0 ? (overlap.duration / duration) * 100 : 0

  return (
    <div className="player__scrub">
      {!compact ? <span ref={elapsedRef}>0:00</span> : null}
      <div
        ref={trackRef}
        className="scrub"
        data-dragging={dragging}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(getTime())}
        aria-valuetext={`${formatTime(getTime())} of ${formatTime(duration)}`}
        onPointerDown={(event) => {
          if (duration <= 0) return
          previewRef.current = positionFromEvent(event.clientX)
          setDragging(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') onSeek(Math.min(duration, getTime() + 5))
          if (event.key === 'ArrowLeft') onSeek(Math.max(0, getTime() - 5))
        }}
      >
        <div className="scrub__track">
          {overlap && overlapWidth > 0 ? (
            <div
              className="scrub__overlap"
              style={{ left: `${overlapLeft}%`, width: `${overlapWidth}%` }}
              title="Crossfade region"
            />
          ) : null}
          <div ref={fillRef} className="scrub__fill" style={{ width: '0%' }} />
        </div>
        <div ref={knobRef} className="scrub__knob" style={{ left: '0%' }} />
      </div>
      {!compact ? <span>{formatTime(duration)}</span> : null}
    </div>
  )
}
