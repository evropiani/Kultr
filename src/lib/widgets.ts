/**
 * Widgets at the top of Home, as in Kultr for iOS (Studio.swift): now
 * playing, your listening this week, the next mix, a station, a crate or a
 * shortcut, small (half the width) or medium and large (the whole width).
 * Same JSON, so they travel in a settings file.
 */

export type WidgetKind = 'nowPlaying' | 'listening' | 'nextMix' | 'station' | 'crate' | 'shortcut'
export type WidgetSize = 'small' | 'medium' | 'large'

export interface HomeWidget {
  id: string
  kind: WidgetKind
  size: WidgetSize
  /** The station's or crate's id, or the shortcut's words ("sleep in 30 minutes"). */
  ref?: string | null
}

export const WIDGET_KINDS: { kind: WidgetKind; label: string; note: string }[] = [
  { kind: 'nowPlaying', label: 'Now playing', note: 'The track, with play and skip. Click to open the player.' },
  { kind: 'listening', label: 'Listening this week', note: 'Hours this week, against your usual.' },
  { kind: 'nextMix', label: 'Next mix', note: 'What InjeKt plays next, and how.' },
  { kind: 'station', label: 'A station', note: 'One click starts it.' },
  { kind: 'crate', label: 'A crate', note: 'Its covers; click to play it.' },
  { kind: 'shortcut', label: 'A shortcut', note: 'One click for anything you would type in search.' },
]

export const DEFAULT_HOME_WIDGETS: HomeWidget[] = [
  { id: 'now', kind: 'nowPlaying', size: 'medium' },
  { id: 'listening', kind: 'listening', size: 'small' },
  { id: 'next', kind: 'nextMix', size: 'small' },
]

/** Small widgets side by side, medium and large across the width: rows of indices. */
export function widgetRows(widgets: HomeWidget[]): number[][] {
  const rows: number[][] = []
  let pending: number | null = null
  widgets.forEach((widget, i) => {
    if (widget.size === 'small') {
      if (pending !== null) {
        rows.push([pending, i])
        pending = null
      } else pending = i
    } else {
      if (pending !== null) {
        rows.push([pending])
        pending = null
      }
      rows.push([i])
    }
  })
  if (pending !== null) rows.push([pending])
  return rows
}

const KINDS = new Set(WIDGET_KINDS.map((entry) => entry.kind))
const SIZES = new Set<WidgetSize>(['small', 'medium', 'large'])

/** Widgets from a settings file or another app; anything unreadable is left out. */
export function readWidgets(raw: unknown): HomeWidget[] | null {
  if (!Array.isArray(raw)) return null
  return raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const r = entry as Record<string, unknown>
    if (!KINDS.has(r.kind as WidgetKind)) return []
    return [
      {
        id: typeof r.id === 'string' && r.id ? r.id : `w${index}`,
        kind: r.kind as WidgetKind,
        size: SIZES.has(r.size as WidgetSize) ? (r.size as WidgetSize) : 'small',
        ref: typeof r.ref === 'string' ? r.ref : null,
      },
    ]
  })
}
