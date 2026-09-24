import { create } from 'zustand'
import { prefersReducedMotion } from '@/lib/motion'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
  /** Set for the moment between dismissal and removal, while it animates out. */
  leaving?: boolean
}

const TOAST_EXIT_MS = 200

interface ToastState {
  toasts: Toast[]
  show: (message: string, kind?: ToastKind, durationMs?: number) => void
  dismiss: (id: number) => void
}

let toastId = 0

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  show(message, kind = 'info', durationMs) {
    const id = ++toastId
    set((state) => ({ toasts: [...state.toasts.slice(-4), { id, message, kind }] }))
    const timeout = durationMs ?? (kind === 'error' ? 8000 : 4000)
    window.setTimeout(() => get().dismiss(id), timeout)
  },
  dismiss(id) {
    const toast = get().toasts.find((entry) => entry.id === id)
    if (!toast || toast.leaving) return
    const remove = () => set((state) => ({ toasts: state.toasts.filter((entry) => entry.id !== id) }))
    if (prefersReducedMotion()) {
      remove()
      return
    }
    set((state) => ({
      toasts: state.toasts.map((entry) => (entry.id === id ? { ...entry, leaving: true } : entry)),
    }))
    window.setTimeout(remove, TOAST_EXIT_MS)
  },
}))

interface UiState {
  nowPlayingOpen: boolean
  queueOpen: boolean
  sidebarOpen: boolean
  searchOpen: boolean
  shortcutsOpen: boolean
  /** RGB triplet sampled from the current artwork, drives the glass tint. */
  accentRgb: [number, number, number] | null
  setNowPlaying: (open: boolean) => void
  setQueue: (open: boolean) => void
  setSidebar: (open: boolean) => void
  setSearch: (open: boolean) => void
  setShortcuts: (open: boolean) => void
  setAccent: (rgb: [number, number, number] | null) => void
}

export const useUi = create<UiState>((set) => ({
  nowPlayingOpen: false,
  queueOpen: false,
  sidebarOpen: false,
  searchOpen: false,
  shortcutsOpen: false,
  accentRgb: null,
  setNowPlaying: (nowPlayingOpen) => set({ nowPlayingOpen }),
  setQueue: (queueOpen) => set({ queueOpen }),
  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
  setSearch: (searchOpen) => set({ searchOpen }),
  setShortcuts: (shortcutsOpen) => set({ shortcutsOpen }),
  setAccent: (accentRgb) => set({ accentRgb }),
}))
