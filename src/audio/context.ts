/**
 * A single shared AudioContext for the whole app.
 *
 * Browsers cap the number of contexts and suspend them until a user gesture,
 * so everything (player, analysis, level detection) goes through this one.
 */

let ctx: AudioContext | null = null

type Ctor = typeof AudioContext

function audioContextCtor(): Ctor | null {
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export function isWebAudioSupported(): boolean {
  return audioContextCtor() !== null
}

export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = audioContextCtor()
  if (!Ctor) return null
  try {
    ctx = new Ctor({ latencyHint: 'playback' })
  } catch {
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  return ctx
}

/** Resume the context after a user gesture; safe to call repeatedly. */
export async function unlockAudio(): Promise<void> {
  const context = getAudioContext()
  if (!context) return
  if (context.state === 'suspended') {
    try {
      await context.resume()
    } catch {
      /* Safari occasionally rejects; the next gesture will retry. */
    }
  }
}

/**
 * Decode compressed audio into mono PCM at a low sample rate.
 *
 * Analysis does not need 44.1 kHz stereo — 22.05 kHz mono is plenty for tempo
 * and key detection and uses a fraction of the memory.
 */
export async function decodeToMono(
  data: ArrayBuffer,
  targetRate = 22050,
): Promise<{ pcm: Float32Array; sampleRate: number }> {
  const OfflineCtor =
    (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
      .OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext

  let buffer: AudioBuffer | null = null

  if (OfflineCtor) {
    try {
      const offline = new OfflineCtor(1, 1, targetRate)
      buffer = await offline.decodeAudioData(data.slice(0))
    } catch {
      buffer = null
    }
  }

  if (!buffer) {
    const context = getAudioContext()
    if (!context) throw new Error('This browser cannot decode audio for analysis.')
    buffer = await context.decodeAudioData(data.slice(0))
  }

  const channels = buffer.numberOfChannels
  const length = buffer.length
  const mono = new Float32Array(length)
  for (let c = 0; c < channels; c++) {
    const channel = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) mono[i] += channel[i]
  }
  if (channels > 1) for (let i = 0; i < length; i++) mono[i] /= channels

  return { pcm: mono, sampleRate: buffer.sampleRate }
}
