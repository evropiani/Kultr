import { useEffect, useRef } from 'react'
import { engine } from '@/audio/engine'
import { useSettings } from '@/store/settings'

/**
 * Frequency-bar visualizer driven straight off the engine's analyser node.
 * Only available in Web Audio mode — in compatibility mode there is no tap
 * point on the signal, so we say so rather than faking it.
 */
export function Visualizer({ height = 120 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const accent = useSettings((state) => state.accent)

  useEffect(() => {
    const canvas = canvasRef.current
    const analyser = engine.analyserNode
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const bins = analyser.frequencyBinCount
    const data = new Uint8Array(bins)
    let raf = 0
    let smoothed: number[] = []

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const styles = getComputedStyle(document.documentElement)
    const readAccent = () =>
      `${styles.getPropertyValue('--accent-r').trim() || 124} ${
        styles.getPropertyValue('--accent-g').trim() || 140
      } ${styles.getPropertyValue('--accent-b').trim() || 255}`

    const draw = () => {
      raf = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(data)

      const rect = canvas.getBoundingClientRect()
      const width = rect.width
      const tall = rect.height
      ctx.clearRect(0, 0, width, tall)

      const bars = Math.max(24, Math.min(72, Math.floor(width / 9)))
      const gap = 3
      const barWidth = (width - gap * (bars - 1)) / bars
      if (smoothed.length !== bars) smoothed = new Array(bars).fill(0)

      const rgb = readAccent()

      for (let i = 0; i < bars; i++) {
        // Logarithmic bucketing so bass does not dominate the display.
        const from = Math.floor(Math.pow(i / bars, 1.7) * bins)
        const to = Math.max(from + 1, Math.floor(Math.pow((i + 1) / bars, 1.7) * bins))
        let sum = 0
        for (let j = from; j < to; j++) sum += data[j]
        const value = sum / (to - from) / 255

        smoothed[i] = smoothed[i] * 0.72 + value * 0.28
        const barHeight = Math.max(2, smoothed[i] * tall * 0.95)
        const x = i * (barWidth + gap)
        const y = tall - barHeight

        const gradient = ctx.createLinearGradient(0, y, 0, tall)
        gradient.addColorStop(0, `rgb(${rgb} / 0.95)`)
        gradient.addColorStop(1, `rgb(${rgb} / 0.25)`)
        ctx.fillStyle = gradient
        ctx.beginPath()
        const radius = Math.min(barWidth / 2, 3)
        ctx.roundRect(x, y, barWidth, barHeight, radius)
        ctx.fill()
      }
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [accent])

  if (!engine.analyserNode) {
    return (
      <p className="row__hint" style={{ padding: 12 }}>
        The visualizer needs Web Audio, which is unavailable in compatibility mode. Serving Kultr and
        Navidrome from the same origin (see the reverse-proxy guide) turns it back on.
      </p>
    )
  }

  return <canvas ref={canvasRef} className="viz" style={{ height }} aria-hidden="true" />
}
