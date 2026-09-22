import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light' | 'system'
export type GlassLevel = 'liquid' | 'frosted' | 'solid'
export type CrossfadeCurve = 'equalPower' | 'linear' | 'smooth' | 'sharp'
export type ReplayGainMode = 'off' | 'track' | 'album'
export type AudioEngineMode = 'auto' | 'webaudio' | 'element'
export type GridSize = 'small' | 'medium' | 'large'
/** Where "save for offline" puts the audio. */
export type OfflineDestination = 'browser' | 'folder'

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Bass Reduce': [-6, -5, -4, -2, 0, 0, 0, 0, 0, 0],
  'Treble Boost': [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  Vocal: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
  Acoustic: [4, 3, 2, 0, 1, 1, 2, 3, 3, 2],
  Electronic: [5, 4, 1, 0, -2, 1, 0, 2, 4, 5],
  'Late Night': [-4, -3, -1, 1, 2, 2, 1, 0, -1, -2],
  Loudness: [6, 4, 0, -2, -3, -1, 1, 3, 5, 6],
}

export interface SettingsState {
  // ---- appearance
  theme: ThemeMode
  glass: GlassLevel
  accentMode: 'artwork' | 'fixed'
  accent: string
  reduceMotion: boolean
  backdropArtwork: boolean
  gridSize: GridSize
  compactRows: boolean

  // ---- playback
  volume: number
  muted: boolean
  crossfadeEnabled: boolean
  crossfadeSeconds: number
  crossfadeCurve: CrossfadeCurve
  crossfadeOnSkip: boolean
  gapless: boolean
  preloadNext: boolean
  replayGainMode: ReplayGainMode
  replayGainPreamp: number
  audioEngine: AudioEngineMode
  preferredBitrate: number
  preferredFormat: string
  scrobble: boolean
  resumeOnStart: boolean
  skipSilence: boolean

  // ---- equaliser
  eqEnabled: boolean
  eqPreset: string
  eqGains: number[]
  eqPreamp: number

  // ---- injekt
  injektEnabled: boolean
  injektBeatMatch: boolean
  injektBassSwap: boolean
  injektHarmonic: boolean
  injektMaxTempoShift: number
  /** Ease the *current* track toward the next one's tempo before the blend. */
  injektTempoRamp: boolean
  /** Share of the tempo gap the current track closes, 0–100. */
  injektTempoBlend: number
  injektBars: number
  injektSkipIntro: boolean
  injektAutoQueue: boolean
  injektAnalyseAhead: boolean

  // ---- offline
  offlineDestination: OfflineDestination
  /** Display name of the chosen folder; the handle itself lives in IndexedDB. */
  offlineFolderName: string
  offlineConcurrency: number
  /** Whether the person has been asked where downloads should go. */
  offlineDestinationChosen: boolean

  // ---- library
  autoSyncOnStart: boolean
  autoSyncMinutes: number
  syncPlaylistContents: boolean
  offlineFirst: boolean

  // ---- misc
  showLyrics: boolean
  showVisualizer: boolean
  /** Right-hand pane of the full-screen player. */
  showPlayerPanel: boolean
  discordLikeRichPresence: boolean
  keyboardShortcuts: boolean
  hasSeenWelcome: boolean

  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
  merge: (patch: Partial<SettingsState>) => void
  applyEqPreset: (name: string) => void
  reset: () => void
}

export const DEFAULT_SETTINGS = {
  theme: 'dark' as ThemeMode,
  glass: 'liquid' as GlassLevel,
  accentMode: 'artwork' as const,
  accent: '#7c8cff',
  reduceMotion: false,
  backdropArtwork: true,
  gridSize: 'medium' as GridSize,
  compactRows: false,

  volume: 0.85,
  muted: false,
  crossfadeEnabled: true,
  crossfadeSeconds: 6,
  crossfadeCurve: 'equalPower' as CrossfadeCurve,
  crossfadeOnSkip: true,
  gapless: true,
  preloadNext: true,
  replayGainMode: 'track' as ReplayGainMode,
  replayGainPreamp: 0,
  audioEngine: 'auto' as AudioEngineMode,
  preferredBitrate: 0,
  preferredFormat: '',
  scrobble: true,
  resumeOnStart: true,
  skipSilence: false,

  eqEnabled: false,
  eqPreset: 'Flat',
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  eqPreamp: 0,

  injektEnabled: true,
  injektBeatMatch: true,
  injektBassSwap: true,
  injektHarmonic: true,
  injektMaxTempoShift: 8,
  injektTempoRamp: true,
  injektTempoBlend: 50,
  injektBars: 8,
  injektSkipIntro: true,
  injektAutoQueue: true,
  injektAnalyseAhead: true,

  offlineDestination: 'browser' as OfflineDestination,
  offlineFolderName: '',
  offlineConcurrency: 3,
  offlineDestinationChosen: false,

  autoSyncOnStart: true,
  autoSyncMinutes: 60,
  syncPlaylistContents: true,
  offlineFirst: true,

  showLyrics: true,
  showVisualizer: true,
  showPlayerPanel: true,
  discordLikeRichPresence: false,
  keyboardShortcuts: true,
  hasSeenWelcome: false,
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      merge: (patch) => set(patch),
      applyEqPreset: (name) =>
        set({ eqPreset: name, eqGains: [...(EQ_PRESETS[name] ?? EQ_PRESETS.Flat)] }),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'kultr.settings',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { set: _set, merge: _merge, applyEqPreset: _apply, reset: _reset, ...rest } = state
        return rest as SettingsState
      },
      migrate: (persisted) => {
        // v2 → v3 renamed every automix* key to injekt*. Without this, anyone
        // who had already tuned the mixer would silently get the defaults back.
        const old = { ...(persisted as Record<string, unknown>) }
        for (const key of Object.keys(old)) {
          if (key.startsWith('automix')) {
            const renamed = 'injekt' + key.slice('automix'.length)
            if (!(renamed in old)) old[renamed] = old[key]
            delete old[key]
          }
        }
        return { ...DEFAULT_SETTINGS, ...old } as SettingsState
      },
    },
  ),
)

/** Read settings outside React (audio engine, sync worker, ...). */
export const settings = () => useSettings.getState()
