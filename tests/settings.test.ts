import {
  buildSettingsFile,
  exportableSettings,
  readSettingsFile,
} from '@/lib/settingsFile'
import { DEFAULT_SETTINGS } from '../src/store/settings'
import type { SettingsState } from '../src/store/settings'

let failures = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS  ${name} ${detail}`)
  else { failures++; console.log(`  FAIL  ${name} ${detail}`) }
}

const state = { ...DEFAULT_SETTINGS } as unknown as SettingsState

console.log('\n== Export leaves credentials and device state behind ==')
const exported = exportableSettings(state)
const keys = Object.keys(exported)
assert('carries the settings that matter', keys.includes('crossfadeSeconds') && keys.includes('injektBars') && keys.includes('theme'))
assert('no password-shaped key', !keys.some((k) => /pass|secret|token|credential|username|server|auth/i.test(k)), `-> ${keys.filter((k) => /pass|secret|token|credential|username|server|auth/i.test(k)).join(', ') || 'none'}`)
assert('the download folder stays on this device', !keys.includes('offlineFolderName') && !keys.includes('offlineDestination'))
assert('no store methods leak in', !keys.includes('set') && !keys.includes('merge') && !keys.includes('reset'))

console.log('\n== A file round-trips ==')
const file = buildSettingsFile({ ...state, crossfadeSeconds: 11, injektBars: 16 } as SettingsState, '1.1.0')
const back = readSettingsFile(JSON.parse(JSON.stringify(file)))
assert('values survive', (back.patch as Record<string, unknown>).crossfadeSeconds === 11 && (back.patch as Record<string, unknown>).injektBars === 16)
assert('nothing skipped from our own export', back.skipped.length === 0, `-> ${back.skipped.map((s) => s.key).join(', ')}`)

console.log('\n== A hostile or broken file is rejected key by key ==')
const hostile = readSettingsFile({
  kind: 'kultr.settings',
  version: 1,
  settings: {
    theme: 'light',
    password: 'hunter2',
    serverUrl: 'http://evil.example',
    authToken: 'abc',
    crossfadeSeconds: 'lots',
    injektBars: Number.NaN,
    offlineFolderName: '/etc',
    somethingMadeUp: true,
    eqGains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    homeTiles: ['randomSongs', 'radios', 'favouriteAlbums', 'recentlyAdded', 'randomAlbums'],
    favouriteRadios: [42],
  },
})
const why = (key: string) => hostile.skipped.find((s) => s.key === key)?.why ?? 'APPLIED'
assert('a good value is applied', hostile.applied.includes('theme') && (hostile.patch as Record<string, unknown>).theme === 'light')
assert('password refused', why('password') !== 'APPLIED', `-> ${why('password')}`)
assert('serverUrl refused', why('serverUrl') !== 'APPLIED', `-> ${why('serverUrl')}`)
assert('authToken refused', why('authToken') !== 'APPLIED', `-> ${why('authToken')}`)
assert('wrong type refused', why('crossfadeSeconds') === 'wrong type', `-> ${why('crossfadeSeconds')}`)
assert('NaN refused', why('injektBars') === 'not a number', `-> ${why('injektBars')}`)
assert('device-local key refused', why('offlineFolderName') !== 'APPLIED', `-> ${why('offlineFolderName')}`)
assert('unknown key refused', why('somethingMadeUp') === 'not a Kultr setting', `-> ${why('somethingMadeUp')}`)
assert('over-long eq trimmed to the real band count', ((hostile.patch as Record<string, unknown>).eqGains as number[]).length === DEFAULT_SETTINGS.eqGains.length)
assert('a free list keeps every entry', ((hostile.patch as Record<string, unknown>).homeTiles as string[]).length === 5, `-> ${((hostile.patch as Record<string, unknown>).homeTiles as string[] | undefined)?.length}`)
assert('a list of the wrong element type is refused', why('favouriteRadios') === 'wrong shape', `-> ${why('favouriteRadios')}`)

console.log('\n== Servers are only exported when asked for, and never with credentials ==')
const plain = buildSettingsFile(state, '1.2.1')
assert('a plain export has no servers field at all', plain.servers === undefined, `-> ${JSON.stringify(plain.servers)}`)

const withServers = buildSettingsFile(state, '1.2.1', [
  { label: 'Living room', serverUrl: 'https://music.example.com', authMode: 'token', username: 'senad', password: 'hunter2', id: 'x', enabled: true } as never,
])
assert('servers are included when asked for', withServers.servers?.length === 1)
const exportedServer = JSON.stringify(withServers.servers)
assert('no username survives the export', !/senad|username/i.test(exportedServer), `-> ${exportedServer}`)
assert('no password survives the export', !/hunter2|password/i.test(exportedServer), `-> ${exportedServer}`)
assert('only label, address and auth mode are written', Object.keys(withServers.servers![0]).sort().join(',') === 'authMode,label,serverUrl', `-> ${Object.keys(withServers.servers![0]).join(',')}`)
assert('the address is kept', withServers.servers![0].serverUrl === 'https://music.example.com')

console.log('\n== Servers are scrubbed again on the way back in ==')
const back2 = readSettingsFile({
  kind: 'kultr.settings',
  version: 1,
  settings: { theme: 'dark' },
  servers: [
    { label: 'Home', serverUrl: 'http://192.168.1.10:4533', username: 'sneaky', password: 'sneaky', authMode: 'plain' },
    { label: 'No address', authMode: 'token' },
    'not an object',
  ],
})
assert('a well-formed server is read', back2.servers.length === 1, `-> ${back2.servers.length}`)
assert('one without an address is dropped', !back2.servers.some((s) => !s.serverUrl))
assert('credentials in the file are ignored', Object.keys(back2.servers[0]).sort().join(',') === 'authMode,label,serverUrl', `-> ${Object.keys(back2.servers[0]).join(',')}`)
assert('a declared auth mode is honoured', back2.servers[0].authMode === 'plain', `-> ${back2.servers[0].authMode}`)
assert('a file with servers but no usable settings still imports', (() => {
  try { return readSettingsFile({ kind: 'kultr.settings', version: 1, settings: {}, servers: [{ label: 'a', serverUrl: 'http://x' }] }).servers.length === 1 } catch { return false }
})())

console.log('\n== Files that are not ours are refused outright ==')
for (const [name, value] of [['null', null], ['a string', 'nope'], ['other json', { kind: 'something.else', settings: {} }], ['no settings', { kind: 'kultr.settings' }]] as [string, unknown][]) {
  let threw = false
  try { readSettingsFile(value) } catch { threw = true }
  assert(`${name} throws`, threw)
}

console.log(failures === 0 ? '\nALL SETTINGS-FILE CHECKS PASSED\n' : `\n${failures} SETTINGS-FILE CHECK(S) FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
