import { analysePcm, type PcmAnalysis } from './dsp'

/**
 * Analysis worker. The main thread decodes audio (only it can), then hands the
 * raw PCM over here so the FFT work never blocks the UI.
 */

export interface AnalysisRequest {
  id: string
  pcm: ArrayBuffer
  sampleRate: number
}

export type AnalysisResponse =
  | { id: string; ok: true; result: PcmAnalysis }
  | { id: string; ok: false; error: string }

const ctx = self as unknown as {
  postMessage: (message: AnalysisResponse) => void
  addEventListener: (type: 'message', listener: (event: MessageEvent<AnalysisRequest>) => void) => void
}

ctx.addEventListener('message', (event) => {
  const { id, pcm, sampleRate } = event.data
  try {
    const result = analysePcm(new Float32Array(pcm), sampleRate)
    ctx.postMessage({ id, ok: true, result })
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})
