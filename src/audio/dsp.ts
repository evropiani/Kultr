/**
 * Pure-JS signal analysis used by InjeKt.
 *
 * Everything here works on a mono Float32Array and has no DOM dependencies, so
 * it can run inside a Web Worker. The goal is not musicological perfection —
 * it is to know, for every track, roughly:
 *
 *   - how fast it is (BPM) and where its beats/downbeats land,
 *   - what key it is in (for harmonic mixing),
 *   - how loud and how bright it is (for level and EQ matching),
 *   - where the intro stops being an intro and the outro starts.
 *
 * That is enough to plan a beat-matched, harmonically sensible transition.
 */

const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const

/** Camelot wheel position per pitch class, for major and minor keys. */
const MAJOR_CAMELOT = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1]
const MINOR_CAMELOT = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10]

/** Krumhansl–Schmuckler key profiles. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

export const FFT_SIZE = 1024
export const HOP_SIZE = 512

/** Iterative radix-2 Cooley–Tukey FFT with precomputed twiddle tables. */
export class FFT {
  readonly size: number
  private readonly cos: Float32Array
  private readonly sin: Float32Array
  private readonly rev: Uint32Array

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error('FFT size must be a power of two')
    }
    this.size = size
    this.cos = new Float32Array(size / 2)
    this.sin = new Float32Array(size / 2)
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / size)
      this.sin[i] = Math.sin((-2 * Math.PI * i) / size)
    }
    this.rev = new Uint32Array(size)
    const bits = Math.log2(size)
    for (let i = 0; i < size; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b)
      this.rev[i] = r
    }
  }

  /** In-place complex FFT. */
  transform(re: Float32Array, im: Float32Array): void {
    const n = this.size
    for (let i = 0; i < n; i++) {
      const j = this.rev[i]
      if (j > i) {
        let tmp = re[i]
        re[i] = re[j]
        re[j] = tmp
        tmp = im[i]
        im[i] = im[j]
        im[j] = tmp
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1
      const step = n / len
      for (let i = 0; i < n; i += len) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const c = this.cos[k]
          const s = this.sin[k]
          const ar = re[i + j + half]
          const ai = im[i + j + half]
          const tr = ar * c - ai * s
          const ti = ar * s + ai * c
          re[i + j + half] = re[i + j] - tr
          im[i + j + half] = im[i + j] - ti
          re[i + j] += tr
          im[i + j] += ti
        }
      }
    }
  }
}

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size)
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))
  return w
}

export interface SpectralFeatures {
  /** Onset strength per frame (spectral flux, half-wave rectified). */
  onset: Float32Array
  /** RMS per frame, linear. */
  rms: Float32Array
  /** Spectral centroid per frame, in Hz. */
  centroid: Float32Array
  /** Summed chroma vector over the whole signal. */
  chroma: Float32Array
  /** Frames per second of the frame-rate features. */
  fps: number
}

/** One STFT pass that produces every frame-rate feature we need. */
export function spectralFeatures(pcm: Float32Array, sampleRate: number): SpectralFeatures {
  const fft = new FFT(FFT_SIZE)
  const window = hannWindow(FFT_SIZE)
  const frames = Math.max(1, Math.floor((pcm.length - FFT_SIZE) / HOP_SIZE) + 1)
  const onset = new Float32Array(frames)
  const rms = new Float32Array(frames)
  const centroid = new Float32Array(frames)
  const chroma = new Float32Array(12)

  const re = new Float32Array(FFT_SIZE)
  const im = new Float32Array(FFT_SIZE)
  const bins = FFT_SIZE / 2
  const mag = new Float32Array(bins)
  const prevMag = new Float32Array(bins)
  const binHz = sampleRate / FFT_SIZE

  // Pre-map bins to pitch classes once; bins outside the musical range map to -1.
  const binPitch = new Int8Array(bins)
  for (let b = 0; b < bins; b++) {
    const hz = b * binHz
    if (hz < 65 || hz > 2200) {
      binPitch[b] = -1
      continue
    }
    const midi = 69 + 12 * Math.log2(hz / 440)
    binPitch[b] = ((Math.round(midi) % 12) + 12) % 12
  }

  for (let f = 0; f < frames; f++) {
    const start = f * HOP_SIZE
    let sumSquares = 0
    for (let i = 0; i < FFT_SIZE; i++) {
      const sample = pcm[start + i] ?? 0
      sumSquares += sample * sample
      re[i] = sample * window[i]
      im[i] = 0
    }
    rms[f] = Math.sqrt(sumSquares / FFT_SIZE)

    fft.transform(re, im)

    let flux = 0
    let weighted = 0
    let total = 0
    for (let b = 0; b < bins; b++) {
      const m = Math.hypot(re[b], im[b])
      mag[b] = m
      const diff = m - prevMag[b]
      if (diff > 0) flux += diff
      weighted += m * b * binHz
      total += m
      const pc = binPitch[b]
      // Chroma only needs a coarse picture; sample every 4th frame.
      if (pc >= 0 && (f & 3) === 0) chroma[pc] += m * m
    }
    onset[f] = flux
    centroid[f] = total > 1e-9 ? weighted / total : 0
    prevMag.set(mag)
  }

  return { onset, rms, centroid, chroma, fps: sampleRate / HOP_SIZE }
}

/** Subtract a moving average and half-wave rectify, which sharpens onsets. */
export function normalizeOnset(onset: Float32Array, fps: number): Float32Array {
  const out = new Float32Array(onset.length)
  const half = Math.max(1, Math.round(fps * 0.15))
  let sum = 0
  for (let i = 0; i < onset.length; i++) {
    sum += onset[i]
    if (i >= half * 2 + 1) sum -= onset[i - (half * 2 + 1)]
    const count = Math.min(i + 1, half * 2 + 1)
    const mean = sum / count
    out[i] = Math.max(0, onset[i] - mean)
  }
  let peak = 0
  for (const value of out) if (value > peak) peak = value
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak
  return out
}

/** Autocorrelation at an integer lag, normalised by the overlap length. */
function acfAt(signal: Float32Array, lag: number): number {
  const limit = signal.length - lag
  if (limit <= 0) return 0
  let sum = 0
  for (let i = 0; i < limit; i++) sum += signal[i] * signal[i + lag]
  return sum / limit
}

export interface TempoResult {
  bpm: number
  confidence: number
  /** Seconds from the start of the signal to the first beat. */
  beatOffset: number
  /** Seconds from the start of the signal to the first downbeat (4/4 assumed). */
  downbeatOffset: number
  /**
   * A downbeat anchored near the END of the track.
   *
   * Even a 0.3% tempo error puts a grid fitted at 0:00 a whole beat out by
   * 4:00, and the mix-out point is exactly where being out matters. So we fit
   * the phase twice and let InjeKt use whichever anchor is closer to the
   * point it is snapping.
   */
  outroDownbeat: number
}

/**
 * Correlate the onset envelope against a unit pulse train of the given period
 * over [from, to). The magnitude says how well that period fits; the argument
 * gives the phase, i.e. where the pulses actually land.
 */
function combFit(
  env: Float32Array,
  period: number,
  from: number,
  to: number,
): { magnitude: number; offset: number } {
  let re = 0
  let im = 0
  const step = (2 * Math.PI) / period
  for (let n = from; n < to; n++) {
    const angle = step * (n - from)
    re += env[n] * Math.cos(angle)
    im += env[n] * Math.sin(angle)
  }
  const phase = Math.atan2(im, re)
  let offset = (phase / (2 * Math.PI)) * period
  offset = ((offset % period) + period) % period
  return { magnitude: Math.hypot(re, im), offset: from + offset }
}

export function detectTempo(onsetNorm: Float32Array, fps: number): TempoResult {
  const MIN_BPM = 62
  const MAX_BPM = 190

  const minLag = Math.max(2, Math.floor((60 / MAX_BPM) * fps))
  const maxLag = Math.min(
    Math.floor(onsetNorm.length / 2),
    Math.ceil((60 / MIN_BPM) * fps),
  )
  if (maxLag <= minLag + 1) {
    return { bpm: 120, confidence: 0, beatOffset: 0, downbeatOffset: 0, outroDownbeat: 0 }
  }

  // Autocorrelate once on the integer lag grid; everything else reads from it.
  const acf = new Float32Array(maxLag + 2)
  for (let lag = minLag; lag <= maxLag + 1; lag++) acf[lag] = acfAt(onsetNorm, lag)

  let bestLag = minLag
  let bestScore = -Infinity
  let scoreSum = 0
  let scoreCount = 0

  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = acf[lag]
    const double = lag * 2
    if (double <= maxLag) score += 0.55 * acf[double]
    const half = Math.round(lag / 2)
    if (half >= minLag) score += 0.25 * acf[half]
    // Prior: real dance/pop tempi cluster around 120, which suppresses the
    // classic half/double-time confusion without hard-coding a range.
    const bpm = (60 * fps) / lag
    score *= Math.exp(-0.5 * (Math.log2(bpm / 122) / 0.5) ** 2)
    scoreSum += score
    scoreCount++
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }

  // One integer frame is ~1.5 BPM wide at 174 BPM, which is far too coarse to
  // beat-match with. The autocorrelation peak only has to pick the right
  // octave; the precise period comes from a matched pulse train, whose
  // response sharpens with the length of the track.
  const length = onsetNorm.length
  let period = bestLag
  let bestMagnitude = -1
  const low = bestLag * 0.96
  const high = bestLag * 1.04
  const step = Math.max(0.0005, bestLag * 0.0002)
  for (let candidate = low; candidate <= high; candidate += step) {
    const { magnitude } = combFit(onsetNorm, candidate, 0, length)
    if (magnitude > bestMagnitude) {
      bestMagnitude = magnitude
      period = candidate
    }
  }

  const bestBpm = (60 * fps) / period
  const meanScore = scoreCount ? scoreSum / scoreCount : 0
  const confidence = meanScore > 1e-12 ? Math.min(1, (bestScore / meanScore - 1) / 4) : 0

  const beatOffset = combFit(onsetNorm, period, 0, length).offset

  // Which of the four beats in a bar carries the most weight.
  let bestBar = 0
  let bestBarScore = -1
  for (let b = 0; b < 4; b++) {
    let sum = 0
    for (let pos = beatOffset + b * period; pos < length; pos += period * 4) {
      sum += onsetNorm[Math.round(pos)] ?? 0
    }
    if (sum > bestBarScore) {
      bestBarScore = sum
      bestBar = b
    }
  }

  // Re-fit the phase over the tail so the mix-out grid is anchored where the
  // transition actually happens rather than four minutes earlier.
  const tailFrom = Math.max(0, length - Math.round(fps * 75))
  const tail = combFit(onsetNorm, period, tailFrom, length)
  const bar = period * 4
  // Keep the same beat-in-bar as the global fit.
  const barPhase = (beatOffset + bestBar * period) % bar
  let outroDownbeat = tail.offset + ((barPhase - (tail.offset % bar) + bar) % bar)
  if (outroDownbeat >= length) outroDownbeat -= bar

  return {
    bpm: Math.round(bestBpm * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    beatOffset: beatOffset / fps,
    downbeatOffset: (beatOffset + bestBar * period) / fps,
    outroDownbeat: Math.max(0, outroDownbeat) / fps,
  }
}

export interface KeyResult {
  key: number
  mode: 'major' | 'minor'
  confidence: number
  name: string
  camelot: string
}

function pearson(a: number[] | Float32Array, b: number[] | Float32Array): number {
  const n = a.length
  let sumA = 0
  let sumB = 0
  for (let i = 0; i < n; i++) {
    sumA += a[i]
    sumB += b[i]
  }
  const meanA = sumA / n
  const meanB = sumB / n
  let num = 0
  let denA = 0
  let denB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    denA += da * da
    denB += db * db
  }
  const den = Math.sqrt(denA * denB)
  return den > 1e-12 ? num / den : 0
}

export function detectKey(chroma: Float32Array): KeyResult {
  const rotated = new Float32Array(12)
  let best: KeyResult = {
    key: 0,
    mode: 'major',
    confidence: 0,
    name: 'C',
    camelot: `${MAJOR_CAMELOT[0]}B`,
  }
  let bestScore = -2
  let second = -2

  for (let root = 0; root < 12; root++) {
    for (const mode of ['major', 'minor'] as const) {
      const profile = mode === 'major' ? MAJOR_PROFILE : MINOR_PROFILE
      for (let i = 0; i < 12; i++) rotated[i] = chroma[(root + i) % 12]
      const score = pearson(rotated, profile)
      if (score > bestScore) {
        second = bestScore
        bestScore = score
        best = {
          key: root,
          mode,
          confidence: 0,
          name: `${PITCH_NAMES[root]}${mode === 'minor' ? 'm' : ''}`,
          camelot: `${(mode === 'major' ? MAJOR_CAMELOT : MINOR_CAMELOT)[root]}${mode === 'major' ? 'B' : 'A'}`,
        }
      } else if (score > second) {
        second = score
      }
    }
  }

  best.confidence = Math.max(0, Math.min(1, Math.round((bestScore - second) * 500) / 100))
  return best
}

export interface StructureResult {
  /** Seconds at which the intro stops being quiet/sparse. */
  introEnd: number
  /** Seconds at which the track starts winding down. */
  outroStart: number
  /** Mean loudness over the body of the track, linear RMS. */
  energy: number
  /** 0..1 perceptual-ish brightness. */
  brightness: number
  peak: number
}

export function detectStructure(
  rms: Float32Array,
  centroid: Float32Array,
  fps: number,
  sampleRate: number,
  duration: number,
): StructureResult {
  // Smooth the RMS envelope over ~1s so single hits do not look like sections.
  const window = Math.max(1, Math.round(fps))
  const smooth = new Float32Array(rms.length)
  let running = 0
  for (let i = 0; i < rms.length; i++) {
    running += rms[i]
    if (i >= window) running -= rms[i - window]
    smooth[i] = running / Math.min(i + 1, window)
  }

  const sorted = Float32Array.from(smooth).sort()
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0
  const median = sorted[Math.floor(sorted.length * 0.5)] || 0
  const enterThreshold = p90 * 0.42
  const leaveThreshold = p90 * 0.3
  const sustain = Math.round(fps * 1.5)

  let introEnd = 0
  for (let i = 0; i < smooth.length - sustain; i++) {
    if (smooth[i] < enterThreshold) continue
    let held = true
    for (let j = i; j < i + sustain; j++) {
      if (smooth[j] < leaveThreshold) {
        held = false
        break
      }
    }
    if (held) {
      introEnd = i / fps
      break
    }
  }

  let outroStart = duration
  for (let i = smooth.length - 1; i >= sustain; i--) {
    if (smooth[i] >= enterThreshold) {
      outroStart = Math.min(duration, (i + 1) / fps)
      break
    }
  }

  let peak = 0
  for (const value of rms) if (value > peak) peak = value

  let centroidSum = 0
  let centroidCount = 0
  for (let i = 0; i < centroid.length; i++) {
    if (rms[i] > median * 0.5) {
      centroidSum += centroid[i]
      centroidCount++
    }
  }
  const meanCentroid = centroidCount ? centroidSum / centroidCount : 0

  return {
    introEnd: Math.min(introEnd, duration * 0.3),
    outroStart: Math.max(outroStart, duration * 0.5),
    energy: Math.min(1, median * 4),
    brightness: Math.min(1, meanCentroid / (sampleRate / 4)),
    peak,
  }
}

export interface PcmAnalysis {
  duration: number
  bpm: number
  bpmConfidence: number
  beatOffset: number
  downbeatOffset: number
  outroDownbeat: number
  key: number
  keyName: string
  mode: 'major' | 'minor'
  keyConfidence: number
  camelot: string
  energy: number
  brightness: number
  peak: number
  introEnd: number
  outroStart: number
}

/** Full analysis pass over decoded mono PCM. */
export function analysePcm(pcm: Float32Array, sampleRate: number): PcmAnalysis {
  const duration = pcm.length / sampleRate
  const features = spectralFeatures(pcm, sampleRate)
  const onsetNorm = normalizeOnset(features.onset, features.fps)
  const tempo = detectTempo(onsetNorm, features.fps)
  const key = detectKey(features.chroma)
  const structure = detectStructure(
    features.rms,
    features.centroid,
    features.fps,
    sampleRate,
    duration,
  )

  return {
    duration,
    bpm: tempo.bpm,
    bpmConfidence: tempo.confidence,
    beatOffset: tempo.beatOffset,
    downbeatOffset: tempo.downbeatOffset,
    outroDownbeat: tempo.outroDownbeat,
    key: key.key,
    keyName: key.name,
    mode: key.mode,
    keyConfidence: key.confidence,
    camelot: key.camelot,
    energy: structure.energy,
    brightness: structure.brightness,
    peak: structure.peak,
    introEnd: structure.introEnd,
    outroStart: structure.outroStart,
  }
}

/** Distance on the Camelot wheel: 0 = same key, 1 = neighbour, up to 6. */
export function camelotDistance(a: string, b: string): number {
  const parse = (value: string) => {
    const match = /^(\d{1,2})([AB])$/.exec(value)
    return match ? { n: Number(match[1]), letter: match[2] } : null
  }
  const left = parse(a)
  const right = parse(b)
  if (!left || !right) return 6
  const ring = Math.min(
    Math.abs(left.n - right.n),
    12 - Math.abs(left.n - right.n),
  )
  const relative = left.letter === right.letter ? 0 : 1
  return ring + relative * (ring === 0 ? 0.5 : 1)
}
