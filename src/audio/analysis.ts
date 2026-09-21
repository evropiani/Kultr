import { getClient } from '@/api/subsonic'
import type { Song } from '@/api/types'
import { getAnalysis, putAnalysis } from '@/db'
import { decodeToMono } from './context'
import { analysePcm, type PcmAnalysis } from './dsp'
import type { AnalysisRequest, AnalysisResponse } from './analysis.worker'

/**
 * Bump this whenever the DSP changes in a way that invalidates cached numbers.
 * Cached entries with an older version are recomputed on demand.
 */
export const ANALYSIS_VERSION = 4

export interface TrackAnalysis extends PcmAnalysis {
  songId: string
  version: number
  analysedAt: number
  /** Where the BPM came from: our DSP, or the file's own tag. */
  bpmSource: 'dsp' | 'tag'
}

/** Bitrate we request for analysis — small, fast, and plenty accurate. */
const ANALYSIS_BITRATE = 96

let worker: Worker | null = null
let workerBroken = false
let nextRequestId = 0
const pending = new Map<string, { resolve: (value: PcmAnalysis) => void; reject: (err: Error) => void }>()

function ensureWorker(): Worker | null {
  if (workerBroken) return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', (event: MessageEvent<AnalysisResponse>) => {
      const entry = pending.get(event.data.id)
      if (!entry) return
      pending.delete(event.data.id)
      if (event.data.ok) entry.resolve(event.data.result)
      else entry.reject(new Error(event.data.error))
    })
    worker.addEventListener('error', () => {
      workerBroken = true
      for (const entry of pending.values()) entry.reject(new Error('Analysis worker crashed'))
      pending.clear()
      worker?.terminate()
      worker = null
    })
  } catch {
    workerBroken = true
    return null
  }
  return worker
}

function runInWorker(pcm: Float32Array, sampleRate: number): Promise<PcmAnalysis> {
  const instance = ensureWorker()
  if (!instance) return Promise.resolve(analysePcm(pcm, sampleRate))

  const id = String(nextRequestId++)
  // Copy into a plain ArrayBuffer so it can be transferred to the worker.
  const buffer = new ArrayBuffer(pcm.byteLength)
  new Float32Array(buffer).set(pcm)
  const request: AnalysisRequest = { id, pcm: buffer, sampleRate }
  return new Promise<PcmAnalysis>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    instance.postMessage(request, [buffer])
  }).catch((err) => {
    // If the worker died mid-flight, fall back to the main thread once.
    if (workerBroken) return analysePcm(pcm, sampleRate)
    throw err
  })
}

export interface AnalyseOptions {
  force?: boolean
  signal?: AbortSignal
}

/** In-flight deduplication so two decks never analyse the same track twice. */
const inFlight = new Map<string, Promise<TrackAnalysis | null>>()

export async function analyseTrack(
  song: Song,
  options: AnalyseOptions = {},
): Promise<TrackAnalysis | null> {
  if (!options.force) {
    const cached = await getAnalysis(song.id)
    if (cached && cached.version === ANALYSIS_VERSION) return cached
    const existing = inFlight.get(song.id)
    if (existing) return existing
  }

  const task = (async (): Promise<TrackAnalysis | null> => {
    try {
      const client = getClient()
      const url = client.streamUrl(song.id, { maxBitRate: ANALYSIS_BITRATE, format: 'mp3' })
      const response = await fetch(url, { signal: options.signal, credentials: 'omit' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.arrayBuffer()
      const { pcm, sampleRate } = await decodeToMono(data)
      const result = await runInWorker(pcm, sampleRate)

      // Navidrome exposes a BPM tag; trust it when our own estimate is shaky.
      const tagBpm = song.bpm && song.bpm >= 40 && song.bpm <= 220 ? song.bpm : undefined
      const useTag = Boolean(tagBpm) && result.bpmConfidence < 0.45

      const analysis: TrackAnalysis = {
        ...result,
        bpm: useTag ? (tagBpm as number) : result.bpm,
        bpmConfidence: useTag ? 0.8 : result.bpmConfidence,
        bpmSource: useTag ? 'tag' : 'dsp',
        // Prefer the server's duration; decoded duration can drift on VBR files.
        duration: song.duration ?? result.duration,
        songId: song.id,
        version: ANALYSIS_VERSION,
        analysedAt: Date.now(),
      }
      await putAnalysis(analysis)
      return analysis
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return null
      console.warn('[kultr] analysis failed for', song.title, err)
      return null
    } finally {
      inFlight.delete(song.id)
    }
  })()

  inFlight.set(song.id, task)
  return task
}

export interface BatchProgress {
  done: number
  total: number
  current?: string
}

/** Analyse many tracks with a small concurrency budget. */
export async function analyseMany(
  songs: Song[],
  onProgress: (progress: BatchProgress) => void,
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<number> {
  const concurrency = Math.max(1, Math.min(4, options.concurrency ?? 2))
  let index = 0
  let done = 0
  let succeeded = 0

  async function worker_(): Promise<void> {
    while (index < songs.length) {
      if (options.signal?.aborted) return
      const song = songs[index++]
      onProgress({ done, total: songs.length, current: song.title })
      const result = await analyseTrack(song, { signal: options.signal })
      if (result) succeeded++
      done++
      onProgress({ done, total: songs.length, current: song.title })
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker_()))
  return succeeded
}
