import { create } from 'zustand'
import type { Song } from '@/api/types'
import { offlineIdSet, offlineUsage } from '@/db'
import {
  pickDownloadFolder,
  supportsFolderDownloads,
  getStoredFolder,
  ensureFolderPermission,
} from '@/lib/filesystem'
import {
  downloadForOfflineBatch,
  NoFolderChosenError,
  pendingDownloads,
  removeOfflineBatch,
  type OfflineProgress,
} from '@/sync/offline'
import { settings } from './settings'
import { useToast } from './ui'

interface OfflineState {
  running: boolean
  progress: OfflineProgress | null
  /** Ids of every track that has audio stored, for tick marks in lists. */
  ids: Set<string>
  usage: { count: number; bytes: number }
  controller: AbortController | null
  /** Songs waiting on the "where should downloads go?" prompt. */
  pending: Song[] | null

  refresh: () => Promise<void>
  download: (songs: Song[], label?: string) => Promise<void>
  remove: (songIds: string[]) => Promise<void>
  cancel: () => void
  chooseDestination: (destination: 'browser' | 'folder') => Promise<void>
  dismissPrompt: () => void
}

export const useOffline = create<OfflineState>((set, get) => ({
  running: false,
  progress: null,
  ids: new Set(),
  usage: { count: 0, bytes: 0 },
  controller: null,
  pending: null,

  async refresh() {
    const [ids, usage] = await Promise.all([offlineIdSet(), offlineUsage()])
    set({ ids, usage })
  },

  async download(songs, label) {
    if (!songs.length) return
    if (get().running) {
      useToast.getState().show('A download is already running.', 'warning')
      return
    }

    const config = settings()

    // First time anyone downloads, ask where it should go — but only where
    // there is a real choice to make.
    if (!config.offlineDestinationChosen && supportsFolderDownloads()) {
      set({ pending: songs })
      return
    }

    // A folder destination whose handle has gone (cleared, or permission
    // withdrawn) needs re-picking, and the picker needs this click's gesture.
    if (config.offlineDestination === 'folder') {
      const handle = await getStoredFolder()
      if (!handle || !(await ensureFolderPermission(handle, true))) {
        const picked = await pickDownloadFolder().catch(() => null)
        if (!picked) {
          useToast
            .getState()
            .show('No folder chosen, so nothing was downloaded. Pick one in Settings → Offline.', 'warning')
          return
        }
        config.merge({ offlineFolderName: picked.name })
      }
    }

    const controller = new AbortController()
    set({ running: true, controller, progress: null })

    try {
      const summary = await downloadForOfflineBatch(songs, {
        signal: controller.signal,
        onProgress: (progress) => set({ progress }),
      })
      await get().refresh()

      const where = summary.destination === 'folder' ? settings().offlineFolderName || 'your folder' : 'this browser'
      if (summary.cancelled) {
        useToast
          .getState()
          .show(`Stopped after ${summary.downloaded} of ${summary.total} track(s).`, 'info')
      } else if (summary.downloaded === 0 && summary.failed === 0) {
        useToast
          .getState()
          .show(
            label ? `${label} is already fully downloaded.` : 'Everything was already downloaded.',
            'success',
          )
      } else {
        const parts = [`Downloaded ${summary.downloaded} track(s) to ${where}`]
        if (summary.skipped) parts.push(`${summary.skipped} already had files`)
        if (summary.failed) parts.push(`${summary.failed} failed`)
        useToast.getState().show(parts.join(' · '), summary.failed ? 'warning' : 'success')
      }
      if (summary.errors.length) console.warn('[kultr] offline sync errors', summary.errors)
    } catch (err) {
      if (err instanceof NoFolderChosenError) {
        useToast
          .getState()
          .show('Choose a download folder in Settings → Offline first.', 'warning')
      } else {
        useToast
          .getState()
          .show(err instanceof Error ? err.message : String(err), 'error')
      }
    } finally {
      set({ running: false, controller: null })
    }
  },

  async remove(songIds) {
    if (!songIds.length) return
    const removed = await removeOfflineBatch(songIds)
    await get().refresh()
    useToast
      .getState()
      .show(removed ? `Removed ${removed} track(s) from offline storage.` : 'Nothing to remove.', 'info')
  },

  cancel() {
    get().controller?.abort()
    set({ running: false, controller: null })
  },

  async chooseDestination(destination) {
    const songs = get().pending
    const config = settings()

    if (destination === 'folder') {
      // Still inside the click that answered the prompt, so the picker opens.
      const picked = await pickDownloadFolder().catch(() => null)
      if (!picked) return
      config.merge({
        offlineDestination: 'folder',
        offlineFolderName: picked.name,
        offlineDestinationChosen: true,
      })
    } else {
      config.merge({ offlineDestination: 'browser', offlineDestinationChosen: true })
    }

    set({ pending: null })
    if (songs?.length) await get().download(songs)
  },

  dismissPrompt() {
    set({ pending: null })
  },
}))

/** How many of these are not downloaded yet — used to label buttons. */
export async function countPending(songs: Song[]): Promise<number> {
  return (await pendingDownloads(songs)).length
}
