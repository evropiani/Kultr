import { DEFAULT_SETTINGS, type SettingsState } from '@/store/settings'

/**
 * Settings backup — moving your setup to another browser or machine.
 *
 * Deliberately *not* included: servers, usernames, passwords or anything else
 * that could sign someone in. Those live in a different store entirely
 * (`kultr.auth`), and a settings file is the kind of thing people paste into
 * an issue or drop in a shared folder without thinking twice. Keeping
 * credentials out of it by construction means there is nothing to leak.
 */

export const SETTINGS_FILE_KIND = 'kultr.settings'
export const SETTINGS_FILE_VERSION = 1

/** Keys that are about *this* device, so restoring them elsewhere is wrong. */
const DEVICE_LOCAL_KEYS = [
  'offlineFolderName',
  'offlineDestination',
  'offlineDestinationChosen',
  'hasSeenWelcome',
  'muted',
] as const

/** Never let anything credential-shaped through, whatever the file claims. */
const FORBIDDEN = /pass|secret|token|credential|server|username|auth/i

export interface SettingsFile {
  kind: typeof SETTINGS_FILE_KIND
  version: number
  exportedAt: string
  app: string
  settings: Record<string, unknown>
}

/** Everything worth carrying to another browser. */
export function exportableSettings(state: SettingsState): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if ((DEVICE_LOCAL_KEYS as readonly string[]).includes(key)) continue
    if (FORBIDDEN.test(key)) continue
    const value = (state as unknown as Record<string, unknown>)[key]
    out[key] = Array.isArray(value) ? [...value] : value
  }
  return out
}

export function buildSettingsFile(state: SettingsState, version: string): SettingsFile {
  return {
    kind: SETTINGS_FILE_KIND,
    version: SETTINGS_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    app: `Kultr ${version}`,
    settings: exportableSettings(state),
  }
}

export interface ImportResult {
  patch: Partial<SettingsState>
  applied: string[]
  /** Keys in the file that were rejected, with the reason. */
  skipped: { key: string; why: string }[]
}

/**
 * Validate a parsed settings file against the defaults.
 *
 * Every key has to exist in Kultr and carry the same *type* as the default,
 * so a hand-edited or hostile file cannot inject anything: unknown keys, type
 * mismatches and anything credential-shaped are dropped rather than trusted.
 */
export function readSettingsFile(input: unknown): ImportResult {
  const skipped: { key: string; why: string }[] = []
  const patch: Record<string, unknown> = {}
  const applied: string[] = []

  const root = input as Partial<SettingsFile> | null
  if (!root || typeof root !== 'object') {
    throw new Error('That file is not a Kultr settings export.')
  }
  if (root.kind !== SETTINGS_FILE_KIND) {
    throw new Error('That file is not a Kultr settings export.')
  }
  const incoming = root.settings
  if (!incoming || typeof incoming !== 'object') {
    throw new Error('The file has no settings in it.')
  }

  const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
    if (!(key in defaults)) {
      skipped.push({ key, why: 'not a Kultr setting' })
      continue
    }
    if (FORBIDDEN.test(key)) {
      skipped.push({ key, why: 'credentials are never imported' })
      continue
    }
    if ((DEVICE_LOCAL_KEYS as readonly string[]).includes(key)) {
      skipped.push({ key, why: 'specific to the device it was exported from' })
      continue
    }
    const expected = defaults[key]
    if (Array.isArray(expected)) {
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'number')) {
        skipped.push({ key, why: 'wrong shape' })
        continue
      }
      // The equaliser has a fixed number of bands.
      patch[key] = (value as number[]).slice(0, expected.length)
      applied.push(key)
      continue
    }
    if (typeof value !== typeof expected || value === null) {
      skipped.push({ key, why: 'wrong type' })
      continue
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      skipped.push({ key, why: 'not a number' })
      continue
    }
    patch[key] = value
    applied.push(key)
  }

  if (!applied.length) throw new Error('Nothing in that file could be applied.')
  return { patch: patch as Partial<SettingsState>, applied, skipped }
}

/** Save `file` to disk through the browser's normal download flow. */
export function downloadSettingsFile(file: SettingsFile): string {
  const name = `kultr-settings-${file.exportedAt.slice(0, 10)}.json`
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked on a timer because Safari reads the blob after the click returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return name
}
