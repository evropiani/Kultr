import type { AccentMode, CornerStyle, GridSize, PlayheadStyle, SettingsState, ThemeMode } from '@/store/settings'

/**
 * Kultr Studio: the whole look in one place, as a style that can be shared
 * as a link or a small file. The same JSON as Kultr for iOS (Studio.swift),
 * so a style made on the phone opens here and the other way round; the
 * fields the web has no use for (the iPhone player's blocks) travel along
 * untouched.
 */

export const PLAYER_BLOCKS = ['artwork', 'title', 'facts', 'progress', 'transport'] as const
export type PlayerBlock = (typeof PLAYER_BLOCKS)[number]

export interface StudioStyle {
  name: string
  theme: ThemeMode
  nightMode: boolean
  accentMode: AccentMode
  accent: string
  corners: CornerStyle
  gridSize: GridSize
  compactRows: boolean
  playhead: PlayheadStyle
  backdropArtwork: boolean
  clearGlass: boolean
  playerBlocks: PlayerBlock[]
  /** Empty for Kultr's own info line. */
  factsTemplate: string
}

type LookSettings = Pick<
  SettingsState,
  'theme' | 'nightMode' | 'accentMode' | 'accent' | 'corners' | 'gridSize' | 'compactRows' | 'playhead' | 'backdropArtwork' | 'clearGlass' | 'playerBlocks' | 'factsTemplate'
>

export function styleFrom(settings: LookSettings, name = 'My style'): StudioStyle {
  return {
    name,
    theme: settings.theme,
    nightMode: settings.nightMode,
    accentMode: settings.accentMode,
    accent: settings.accent,
    corners: settings.corners,
    gridSize: settings.gridSize,
    compactRows: settings.compactRows,
    playhead: settings.playhead,
    backdropArtwork: settings.backdropArtwork,
    clearGlass: settings.clearGlass,
    playerBlocks: [...(settings.playerBlocks as PlayerBlock[])],
    factsTemplate: settings.factsTemplate,
  }
}

/** The settings that make this look; everything that isn't the look stays. */
export function stylePatch(style: StudioStyle): Partial<SettingsState> {
  return {
    theme: style.theme,
    nightMode: style.nightMode,
    accentMode: style.accentMode,
    ...(/^#[0-9a-f]{6}$/i.test(style.accent) ? { accent: style.accent } : {}),
    corners: style.corners,
    gridSize: style.gridSize,
    compactRows: style.compactRows,
    playhead: style.playhead,
    backdropArtwork: style.backdropArtwork,
    clearGlass: style.clearGlass,
    playerBlocks: style.playerBlocks,
    factsTemplate: style.factsTemplate,
  }
}

/** Whether these settings look like `style` already. */
export function styleMatches(style: StudioStyle, settings: LookSettings): boolean {
  const a = { ...style, name: '' }
  const b = { ...styleFrom(settings), name: '' }
  return JSON.stringify(a) === JSON.stringify(b)
}

const LINK_PREFIX = 'kultr://style/'

/** The style as a link, like kultr://style/eyJuYW1l… */
export function styleLink(style: StudioStyle): string {
  const bytes = new TextEncoder().encode(JSON.stringify(style))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return LINK_PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const THEMES: ThemeMode[] = ['dark', 'light', 'system']
const ACCENTS: AccentMode[] = ['artwork', 'fixed']
const CORNERS: CornerStyle[] = ['sharp', 'soft', 'round']
const GRIDS: GridSize[] = ['small', 'medium', 'large']
const PLAYHEADS: PlayheadStyle[] = ['minimal', 'glow', 'pulse', 'wave', 'comet', 'equalizer']

/** A style from a link or a style file's text; anything missing or odd falls back to `base`. Null if it is not a style. */
export function readStyle(text: string, base: StudioStyle): StudioStyle | null {
  const trimmed = text.trim()
  let raw: unknown
  try {
    if (trimmed.startsWith('{')) raw = JSON.parse(trimmed)
    else {
      const at = trimmed.indexOf('style/')
      if (at < 0) return null
      let base64 = trimmed.slice(at + 6).replace(/-/g, '+').replace(/_/g, '/')
      while (base64.length % 4) base64 += '='
      const binary = atob(base64)
      raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))))
    }
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback)
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
  const blocks = Array.isArray(r.playerBlocks) ? r.playerBlocks.filter((b): b is PlayerBlock => PLAYER_BLOCKS.includes(b as PlayerBlock)) : []
  return {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : 'Shared style',
    theme: pick(r.theme, THEMES, base.theme),
    nightMode: bool(r.nightMode, base.nightMode),
    accentMode: pick(r.accentMode, ACCENTS, base.accentMode),
    accent: typeof r.accent === 'string' && /^#[0-9a-f]{6}$/i.test(r.accent) ? r.accent : base.accent,
    corners: pick(r.corners, CORNERS, base.corners),
    gridSize: pick(r.gridSize, GRIDS, base.gridSize),
    compactRows: bool(r.compactRows, base.compactRows),
    playhead: pick(r.playhead, PLAYHEADS, base.playhead),
    backdropArtwork: bool(r.backdropArtwork, base.backdropArtwork),
    clearGlass: bool(r.clearGlass, base.clearGlass),
    playerBlocks: blocks.length ? blocks : [...base.playerBlocks],
    factsTemplate: typeof r.factsTemplate === 'string' ? r.factsTemplate.slice(0, 300) : base.factsTemplate,
  }
}

/** Styles Kultr comes with, as on iOS. */
export function studioPresets(defaults: LookSettings): StudioStyle[] {
  const base = styleFrom(defaults, 'Cream')
  return [
    base,
    { ...base, name: 'Night', theme: 'dark', nightMode: true },
    { ...base, name: 'Ember', theme: 'dark', accentMode: 'artwork', backdropArtwork: true, playhead: 'glow', corners: 'round' },
    { ...base, name: 'Paper', theme: 'light', corners: 'sharp', compactRows: true, gridSize: 'small', clearGlass: true },
    {
      ...base,
      name: 'Console',
      theme: 'dark',
      corners: 'sharp',
      compactRows: true,
      playhead: 'equalizer',
      factsTemplate: '{?bpm:{bpm} BPM}{?key: · {key}}{?energy: · energy {energy}}{?format: · {format}}',
      playerBlocks: ['title', 'progress', 'transport', 'facts', 'artwork'],
    },
  ]
}

/**
 * A text template with conditions, for the player's info line:
 * "{year}{?genre: · {genre}}" shows the genre, and its dot, only when the
 * track has one. Unknown names come out empty.
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
  let out = ''
  let i = 0
  while (i < template.length) {
    const ch = template[i]
    if (ch !== '{') {
      out += ch
      i++
      continue
    }
    let depth = 0
    let j = i
    for (; j < template.length; j++) {
      if (template[j] === '{') depth++
      if (template[j] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    if (j >= template.length) {
      out += template.slice(i)
      break
    }
    const inner = template.slice(i + 1, j)
    const colon = inner.indexOf(':')
    if (inner.startsWith('?') && colon > 0) {
      const key = inner.slice(1, colon).trim()
      if (values[key]) out += renderTemplate(inner.slice(colon + 1), values)
    } else {
      out += values[inner.trim()] ?? ''
    }
    i = j + 1
  }
  return out
}

/** The names a template can use, with an example of each. */
export const TEMPLATE_FIELDS: [string, string][] = [
  ['year', '2019'],
  ['genre', 'Electronic'],
  ['format', 'FLAC'],
  ['bitrate', '1024'],
  ['bpm', '124'],
  ['key', '8A'],
  ['energy', '7'],
  ['rating', '4'],
  ['plays', '12'],
  ['album', 'Night Ferries'],
]
