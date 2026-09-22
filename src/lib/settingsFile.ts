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

/**
 * Lists whose length is fixed by the app rather than chosen by the person.
 * Everything else — the home shelves, favourite stations — is free to be any
 * length, so it must not be trimmed to however many the defaults happen to
 * have.
 */
const FIXED_LENGTH_KEYS = new Set(['eqGains'])

/** Never let anything credential-shaped through, whatever the file claims. */
const FORBIDDEN = /pass|secret|token|credential|server|username|auth/i

/**
 * A server as it appears in an export: where it is and what to call it, and
 * nothing you could sign in with. Usernames are left out along with passwords
 * — a username is half a credential and says who you are on that server.
 */
export interface ExportedServer {
  label: string
  serverUrl: string
  authMode?: 'token' | 'plain'
}

export interface SettingsFile {
  kind: typeof SETTINGS_FILE_KIND
  version: number
  exportedAt: string
  app: string
  settings: Record<string, unknown>
  /** Only present when the person explicitly asked to include them. */
  servers?: ExportedServer[]
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

export function buildSettingsFile(
  state: SettingsState,
  version: string,
  servers?: { label: string; serverUrl: string; authMode?: string }[],
): SettingsFile {
  const file: SettingsFile = {
    kind: SETTINGS_FILE_KIND,
    version: SETTINGS_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    app: `Kultr ${version}`,
    settings: exportableSettings(state),
  }
  if (servers) {
    // Rebuilt field by field rather than spread, so a profile growing a new
    // property later cannot quietly start appearing in exports.
    file.servers = servers.map((server) => ({
      label: server.label,
      serverUrl: server.serverUrl,
      authMode: server.authMode === 'plain' ? 'plain' : 'token',
    }))
  }
  return file
}

export interface ImportResult {
  patch: Partial<SettingsState>
  applied: string[]
  /** Keys in the file that were rejected, with the reason. */
  skipped: { key: string; why: string }[]
  /** Servers found in the file, scrubbed of anything credential-shaped. */
  servers: ExportedServer[]
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
      // An empty default says nothing about its element type, so those are
      // taken to be lists of ids — which is what all of them currently are.
      const elementType = typeof expected[0] === 'number' ? 'number' : 'string'
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== elementType)) {
        skipped.push({ key, why: 'wrong shape' })
        continue
      }
      patch[key] = FIXED_LENGTH_KEYS.has(key) ? value.slice(0, expected.length) : value
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

  const servers = readServers(root.servers)
  if (!applied.length && !servers.length) {
    throw new Error('Nothing in that file could be applied.')
  }
  return { patch: patch as Partial<SettingsState>, applied, skipped, servers }
}

/**
 * Whatever the file claims, a server comes back as a label, an address and an
 * auth mode. A hand-edited file cannot smuggle a username or a password in
 * through here, because nothing else is read.
 */
function readServers(input: unknown): ExportedServer[] {
  if (!Array.isArray(input)) return []
  const out: ExportedServer[] = []
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const serverUrl = typeof record.serverUrl === 'string' ? record.serverUrl : null
    if (serverUrl === null) continue
    out.push({
      label: typeof record.label === 'string' ? record.label : '',
      serverUrl,
      authMode: record.authMode === 'plain' ? 'plain' : 'token',
    })
  }
  return out
}

/** Save `file` to disk through the browser's normal download flow. */
export function downloadSettingsFile(file: SettingsFile): string {
  const suffix = file.servers ? '-with-servers' : ''
  const name = `kultr-settings${suffix}-${file.exportedAt.slice(0, 10)}.json`
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
