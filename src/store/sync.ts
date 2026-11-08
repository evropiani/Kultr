import { create } from 'zustand'
import { counts, getSyncState, clearLibrary, setSyncState, type SyncState } from '@/db'
import { EMPTY_SYNC_STATE } from '@/db'
import { quickCheck, syncLibrary, type SyncProgress, type SyncSummary } from '@/sync/engine'
import { settings } from './settings'
import { maybeClient } from '@/api/subsonic'
import { syncListening } from '@/sync/listening'
import { useAuth } from './auth'
import { LOCAL_PROFILE_ID } from '@/local/client'
import { t } from '@/i18n'

interface SyncStoreState {
  running: boolean
  progress: SyncProgress
  lastSummary: SyncSummary | null
  state: SyncState
  error: string | null
  hint: string | null
  controller: AbortController | null
  /** Bumped when listening data changed on the way in, so views re-read it. */
  listeningAt: number

  refreshState: () => Promise<void>
  /** Send queued plays and read back play counts from the server. */
  refreshListening: () => Promise<void>
  run: (mode: 'full' | 'check') => Promise<SyncSummary | null>
  cancel: () => void
  probe: () => Promise<void>
  wipe: () => Promise<void>
  /**
   * Called when a library is connected: if the mirror holds another library's
   * music, clear it and read this one from the start. True if it did.
   */
  adopt: (owner: string) => Promise<boolean>
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
  listeningAt: 0,

  async refreshState() {
    const [state, currentCounts] = await Promise.all([getSyncState(), counts()])
    set({ state: { ...state, counts: currentCounts } })
  },

  async run(mode) {
    if (get().running) return null
    if (!maybeClient()) {
      set({ error: t('Not connected to a server.') })
      return null
    }
    const controller = new AbortController()
    set({ running: true, error: null, hint: null, controller, progress: { ...IDLE, phase: 'connecting' } })
    try {
      const summary = await syncLibrary({
        mode,
        signal: controller.signal,
        includePlaylistContents: settings().syncPlaylistContents,
        owner: useAuth.getState().activeId ?? undefined,
        onProgress: (progress) => set({ progress }),
      })
      set({ lastSummary: summary, running: false, controller: null })
      await get().refreshState()
      // Plays made offline go up, and anything played elsewhere since the
      // album index was read comes down.
      void get().refreshListening()
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

  async refreshListening() {
    if (!maybeClient()) return
    const result = await syncListening()
    if (result.sent || result.albumsChanged) set({ listeningAt: Date.now() })
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

  async adopt(owner) {
    const state = await getSyncState()
    if (state.owner === owner) return false
    const hasLibrary = state.lastFullSync !== null || state.counts.songs > 0
    // Libraries synced before the owner was recorded came from a server (there
    // was nothing else), so a server keeps them; the music on this computer
    // never does.
    if (!hasLibrary || (state.owner === undefined && owner !== LOCAL_PROFILE_ID)) {
      await setSyncState({ ...state, owner })
      return false
    }
    get().cancel()
    await clearLibrary()
    await setSyncState({ ...EMPTY_SYNC_STATE, owner })
    set({ lastSummary: null, progress: IDLE, hint: null, listeningAt: Date.now() })
    await get().refreshState()
    return true
  },

  async wipe() {
    await clearLibrary()
    set({ lastSummary: null, progress: IDLE, hint: null })
    await get().refreshState()
  },
}))
