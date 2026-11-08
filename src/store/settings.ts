import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STATION_PRESETS, type Station } from '@/audio/stations'
import type { Annotation, Crate } from '@/lib/collection'

export type ThemeMode = 'dark' | 'light' | 'system'
export type GlassLevel = 'liquid' | 'frosted' | 'solid'
export type CrossfadeCurve = 'equalPower' | 'linear' | 'smooth' | 'sharp'
export type ReplayGainMode = 'off' | 'track' | 'album'
export type AudioEngineMode = 'auto' | 'webaudio' | 'element'
export type GridSize = 'small' | 'medium' | 'large'
/** How round the app's corners are. */
export type CornerStyle = 'sharp' | 'soft' | 'round'
/** Where the border colour of glass surfaces comes from. */
export type SurfaceBorder = 'neutral' | 'accent'
/** Look of the progress bar in the player. */
export type PlayheadStyle = 'minimal' | 'glow' | 'pulse' | 'wave' | 'comet' | 'equalizer'

export const PLAYHEAD_STYLES: { id: PlayheadStyle; name: string; note: string }[] = [
  { id: 'minimal', name: 'Minimal', note: 'A plain accent-coloured bar. Still.' },
  { id: 'glow', name: 'Glow', note: 'A soft halo that breathes around the playhead.' },
  { id: 'pulse', name: 'Pulse', note: 'A ring that expands out of the playhead in time.' },
  { id: 'wave', name: 'Wave', note: 'Diagonal light travelling along the played part.' },
  { id: 'comet', name: 'Comet', note: 'A bright head dragging a shimmering tail.' },
  { id: 'equalizer', name: 'Equalizer', note: 'Sliding bars, like a level meter.' },
]
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
  /**
   * Night mode: the dark theme in pure black, for OLED screens. Only takes
   * effect while the dark theme is showing, so it also follows System.
   */
  nightMode: boolean
  glass: GlassLevel
  accentMode: 'artwork' | 'fixed'
  accent: string
  /**
   * How strongly `accent` is mixed into the colour taken from the artwork,
   * 0–100. Think of it as the opacity of your colour laid over the artwork's.
   */
  accentBlend: number
  /** Borders of panels, cards and controls: neutral, or tinted with the accent. */
  surfaceBorder: SurfaceBorder
  /** Opacity of those borders, 0–100. */
  borderOpacity: number
  /** How solid glass panels are, as a percentage of the theme's own value. */
  surfaceOpacity: number
  corners: CornerStyle
  playhead: PlayheadStyle
  /** Whether the player's left-hand time counts up or down. */
  timeRemaining: boolean
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
  /**
   * Karousel: when the queue runs out, music like it keeps playing. Kept
   * under the name of the setting it replaced ("Keep playing similar music"),
   * which is also the name the other Kultr apps give it.
   */
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
  /**
   * Which shelves the home page shows, in order. Ids come from HOME_TILES;
   * anything missing from this list is switched off.
   */
  homeTiles: string[]
  /** Radio stations you have hearted. Navidrome has no concept of this. */
  favouriteRadios: string[]
  /** Stylesheet injected verbatim, last, so it can override anything. */
  customCss: string
  /**
   * Titles of the Settings sections left expanded. Everything starts closed —
   * the page is long enough that a list of headings is the more useful view.
   */
  openSettingsSections: string[]
  /** Right-hand pane of the full-screen player. */
  showPlayerPanel: boolean
  discordLikeRichPresence: boolean
  keyboardShortcuts: boolean
  hasSeenWelcome: boolean
  /** In a sleep timer's last 15 minutes, Karousel picks calmer music. */
  sleepWindDown: boolean
  /** Your stations, in the order the dial shows them. Decades are added from the library. */
  stations: Station[]
  /** Your notes and tags, by album ("album:<id>") or artist ("artist:<id>"). */
  annotations: Record<string, Annotation>
  /** Your crates, in the order Library shows them. */
  crates: Crate[]

  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
  merge: (patch: Partial<SettingsState>) => void
  applyEqPreset: (name: string) => void
  reset: () => void
}

export const DEFAULT_SETTINGS = {
  // Cream, as in Kultr for iOS: follows the device, one orange, flat colour.
  theme: 'system' as ThemeMode,
  nightMode: false,
  glass: 'liquid' as GlassLevel,
  accentMode: 'fixed' as 'artwork' | 'fixed',
  accent: '#ff7a3d',
  accentBlend: 0,
  surfaceBorder: 'neutral' as SurfaceBorder,
  borderOpacity: 45,
  surfaceOpacity: 100,
  corners: 'soft' as CornerStyle,
  playhead: 'minimal' as PlayheadStyle,
  timeRemaining: false,
  reduceMotion: false,
  backdropArtwork: false,
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
  homeTiles: ['stations', 'mostPlayedSongs', 'mostPlayedAlbums', 'rediscover', 'randomSongs', 'mostPlayedArtists'],
  favouriteRadios: [] as string[],
  customCss: '',
  openSettingsSections: [] as string[],
  showPlayerPanel: true,
  discordLikeRichPresence: false,
  keyboardShortcuts: true,
  hasSeenWelcome: false,
  sleepWindDown: true,
  stations: STATION_PRESETS,
  annotations: {} as Record<string, Annotation>,
  crates: [] as Crate[],
}

/** Brings settings saved by an older version up to date. */
export function migrateSettings(persisted: unknown, version: number): SettingsState {
  // v2 → v3 renamed every automix* key to injekt*. Without this, anyone
  // who had already tuned the mixer would silently get the defaults back.
  const old = { ...(persisted as Record<string, unknown>) }
  for (const key of Object.keys(old)) {
    if (key.startsWith('automix')) {
      const renamed = 'injekt' + key.slice('automix'.length)
      if (!(renamed in old)) old[renamed] = old[key]
      delete old[key]
    }
    // v3 → v4 removed the visualizer. Drop anything that is no longer a
    // setting rather than carrying dead keys forward forever.
    if (!(key in DEFAULT_SETTINGS)) delete old[key]
  }
  // v4 → v5 is the Cream look, once: the old defaults (periwinkle
  // taken from the artwork, the cover blurred behind every page,
  // accent-tinted borders) become the new ones. A colour someone picked
  // themselves is kept, and all of it can be switched back in
  // Settings → Appearance. Kultr for iOS moved its installs the same way.
  if (version < 5) {
    if (typeof old.accent !== 'string' || old.accent.toLowerCase() === '#7c8cff') old.accent = DEFAULT_SETTINGS.accent
    old.accentMode = DEFAULT_SETTINGS.accentMode
    old.backdropArtwork = DEFAULT_SETTINGS.backdropArtwork
    old.surfaceBorder = DEFAULT_SETTINGS.surfaceBorder
  }
  // v5 → v6 brings two shelves from Kultr for iOS to Home, once, where
  // they sit there: Stations first and Rediscover after the albums you play
  // most. Either can be switched off again in Settings → Home page.
  if (version < 6 && Array.isArray(old.homeTiles)) {
    const tiles = [...(old.homeTiles as string[])]
    if (!tiles.includes('stations')) tiles.unshift('stations')
    if (!tiles.includes('rediscover')) {
      const at = tiles.indexOf('mostPlayedAlbums')
      tiles.splice(at >= 0 ? at + 1 : tiles.length, 0, 'rediscover')
    }
    old.homeTiles = tiles
  }
  return { ...DEFAULT_SETTINGS, ...old } as SettingsState
}

/**
 * Whether Kultr had been used in this browser before this page load: read
 * before the store writes anything, so What's new can tell someone updating
 * from a first start.
 */
export const WAS_INSTALLED: boolean = (() => {
  try {
    return localStorage.getItem('kultr.settings') !== null || localStorage.getItem('kultr.auth') !== null
  } catch {
    return false
  }
})()

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
      version: 6,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { set: _set, merge: _merge, applyEqPreset: _apply, reset: _reset, ...rest } = state
        return rest as SettingsState
      },
      migrate: migrateSettings,
    },
  ),
)

/** Read settings outside React (audio engine, sync worker, ...). */
export const settings = () => useSettings.getState()
