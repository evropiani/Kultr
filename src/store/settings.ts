import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light' | 'system'
export type GlassLevel = 'liquid' | 'frosted' | 'solid'
export type CrossfadeCurve = 'equalPower' | 'linear' | 'smooth' | 'sharp'
export type ReplayGainMode = 'off' | 'track' | 'album'
export type AudioEngineMode = 'auto' | 'webaudio' | 'element'
export type GridSize = 'small' | 'medium' | 'large'

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

  // ---- automix
  automixEnabled: boolean
  automixBeatMatch: boolean
  automixBassSwap: boolean
  automixHarmonic: boolean
  automixMaxTempoShift: number
  automixBars: number
  automixSkipIntro: boolean
  automixAutoQueue: boolean
  automixAnalyseAhead: boolean

  // ---- library
  autoSyncOnStart: boolean
  autoSyncMinutes: number
  syncPlaylistContents: boolean
  offlineFirst: boolean

  // ---- misc
  showLyrics: boolean
  showVisualizer: boolean
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

  automixEnabled: true,
  automixBeatMatch: true,
  automixBassSwap: true,
  automixHarmonic: true,
  automixMaxTempoShift: 8,
  automixBars: 8,
  automixSkipIntro: true,
  automixAutoQueue: true,
  automixAnalyseAhead: true,

  autoSyncOnStart: true,
  autoSyncMinutes: 60,
  syncPlaylistContents: true,
  offlineFirst: true,

  showLyrics: true,
  showVisualizer: true,
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
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { set: _set, merge: _merge, applyEqPreset: _apply, reset: _reset, ...rest } = state
        return rest as SettingsState
      },
      migrate: (persisted) => ({ ...DEFAULT_SETTINGS, ...(persisted as object) }) as SettingsState,
    },
  ),
)

/** Read settings outside React (audio engine, sync worker, ...). */
export const settings = () => useSettings.getState()
