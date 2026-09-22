import { create } from 'zustand'
import type { Song } from '@/api/types'
import { maybeClient } from '@/api/subsonic'
import { addHistory, patchSong } from '@/db'
import { engine, type EngineMode, type PlaybackState } from '@/audio/engine'
import { analyseTrack } from '@/audio/analysis'
import { buildAutoQueue, planTransition, type TransitionPlan } from '@/audio/injekt'
import { settings, useSettings } from './settings'
import { useToast } from './ui'

export type RepeatMode = 'off' | 'all' | 'one'

const SESSION_KEY = 'kultr.session.queue'

interface SavedSession {
  queue: Song[]
  index: number
  position: number
  source: string
}

export interface PlayerState {
  queue: Song[]
  /** Queue order before shuffling, so shuffle can be undone. */
  unshuffled: Song[] | null
  index: number
  playback: PlaybackState
  currentTime: number
  duration: number
  shuffle: boolean
  repeat: RepeatMode
  source: string
  engineMode: EngineMode
  transition: { plan: TransitionPlan; song: Song } | null
  /**
   * The most recent transition plan, together with the track it was built
   * *from*. The pairing matters: a plan's positions are in that track's
   * timeline, so drawing a stale one against a different track puts the
   * overlap marker somewhere meaningless — usually past the end of the bar.
   */
  lastPlan: { plan: TransitionPlan; fromId: string } | null
  /** The plan for the track playing right now, or null if there isn't one. */
  currentPlan: () => TransitionPlan | null
  sleepTimerEndsAt: number | null
  sleepTimerAfterTrack: boolean
  ready: boolean

  current: () => Song | null
  peekNext: () => Song | null

  playNow: (songs: Song[], startIndex?: number, source?: string) => Promise<void>
  playSong: (song: Song, source?: string) => Promise<void>
  toggle: () => Promise<void>
  next: (manual?: boolean) => Promise<void>
  previous: () => Promise<void>
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setShuffle: (shuffle: boolean) => void
  cycleRepeat: () => void
  jumpTo: (index: number) => Promise<void>

  enqueue: (songs: Song[], position?: 'next' | 'end') => void
  removeAt: (index: number) => void
  move: (from: number, to: number) => void
  clearQueue: () => void

  setSleepTimer: (minutes: number | null, afterTrack?: boolean) => void
  restoreSession: () => Promise<void>
  init: () => void
}

let scrobbledFor: string | null = null
let nowPlayingFor: string | null = null
let listenedSeconds = 0
let lastTickAt = 0
let saveTimer = 0
let timeThrottle = 0

function persistSession(state: PlayerState): void {
  if (saveTimer) return
  saveTimer = window.setTimeout(() => {
    saveTimer = 0
    try {
      const payload: SavedSession = {
        queue: state.queue.slice(0, 500),
        index: state.index,
        position: engine.currentTime,
        source: state.source,
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
    } catch {
      /* quota; not fatal */
    }
  }, 1500)
}

function shuffleWithCurrentFirst(queue: Song[], index: number): { queue: Song[]; index: number } {
  const current = queue[index]
  const rest = queue.filter((_, i) => i !== index)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return current ? { queue: [current, ...rest], index: 0 } : { queue: rest, index: 0 }
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  unshuffled: null,
  index: -1,
  playback: 'idle',
  currentTime: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  source: '',
  engineMode: 'element',
  transition: null,
  lastPlan: null,
  sleepTimerEndsAt: null,
  sleepTimerAfterTrack: false,
  ready: false,

  currentPlan() {
    const { lastPlan } = get()
    if (!lastPlan) return null
    return lastPlan.fromId && lastPlan.fromId === get().current()?.id ? lastPlan.plan : null
  },

  current() {
    const { queue, index } = get()
    return queue[index] ?? null
  },

  peekNext() {
    const { queue, index, repeat } = get()
    if (!queue.length) return null
    if (repeat === 'one') return queue[index] ?? null
    if (index + 1 < queue.length) return queue[index + 1]
    if (repeat === 'all') return queue[0] ?? null
    return null
  },

  init() {
    if (get().ready) return
    set({ ready: true })

    engine.attach({
      onState: (playback) => {
        set({ playback })
        updateMediaSessionState(playback)
      },
      onTime: (currentTime, duration) => {
        const now = performance.now()
        trackListening(currentTime, duration)
        if (now - timeThrottle < 240) return
        timeThrottle = now
        set({ currentTime, duration })
        persistSession(get())
        updatePositionState(currentTime, duration)
        checkSleepTimer()
      },
      onAdvance: (reason) => {
        if (reason === 'transition') {
          // The engine already swapped decks; move the pointer to match.
          const state = get()
          const nextIdx =
            state.repeat === 'one'
              ? state.index
              : state.index + 1 < state.queue.length
                ? state.index + 1
                : state.repeat === 'all'
                  ? 0
                  : state.index
          set({ index: nextIdx, currentTime: 0 })
          onTrackStarted(get())
        } else {
          void get().next(false)
        }
      },
      prepareNext: () => {
        void prepareNextTransition()
      },
      onTransitionStart: (plan, song) => {
        set({ transition: { plan, song }, lastPlan: { plan, fromId: get().current()?.id ?? '' } })
      },
      onTransitionEnd: () => set({ transition: null }),
      onError: (message) => useToast.getState().show(message, 'error'),
      onModeChange: (mode, reason) => {
        set({ engineMode: mode })
        useToast.getState().show(reason, 'warning', 12000)
      },
    })

    engine.init()
    set({ engineMode: engine.mode })
    setupMediaSession(get)

    // Keep the engine in step with settings changes.
    useSettings.subscribe((state, previous) => {
      if (state.volume !== previous.volume || state.muted !== previous.muted) {
        engine.setVolume(state.muted ? 0 : state.volume)
      }
      if (
        state.eqEnabled !== previous.eqEnabled ||
        state.eqGains !== previous.eqGains ||
        state.eqPreamp !== previous.eqPreamp
      ) {
        engine.applyEq()
      }
      if (
        state.replayGainMode !== previous.replayGainMode ||
        state.replayGainPreamp !== previous.replayGainPreamp
      ) {
        engine.refreshGains()
      }
      if (
        state.crossfadeEnabled !== previous.crossfadeEnabled ||
        state.crossfadeSeconds !== previous.crossfadeSeconds ||
        state.injektEnabled !== previous.injektEnabled
      ) {
        // A pending plan was built with the old settings; rebuild it.
        engine.clearPendingTransition()
      }
    })
  },

  async playNow(songs, startIndex = 0, source = '') {
    if (!songs.length) return
    get().init()
    const shuffle = get().shuffle
    let queue = [...songs]
    let index = Math.max(0, Math.min(startIndex, songs.length - 1))
    let unshuffled: Song[] | null = null
    if (shuffle) {
      unshuffled = [...songs]
      const result = shuffleWithCurrentFirst(queue, index)
      queue = result.queue
      index = result.index
    }
    set({ queue, index, unshuffled, source, transition: null })
    await engine.play(queue[index])
    onTrackStarted(get())
  },

  async playSong(song, source = '') {
    await get().playNow([song], 0, source)
  },

  async toggle() {
    get().init()
    await engine.toggle()
  },

  async next(manual = true) {
    const state = get()
    if (!state.queue.length) return

    let nextIdx: number | null = null
    if (state.repeat === 'one' && !manual) nextIdx = state.index
    else if (state.index + 1 < state.queue.length) nextIdx = state.index + 1
    else if (state.repeat === 'all') nextIdx = 0

    if (nextIdx === null) {
      if (settings().injektAutoQueue) {
        const added = await extendQueue(state)
        if (added) {
          nextIdx = get().index + 1
        }
      }
    }

    if (nextIdx === null) {
      engine.pause()
      set({ playback: 'paused' })
      return
    }

    if (get().sleepTimerAfterTrack) {
      get().setSleepTimer(null)
      engine.pause()
      useToast.getState().show('Sleep timer: stopped at the end of the track.', 'info')
      return
    }

    set({ index: nextIdx, transition: null })
    const song = get().queue[nextIdx]
    const fade = manual && settings().crossfadeOnSkip ? Math.min(settings().crossfadeSeconds, 2) : 0
    await engine.skipTo(song, { fade })
    onTrackStarted(get())
  },

  async previous() {
    const state = get()
    if (!state.queue.length) return
    // Standard behaviour: restart the track unless we are near the beginning.
    if (engine.currentTime > 3) {
      engine.seek(0)
      return
    }
    const prevIdx =
      state.index - 1 >= 0 ? state.index - 1 : state.repeat === 'all' ? state.queue.length - 1 : 0
    set({ index: prevIdx, transition: null })
    const fade = settings().crossfadeOnSkip ? Math.min(settings().crossfadeSeconds, 2) : 0
    await engine.skipTo(state.queue[prevIdx], { fade })
    onTrackStarted(get())
  },

  seek(seconds) {
    engine.seek(seconds)
    set({ currentTime: seconds })
  },

  setVolume(volume) {
    settings().merge({ volume, muted: volume === 0 ? settings().muted : false })
    engine.setVolume(settings().muted ? 0 : volume)
  },

  toggleMute() {
    const muted = !settings().muted
    settings().set('muted', muted)
    engine.setVolume(muted ? 0 : settings().volume)
  },

  setShuffle(shuffle) {
    const state = get()
    if (shuffle === state.shuffle) return
    if (shuffle) {
      const unshuffled = [...state.queue]
      const result = shuffleWithCurrentFirst(state.queue, state.index)
      set({ shuffle: true, unshuffled, queue: result.queue, index: result.index })
    } else if (state.unshuffled) {
      const current = state.queue[state.index]
      const restored = state.unshuffled
      const index = current ? Math.max(0, restored.findIndex((s) => s.id === current.id)) : 0
      set({ shuffle: false, queue: restored, unshuffled: null, index })
    } else {
      set({ shuffle: false })
    }
    engine.clearPendingTransition()
  },

  cycleRepeat() {
    const order: RepeatMode[] = ['off', 'all', 'one']
    const next = order[(order.indexOf(get().repeat) + 1) % order.length]
    set({ repeat: next })
    engine.clearPendingTransition()
  },

  async jumpTo(index) {
    const state = get()
    if (index < 0 || index >= state.queue.length) return
    set({ index, transition: null })
    const fade = settings().crossfadeOnSkip ? Math.min(settings().crossfadeSeconds, 2) : 0
    await engine.skipTo(state.queue[index], { fade })
    onTrackStarted(get())
  },

  enqueue(songs, position = 'end') {
    if (!songs.length) return
    const state = get()
    if (!state.queue.length) {
      void get().playNow(songs, 0, 'Queue')
      return
    }
    const queue = [...state.queue]
    if (position === 'next') queue.splice(state.index + 1, 0, ...songs)
    else queue.push(...songs)
    set({ queue })
    engine.clearPendingTransition()
    useToast
      .getState()
      .show(
        songs.length === 1
          ? `Added “${songs[0].title}” to the queue`
          : `Added ${songs.length} tracks to the queue`,
        'success',
      )
  },

  removeAt(index) {
    const state = get()
    if (index < 0 || index >= state.queue.length) return
    if (index === state.index) return
    const queue = state.queue.filter((_, i) => i !== index)
    set({ queue, index: index < state.index ? state.index - 1 : state.index })
    engine.clearPendingTransition()
  },

  move(from, to) {
    const state = get()
    if (from === to || from < 0 || to < 0 || from >= state.queue.length || to >= state.queue.length) {
      return
    }
    const queue = [...state.queue]
    const [moved] = queue.splice(from, 1)
    queue.splice(to, 0, moved)
    let index = state.index
    if (from === state.index) index = to
    else if (from < state.index && to >= state.index) index -= 1
    else if (from > state.index && to <= state.index) index += 1
    set({ queue, index })
    engine.clearPendingTransition()
  },

  clearQueue() {
    const state = get()
    const current = state.queue[state.index]
    set({ queue: current ? [current] : [], index: current ? 0 : -1, unshuffled: null })
    engine.clearPendingTransition()
  },

  setSleepTimer(minutes, afterTrack = false) {
    if (minutes === null && !afterTrack) {
      set({ sleepTimerEndsAt: null, sleepTimerAfterTrack: false })
      return
    }
    set({
      sleepTimerEndsAt: minutes ? Date.now() + minutes * 60_000 : null,
      sleepTimerAfterTrack: afterTrack,
    })
  },

  async restoreSession() {
    if (!settings().resumeOnStart) return
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as SavedSession
      if (!saved.queue?.length) return
      get().init()
      set({
        queue: saved.queue,
        index: Math.max(0, Math.min(saved.index, saved.queue.length - 1)),
        source: saved.source ?? '',
      })
      const song = get().current()
      if (song) {
        await engine.play(song, { startAt: saved.position ?? 0, autoplay: false })
        set({ currentTime: saved.position ?? 0, duration: song.duration ?? 0 })
        setMediaSessionMetadata(song)
      }
    } catch {
      /* corrupt session; ignore */
    }
  },
}))

// --------------------------------------------------------------- internals --

function trackListening(currentTime: number, duration: number): void {
  const now = performance.now()
  const delta = lastTickAt ? (now - lastTickAt) / 1000 : 0
  lastTickAt = now
  if (delta > 0 && delta < 1 && usePlayer.getState().playback === 'playing') {
    listenedSeconds += delta
  }

  const song = usePlayer.getState().current()
  if (!song) return

  const threshold = Math.min(240, Math.max(20, (duration || song.duration || 0) * 0.5))
  if (listenedSeconds >= threshold && scrobbledFor !== song.id) {
    scrobbledFor = song.id
    void submitScrobble(song, listenedSeconds, currentTime >= (duration || 0) - 5)
  }
}

async function submitScrobble(song: Song, seconds: number, completed: boolean): Promise<void> {
  await addHistory({
    songId: song.id,
    playedAt: Date.now(),
    seconds: Math.round(seconds),
    completed,
    source: usePlayer.getState().source,
  }).catch(() => {})
  await patchSong(song.id, {
    playCount: (song.playCount ?? 0) + 1,
    played: new Date().toISOString(),
  }).catch(() => {})
  if (!settings().scrobble) return
  try {
    await maybeClient()?.scrobble(song.id, true)
  } catch {
    /* offline; Navidrome will miss this play */
  }
}

function onTrackStarted(state: PlayerState): void {
  const song = state.current()
  if (!song) return
  listenedSeconds = 0
  lastTickAt = 0
  scrobbledFor = null
  setMediaSessionMetadata(song)

  if (nowPlayingFor !== song.id && settings().scrobble) {
    nowPlayingFor = song.id
    void maybeClient()
      ?.scrobble(song.id, false)
      .catch(() => {})
  }

  // Warm up the analysis for what is coming so the next transition is ready.
  if (settings().injektEnabled && settings().injektAnalyseAhead) {
    const next = usePlayer.getState().peekNext()
    if (next) void analyseTrack(next)
    void analyseTrack(song)
  }
}

async function extendQueue(state: PlayerState): Promise<boolean> {
  const seed = state.queue[state.index]
  if (!seed) return false
  try {
    const exclude = new Set(state.queue.slice(-60).map((song) => song.id))
    const additions = await buildAutoQueue(seed, { count: 10, exclude })
    if (!additions.length) return false
    usePlayer.setState({ queue: [...usePlayer.getState().queue, ...additions] })
    return true
  } catch {
    return false
  }
}

let preparing = false

async function prepareNextTransition(): Promise<void> {
  if (preparing) return
  preparing = true
  try {
    const state = usePlayer.getState()
    let next = state.peekNext()

    if (!next && settings().injektAutoQueue) {
      const added = await extendQueue(state)
      if (added) next = usePlayer.getState().peekNext()
    }
    if (!next) return

    const current = state.current()
    if (!current) return

    const plan = await planTransition(current, next, {
      durationA: engine.duration,
      currentTime: engine.currentTime,
    })
    // Bail out if the user moved on while we were planning.
    const fresh = usePlayer.getState()
    if (fresh.current()?.id !== current.id) return
    engine.setPendingTransition(next, plan)
    usePlayer.setState({ lastPlan: { plan, fromId: current.id } })
  } catch (err) {
    console.warn('[kultr] could not plan the next transition', err)
  } finally {
    preparing = false
  }
}

function checkSleepTimer(): void {
  const { sleepTimerEndsAt } = usePlayer.getState()
  if (!sleepTimerEndsAt) return
  if (Date.now() >= sleepTimerEndsAt) {
    usePlayer.setState({ sleepTimerEndsAt: null })
    engine.pause()
    useToast.getState().show('Sleep timer finished. Good night.', 'info')
  }
}

// ------------------------------------------------------------ media session --

function setMediaSessionMetadata(song: Song): void {
  if (!('mediaSession' in navigator)) return
  const client = maybeClient()
  const art = client?.coverArtUrl(song.coverArt ?? song.albumId, 512)
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist ?? 'Unknown artist',
      album: song.album ?? '',
      artwork: art
        ? [
            { src: client!.coverArtUrl(song.coverArt ?? song.albumId, 192), sizes: '192x192' },
            { src: client!.coverArtUrl(song.coverArt ?? song.albumId, 384), sizes: '384x384' },
            { src: art, sizes: '512x512' },
          ]
        : [],
    })
  } catch {
    /* Firefox occasionally throws on artwork URLs */
  }
}

function updateMediaSessionState(playback: PlaybackState): void {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.playbackState =
    playback === 'playing' ? 'playing' : playback === 'paused' ? 'paused' : 'none'
}

function updatePositionState(currentTime: number, duration: number): void {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return
  if (!Number.isFinite(duration) || duration <= 0) return
  try {
    navigator.mediaSession.setPositionState({
      duration,
      position: Math.min(currentTime, duration),
      playbackRate: 1,
    })
  } catch {
    /* ignore */
  }
}

function setupMediaSession(get: () => PlayerState): void {
  if (!('mediaSession' in navigator)) return
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => void get().toggle()],
    ['pause', () => void get().toggle()],
    ['previoustrack', () => void get().previous()],
    ['nexttrack', () => void get().next(true)],
    ['stop', () => engine.pause()],
    [
      'seekto',
      (details) => {
        if (typeof details.seekTime === 'number') get().seek(details.seekTime)
      },
    ],
    ['seekbackward', (details) => get().seek(Math.max(0, engine.currentTime - (details.seekOffset ?? 10)))],
    ['seekforward', (details) => get().seek(engine.currentTime + (details.seekOffset ?? 10))],
  ]
  for (const [action, handler] of handlers) {
    try {
      navigator.mediaSession.setActionHandler(action, handler)
    } catch {
      /* action not supported in this browser */
    }
  }
}
