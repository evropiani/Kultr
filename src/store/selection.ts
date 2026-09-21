import { create } from 'zustand'
import type { Song } from '@/api/types'

/**
 * Multi-select and drag-and-drop share a store because they share a payload:
 * whatever is currently "in hand" is either what you ticked, or the single
 * thing you started dragging.
 */

export type DragKind = 'songs' | 'album' | 'artist' | 'playlist'

export interface DragPayload {
  kind: DragKind
  /** Resolved tracks. Albums/artists resolve to their tracks before the drag. */
  songs: Song[]
  label: string
}

interface SelectionState {
  /** Song ids, in the order they were ticked. */
  selected: string[]
  /** Kept so actions have the full objects without another database read. */
  items: Map<string, Song>
  /** Anchor for shift-click range selection. */
  anchor: string | null

  dragging: DragPayload | null
  /** Which drop target the pointer is currently over. */
  dropTarget: string | null

  isSelected: (id: string) => boolean
  toggle: (song: Song, options?: { range?: Song[]; shift?: boolean }) => void
  selectMany: (songs: Song[]) => void
  deselectMany: (songs: Song[]) => void
  replace: (songs: Song[]) => void
  clear: () => void
  selectedSongs: () => Song[]

  startDrag: (payload: DragPayload) => void
  endDrag: () => void
  setDropTarget: (target: string | null) => void
}

export const useSelection = create<SelectionState>((set, get) => ({
  selected: [],
  items: new Map(),
  anchor: null,
  dragging: null,
  dropTarget: null,

  isSelected: (id) => get().selected.includes(id),

  toggle(song, options) {
    const state = get()
    const items = new Map(state.items)

    // Shift-click extends from the last click through the visible list.
    if (options?.shift && state.anchor && options.range?.length) {
      const ids = options.range.map((entry) => entry.id)
      const from = ids.indexOf(state.anchor)
      const to = ids.indexOf(song.id)
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        const slice = options.range.slice(start, end + 1)
        const selected = [...state.selected]
        for (const entry of slice) {
          if (!selected.includes(entry.id)) selected.push(entry.id)
          items.set(entry.id, entry)
        }
        set({ selected, items, anchor: song.id })
        return
      }
    }

    if (state.selected.includes(song.id)) {
      items.delete(song.id)
      set({
        selected: state.selected.filter((id) => id !== song.id),
        items,
        anchor: song.id,
      })
    } else {
      items.set(song.id, song)
      set({ selected: [...state.selected, song.id], items, anchor: song.id })
    }
  },

  selectMany(songs) {
    const state = get()
    const items = new Map(state.items)
    const selected = [...state.selected]
    for (const song of songs) {
      if (!selected.includes(song.id)) selected.push(song.id)
      items.set(song.id, song)
    }
    set({ selected, items })
  },

  deselectMany(songs) {
    const state = get()
    const remove = new Set(songs.map((song) => song.id))
    const items = new Map(state.items)
    for (const id of remove) items.delete(id)
    set({ selected: state.selected.filter((id) => !remove.has(id)), items })
  },

  replace(songs) {
    set({
      selected: songs.map((song) => song.id),
      items: new Map(songs.map((song) => [song.id, song])),
      anchor: songs.at(-1)?.id ?? null,
    })
  },

  clear() {
    set({ selected: [], items: new Map(), anchor: null })
  },

  selectedSongs() {
    const { selected, items } = get()
    return selected.map((id) => items.get(id)).filter((song): song is Song => Boolean(song))
  },

  startDrag(payload) {
    set({ dragging: payload })
  },
  endDrag() {
    set({ dragging: null, dropTarget: null })
  },
  setDropTarget(dropTarget) {
    set({ dropTarget })
  },
}))
