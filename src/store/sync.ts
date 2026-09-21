import { create } from 'zustand'
import { counts, getSyncState, clearLibrary, type SyncState } from '@/db'
import { EMPTY_SYNC_STATE } from '@/db'
import { quickCheck, syncLibrary, type SyncProgress, type SyncSummary } from '@/sync/engine'
import { settings } from './settings'
import { maybeClient } from '@/api/subsonic'

interface SyncStoreState {
  running: boolean
  progress: SyncProgress
  lastSummary: SyncSummary | null
  state: SyncState
  error: string | null
  hint: string | null
  controller: AbortController | null

  refreshState: () => Promise<void>
  run: (mode: 'full' | 'check') => Promise<SyncSummary | null>
  cancel: () => void
  probe: () => Promise<void>
  wipe: () => Promise<void>
}

const IDLE: SyncProgress = { phase: 'idle', message: '', current: 0, total: 0, percent: 0 }

export const useSync = create<SyncStoreState>((set, get) => ({
  running: false,
  progress: IDLE,
  lastSummary: null,
  state: EMPTY_SYNC_STATE,
  error: null,
  hint: null,
  controller: null,

  async refreshState() {
    const [state, currentCounts] = await Promise.all([getSyncState(), counts()])
    set({ state: { ...state, counts: currentCounts } })
  },

  async run(mode) {
    if (get().running) return null
    if (!maybeClient()) {
      set({ error: 'Not connected to a server.' })
      return null
    }
    const controller = new AbortController()
    set({ running: true, error: null, hint: null, controller, progress: { ...IDLE, phase: 'connecting' } })
    try {
      const summary = await syncLibrary({
        mode,
        signal: controller.signal,
        includePlaylistContents: settings().syncPlaylistContents,
        onProgress: (progress) => set({ progress }),
      })
      set({ lastSummary: summary, running: false, controller: null })
      await get().refreshState()
      return summary
    } catch (err) {
      const cancelled = (err as Error)?.name === 'Cancelled' || (err as Error)?.name === 'AbortError'
      set({
        running: false,
        controller: null,
        error: cancelled ? null : err instanceof Error ? err.message : String(err),
        progress: cancelled ? IDLE : get().progress,
      })
      await get().refreshState()
      return null
    }
  },

  cancel() {
    get().controller?.abort()
    set({ running: false, controller: null, progress: IDLE })
  },

  async probe() {
    if (!maybeClient()) return
    try {
      const result = await quickCheck()
      set({ hint: result.changed ? result.reason : null })
    } catch {
      /* offline; stay quiet */
    }
  },

  async wipe() {
    await clearLibrary()
    set({ lastSummary: null, progress: IDLE, hint: null })
    await get().refreshState()
  },
}))
