import { planTransition } from '@/audio/injekt'
import { ANALYSES } from './stubs/stub-db'
import { CURRENT } from './stubs/stub-settings'
import type { TrackAnalysis } from '@/audio/analysis'
import type { Song } from '@/api/types'

let failures = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS  ${name} ${detail}`)
  else { failures++; console.log(`  FAIL  ${name} ${detail}`) }
}

function analysis(id: string, o: Partial<TrackAnalysis>): TrackAnalysis {
  const base: TrackAnalysis = {
    songId: id, version: 4, analysedAt: 0, bpmSource: 'dsp',
    duration: 240, bpm: 120, bpmConfidence: 0.9,
    beatOffset: 0, downbeatOffset: 0, outroDownbeat: 200,
    key: 0, keyName: 'C', mode: 'major', keyConfidence: 0.5, camelot: '8B',
    energy: 0.5, brightness: 0.4, peak: 0.9, introEnd: 6, outroStart: 210,
    ...o,
  }
  ANALYSES.set(id, base)
  return base
}
const song = (id: string, duration = 240): Song => ({ id, title: id, duration })

function reset() { ANALYSES.clear(); Object.assign(CURRENT, { injektEnabled: true, crossfadeEnabled: true, crossfadeSeconds: 6, injektBeatMatch: true, injektBassSwap: true, injektHarmonic: true, injektMaxTempoShift: 8, injektTempoRamp: true, injektTempoBlend: 50, injektBars: 8, injektSkipIntro: true, gapless: true, crossfadeCurve: 'equalPower' }) }

async function main() {
  console.log('\n== Plain crossfade (InjeKt off) ==')
  reset(); CURRENT.injektEnabled = false
  let p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 200 })
  assert('type is crossfade', p.type === 'crossfade', `-> ${p.type}`)
  assert('uses the configured length', Math.abs(p.duration - 6) < 0.01, `-> ${p.duration}s`)
  assert('ends exactly at the end of the track', Math.abs(p.startAt + p.duration - 240) < 0.01, `-> starts ${p.startAt}s`)
  assert('no tempo change', p.incomingRate === 1)

  console.log('\n== Crossfade off + gapless ==')
  reset(); CURRENT.injektEnabled = false; CURRENT.crossfadeEnabled = false
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 200 })
  assert('type is gapless', p.type === 'gapless', `-> ${p.type}`)
  assert('overlap is negligible', p.duration < 0.3, `-> ${p.duration}s`)

  console.log('\n== Crossfade off + gapless off ==')
  reset(); CURRENT.injektEnabled = false; CURRENT.crossfadeEnabled = false; CURRENT.gapless = false
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 200 })
  assert('type is cut', p.type === 'cut', `-> ${p.type}`)
  assert('no overlap', p.duration === 0)

  console.log('\n== InjeKt: close tempos, compatible keys -> beat-matched blend ==')
  reset()
  analysis('a', { bpm: 124, camelot: '8A', energy: 0.6, outroStart: 205, outroDownbeat: 203.2258 })
  analysis('b', { bpm: 126, camelot: '9A', energy: 0.62, introEnd: 12 })
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('type is blend', p.type === 'blend', `-> ${p.type}`)
  {
    // Both decks move: they meet at the geometric mean of the two tempos.
    const meet = Math.sqrt(124 * 126)
    assert('the two decks meet at a shared tempo', Math.abs(p.outgoingRate * 124 - p.incomingRate * 126) < 1e-9, `-> ${(p.outgoingRate * 124).toFixed(4)} vs ${(p.incomingRate * 126).toFixed(4)} BPM`)
    assert('meeting tempo is between the two', Math.abs(p.outgoingRate * 124 - meet) < 1e-6, `-> ${(p.outgoingRate * 124).toFixed(3)} BPM`)
    assert('current track speeds up toward it', p.outgoingRate > 1 && Math.abs(p.outgoingRate - meet / 124) < 1e-9, `-> rate ${p.outgoingRate.toFixed(5)} (+${((p.outgoingRate - 1) * 100).toFixed(2)}%)`)
    assert('next track slows down toward it', p.incomingRate < 1 && Math.abs(p.incomingRate - meet / 126) < 1e-9, `-> rate ${p.incomingRate.toFixed(5)} (${((p.incomingRate - 1) * 100).toFixed(2)}%)`)
    assert('each deck moves less than it would alone', Math.abs(p.incomingRate - 1) < Math.abs(124 / 126 - 1), `-> ${((p.incomingRate - 1) * 100).toFixed(2)}% vs ${((124 / 126 - 1) * 100).toFixed(2)}%`)
    assert('current track is eased in before the blend', p.outgoingRamp > 0, `-> ${p.outgoingRamp.toFixed(1)}s`)
    assert('the ramp does not reach into the past', p.startAt - p.outgoingRamp >= 190, `-> starts drifting at ${(p.startAt - p.outgoingRamp).toFixed(2)}s, now is 190s`)
  }
  assert('bass swap on', p.bassSwap)
  assert('no filter sweep (keys agree)', !p.sweep)
  assert('8 bars of the meeting tempo', Math.abs(p.duration - (8 * 4 * 60 / 124) / p.outgoingRate) < 0.05, `-> ${p.duration.toFixed(2)}s`)
  assert('starts at/near the outro', p.startAt <= 205 && p.startAt > 195, `-> ${p.startAt.toFixed(2)}s`)
  {
    const bar = (60 / 124) * 4
    const off = Math.abs(((p.startAt - 203.2258) / bar) - Math.round((p.startAt - 203.2258) / bar)) * bar
    assert('start sits exactly on a bar of the outgoing track', off < 0.01, `-> ${off.toFixed(4)}s off the grid`)
  }
  assert('overlap fits inside the track', p.startAt + p.duration * p.outgoingRate <= 240.01, `-> ends ${(p.startAt + p.duration * p.outgoingRate).toFixed(2)}s`)
  assert('skips the intro of the next track', p.inStartOffset >= 12, `-> ${p.inStartOffset.toFixed(2)}s`)
  assert('tempo is released afterwards', p.tempoRelease > 0, `-> ${p.tempoRelease.toFixed(1)}s`)

  console.log('\n== InjeKt: far apart tempos -> no stretch ==')
  reset()
  analysis('a', { bpm: 90, camelot: '8A' }); analysis('b', { bpm: 145, camelot: '8A' })
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('no beat-match attempted', p.incomingRate === 1, `-> rate ${p.incomingRate}`)
  assert('falls back to a plain crossfade', p.type === 'crossfade', `-> ${p.type}`)

  console.log('\n== InjeKt: half-time relationship is matched ==')
  reset()
  analysis('a', { bpm: 140, camelot: '8A' }); analysis('b', { bpm: 70, camelot: '8A' })
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('70bpm treated as double-time of 140', Math.abs(p.incomingRate - 1) < 1e-6, `-> rate ${p.incomingRate.toFixed(4)}`)
  assert('blends rather than crossfades', p.type === 'blend', `-> ${p.type}`)

  console.log('\n== InjeKt: clashing keys -> filter sweep ==')
  reset()
  analysis('a', { bpm: 124, camelot: '1A' }); analysis('b', { bpm: 125, camelot: '7B' })
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('type is sweep', p.type === 'sweep', `-> ${p.type}`)
  assert('sweep flag set', p.sweep)
  assert('shortened to 4 bars', p.duration <= 4 * 4 * 60 / 124 + 0.05, `-> ${p.duration.toFixed(2)}s`)
  assert('sharp curve', p.curve === 'sharp', `-> ${p.curve}`)

  console.log('\n== InjeKt: big energy jump shortens the blend ==')
  reset()
  analysis('a', { bpm: 120, energy: 0.15, camelot: '8A' }); analysis('b', { bpm: 121, energy: 0.9, camelot: '8A' })
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('4 bars, not 8', p.duration <= 4 * 4 * 60 / 120 + 0.05, `-> ${p.duration.toFixed(2)}s`)

  console.log('\n== Safety: plan is never scheduled in the past ==')
  reset()
  analysis('a', { bpm: 124, outroStart: 60, outroDownbeat: 58 }); analysis('b', { bpm: 125 })
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 200 })
  assert('starts after "now"', p.startAt >= 200, `-> startAt ${p.startAt.toFixed(2)}s vs now 200s`)
  assert('still fits in the track', p.startAt + p.duration <= 240.01, `-> ends ${(p.startAt + p.duration).toFixed(2)}s`)
  {
    // The point of this case: being pushed forward must not break alignment.
    const bar = (60 / 124) * 4
    const origin = 58
    const off = Math.abs(((p.startAt - origin) / bar) - Math.round((p.startAt - origin) / bar)) * bar
    assert('pushed-forward start is still on a bar', !p.bassSwap || off < 0.01, `-> ${off.toFixed(4)}s off the grid`)
  }

  console.log('\n== Safety: very short track ==')
  reset()
  analysis('a', { bpm: 120, duration: 20, outroStart: 15, outroDownbeat: 14 }); analysis('b', { bpm: 120 })
  p = await planTransition(song('a', 20), song('b'), { durationA: 20, currentTime: 5 })
  assert('overlap never exceeds 35% of the track', p.duration <= 20 * 0.35 + 0.01, `-> ${p.duration.toFixed(2)}s`)
  assert('start is inside the track', p.startAt >= 0 && p.startAt < 20, `-> ${p.startAt.toFixed(2)}s`)

  console.log('\n== Safety: no analysis available ==')
  reset()
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 200 })
  assert('degrades to a crossfade', p.type === 'crossfade', `-> ${p.type}`)

  console.log('\n== Safety: unknown duration ==')
  reset()
  p = await planTransition({ id: 'a', title: 'a' }, song('b'), { durationA: 0, currentTime: 0 })
  assert('no crash, gapless fallback', p.type === 'gapless', `-> ${p.type}`)

  console.log('\n== Tempo shift limit is respected ==')
  reset(); CURRENT.injektMaxTempoShift = 2
  analysis('a', { bpm: 120, camelot: '8A' }); analysis('b', { bpm: 126, camelot: '8A' })
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('5% shift rejected when limit is 2%', p.incomingRate === 1, `-> rate ${p.incomingRate}`)
  CURRENT.injektMaxTempoShift = 8
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('5% shift accepted when limit is 8%', Math.abs(p.incomingRate - Math.sqrt(120 / 126)) < 1e-6, `-> rate ${p.incomingRate.toFixed(4)}`)
  assert('neither deck exceeds the limit', Math.max(Math.abs(p.incomingRate - 1), Math.abs(p.outgoingRate - 1)) <= 0.08, `-> worst ${(Math.max(Math.abs(p.incomingRate - 1), Math.abs(p.outgoingRate - 1)) * 100).toFixed(2)}%`)

  console.log('\n== Tempo blend share ==')
  reset(); CURRENT.injektTempoBlend = 0
  analysis('a', { bpm: 124, camelot: '8A' }); analysis('b', { bpm: 126, camelot: '8A' })
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('at 0% the current track is left alone', p.outgoingRate === 1 && Math.abs(p.incomingRate - 124 / 126) < 1e-9, `-> out ${p.outgoingRate}, in ${p.incomingRate.toFixed(5)}`)
  assert('and there is nothing to ramp', p.outgoingRamp === 0, `-> ${p.outgoingRamp}`)
  CURRENT.injektTempoBlend = 100
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('at 100% the current track does all the moving', Math.abs(p.incomingRate - 1) < 1e-9 && Math.abs(p.outgoingRate - 126 / 124) < 1e-9, `-> out ${p.outgoingRate.toFixed(5)}, in ${p.incomingRate}`)
  CURRENT.injektTempoBlend = 50; CURRENT.injektTempoRamp = false
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('switched off, only the next track moves', p.outgoingRate === 1 && p.outgoingRamp === 0, `-> out ${p.outgoingRate}`)

  console.log('\n== Splitting the shift widens what can be matched ==')
  reset(); CURRENT.injektMaxTempoShift = 4; CURRENT.injektTempoBlend = 0
  analysis('a', { bpm: 120, camelot: '8A' }); analysis('b', { bpm: 128, camelot: '8A' })
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('6.3% is too far for one deck alone', p.incomingRate === 1, `-> rate ${p.incomingRate}`)
  CURRENT.injektTempoBlend = 50
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('but fine when shared between two', p.type === 'blend' && Math.abs(p.incomingRate - 1) > 1e-6, `-> ${p.type}, in ${p.incomingRate.toFixed(4)}, out ${p.outgoingRate.toFixed(4)}`)

  console.log('\n== Low BPM confidence disables beat-matching ==')
  reset()
  analysis('a', { bpm: 124, bpmConfidence: 0.05, camelot: '8A' }); analysis('b', { bpm: 125, bpmConfidence: 0.9, camelot: '8A' })
  p = await planTransition(song('a'), song('b'), { durationA: 240, currentTime: 190 })
  assert('does not stretch on a shaky estimate', p.incomingRate === 1, `-> rate ${p.incomingRate}`)

  console.log(failures === 0 ? '\nALL PLANNER CHECKS PASSED\n' : `\n${failures} PLANNER CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
}
void main()
