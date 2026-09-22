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

console.log('\n== Files that are not ours are refused outright ==')
for (const [name, value] of [['null', null], ['a string', 'nope'], ['other json', { kind: 'something.else', settings: {} }], ['no settings', { kind: 'kultr.settings' }]] as [string, unknown][]) {
  let threw = false
  try { readSettingsFile(value) } catch { threw = true }
  assert(`${name} throws`, threw)
}

console.log(failures === 0 ? '\nALL SETTINGS-FILE CHECKS PASSED\n' : `\n${failures} SETTINGS-FILE CHECK(S) FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
