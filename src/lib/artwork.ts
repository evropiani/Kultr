import { maybeClient } from '@/api/subsonic'
import type { Album, Artist, Song } from '@/api/types'

/** Cover art URL for anything that has artwork, with a size hint. */
export function artUrl(
  item: Song | Album | Artist | { coverArt?: string; id?: string } | null | undefined,
  size = 300,
): string {
  if (!item) return ''
  const client = maybeClient()
  if (!client) return ''
  const coverArt =
    (item as Song).coverArt ??
    (item as Song).albumId ??
    (item as { id?: string }).id ??
    undefined
  return client.coverArtUrl(coverArt, size)
}

const paletteCache = new Map<string, [number, number, number]>()

/**
 * Sample a dominant, reasonably saturated colour from artwork.
 *
 * Used to tint the translucent surfaces so the whole UI picks up the colour of
 * whatever is playing. Falls back silently when the image cannot be read.
 */
export async function dominantColor(url: string): Promise<[number, number, number] | null> {
  if (!url) return null
  const cached = paletteCache.get(url)
  if (cached) return cached

  try {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.src = url
    await image.decode()

    const size = 48
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(image, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    // Bucket colours coarsely and pick the most common one that is neither
    // near-black, near-white, nor fully desaturated.
    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const alpha = data[i + 3]
      if (alpha < 200) continue
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (luma < 28 || luma > 235) continue
      const saturation = max === 0 ? 0 : (max - min) / max
      if (saturation < 0.12) continue
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
      bucket.count++
      bucket.r += r
      bucket.g += g
      bucket.b += b
      buckets.set(key, bucket)
    }

    let best: { count: number; r: number; g: number; b: number } | null = null
    for (const bucket of buckets.values()) {
      if (!best || bucket.count > best.count) best = bucket
    }
    if (!best) return null

    const rgb: [number, number, number] = [
      Math.round(best.r / best.count),
      Math.round(best.g / best.count),
      Math.round(best.b / best.count),
    ]
    const lifted = liftForUi(rgb)
    paletteCache.set(url, lifted)
    return lifted
  } catch {
    return null
  }
}

/** Nudge a sampled colour into a range that still reads as an accent on glass. */
function liftForUi([r, g, b]: [number, number, number]): [number, number, number] {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  let scale = 1
  if (luma < 90) scale = 90 / Math.max(luma, 1)
  if (luma > 200) scale = 200 / luma
  return [
    Math.round(Math.min(255, r * scale)),
    Math.round(Math.min(255, g * scale)),
    Math.round(Math.min(255, b * scale)),
  ]
}

type Rgb = [number, number, number]

/** Relative luminance (WCAG), 0 for black to 1 for white. */
export function luminance([r, g, b]: Rgb): number {
  const linear = (c: number) => {
    const x = c / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function toHsv([r, g, b]: Rgb): [number, number, number] {
  const [x, y, z] = [r / 255, g / 255, b / 255]
  const max = Math.max(x, y, z)
  const d = max - Math.min(x, y, z)
  let h = 0
  if (d > 0) {
    if (max === x) h = ((y - z) / d + 6) % 6
    else if (max === y) h = (z - x) / d + 2
    else h = (x - y) / d + 4
  }
  return [h / 6, max === 0 ? 0 : d / max, max]
}

function fromHsv(h: number, s: number, v: number): Rgb {
  const i = Math.floor(h * 6) % 6
  const f = h * 6 - Math.floor(h * 6)
  const [p, q, t] = [v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)]
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i]
  return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)]
}

/**
 * The colour darkened until its luminance is at most 0.15, so it reads as
 * text on cream (4.5:1). Hue stays, and pale colours gain a little saturation
 * so they turn deeper rather than grey. Kultr for iOS does the same, so an
 * accent looks alike on both.
 */
export function readableOnLight(rgb: Rgb): Rgb {
  const target = 0.15
  if (luminance(rgb) <= target) return rgb
  const [h, s0, v0] = toHsv(rgb)
  const s = s0 > 0.05 ? Math.min(1, Math.max(s0, 0.45) * 1.1) : s0
  let color = rgb
  for (let v = v0; v > 0.3; v -= 0.02) {
    color = fromHsv(h, s, v)
    if (luminance(color) <= target) break
  }
  return color
}

/** Whichever of white and warm ink reads better on the accent. */
export function onAccent(rgb: Rgb): Rgb {
  return luminance(rgb) > 0.2 ? [31, 26, 20] : [255, 255, 255]
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}
