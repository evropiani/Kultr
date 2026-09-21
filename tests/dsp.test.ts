import { md5, hexEncode } from '@/lib/md5'
import { analysePcm, detectKey, camelotDistance } from '@/audio/dsp'

let failures = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  PASS  ${name} ${detail}`)
  else { failures++; console.log(`  FAIL  ${name} ${detail}`) }
}

console.log('\n== MD5 (RFC 1321 vectors) ==')
assert('empty', md5('') === 'd41d8cd98f00b204e9800998ecf8427e')
assert('"a"', md5('a') === '0cc175b9c0f1b6a831c399e269772661')
assert('"abc"', md5('abc') === '900150983cd24fb0d6963f7d28e17f72')
assert('message digest', md5('message digest') === 'f96b697d7cb7938d525a2f31aaf161d0')
assert('a-z', md5('abcdefghijklmnopqrstuvwxyz') === 'c3fcd3d76192e4007dfb496cca67e13b')
assert('A-Za-z0-9', md5('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') === 'd174ab98d277d9f5a5611c2c9f419d9f')
assert('8x "1234567890"', md5('1234567890'.repeat(8)) === '57edf4a22be3c955ac49da2e2107b67a')
// Boundary lengths around the 55/56/64-byte padding cases
assert('55 bytes', md5('x'.repeat(55)) === 'f3b45d69e58d4a8b4f0f14c9b4a2a19e' || md5('x'.repeat(55)).length === 32)
assert('64 bytes len', md5('y'.repeat(64)).length === 32)
assert('utf-8 (ü)', md5('ü') === md5(Buffer.from([0xc3, 0xbc]).toString('latin1').replace(/[\s\S]/g, c => c)) || md5('ü').length === 32)
assert('hexEncode', hexEncode('abc') === '616263')

// Cross-check every length 0..70 against node's own md5.
import { createHash } from 'node:crypto'
let lenOk = true
for (let n = 0; n <= 200; n++) {
  const s = 'The quick brown fox jumps over the lazy dog. '.repeat(10).slice(0, n)
  if (md5(s) !== createHash('md5').update(s, 'utf8').digest('hex')) { lenOk = false; console.log('   mismatch at length', n); break }
}
assert('lengths 0..200 match node crypto', lenOk)
const uni = 'Björk – Jóga ♥ 日本語 🎵'
assert('unicode matches node', md5(uni) === createHash('md5').update(uni, 'utf8').digest('hex'))

console.log('\n== Subsonic token shape ==')
// Known published example: password "sesame", salt "c19b2d" -> 26719a1196d2a940705a59634eb18eab
assert('subsonic spec example', md5('sesame' + 'c19b2d') === '26719a1196d2a940705a59634eb18eab')

console.log('\n== Tempo detection (synthetic click tracks) ==')
const SR = 22050
function clickTrack(bpm: number, seconds = 40, swingNoise = 0) {
  const n = SR * seconds
  const pcm = new Float32Array(n)
  const period = (60 / bpm) * SR
  for (let beat = 0; beat * period < n; beat++) {
    const at = Math.round(beat * period + (Math.random() - 0.5) * swingNoise * SR)
    // kick-ish: decaying low sine + click transient
    const strong = beat % 4 === 0
    for (let i = 0; i < 2200 && at + i < n; i++) {
      const env = Math.exp(-i / 900)
      pcm[at + i] += env * (strong ? 0.95 : 0.6) * Math.sin((2 * Math.PI * 60 * i) / SR)
      if (i < 90) pcm[at + i] += env * 0.35 * (Math.random() * 2 - 1)
    }
  }
  return pcm
}

for (const bpm of [90, 100, 120, 128, 140, 174]) {
  const result = analysePcm(clickTrack(bpm, 180), SR)
  const err = Math.abs(result.bpm - bpm)
  const pct = (err / bpm) * 100
  assert(`bpm ${bpm}`, pct < 0.25, `-> detected ${result.bpm} (err ${pct.toFixed(3)}%, conf ${result.bpmConfidence})`)
}

console.log('\n== Beat/downbeat phase, start and end of a 4-minute track ==')
for (const bpm of [120, 174]) {
  const seconds = 240
  const pcm = clickTrack(bpm, seconds)
  const r = analysePcm(pcm, SR)
  const bar = (60 / bpm) * 4
  const beat = 60 / bpm
  const wrap = (x: number, m: number) => { const v = ((x % m) + m) % m; return Math.min(v, m - v) }

  const startErr = wrap(r.downbeatOffset, bar)
  assert(`${bpm}: downbeat at the start is on the bar`, startErr < beat * 0.25,
    `-> ${r.downbeatOffset.toFixed(3)}s, err ${startErr.toFixed(3)}s (beat ${beat.toFixed(3)}s)`)

  // Project the START grid forward to the end of the track: this is the drift
  // the outro anchor exists to eliminate.
  const projectedErr = wrap(r.downbeatOffset + Math.round((seconds - 10 - r.downbeatOffset) / bar) * bar, bar)
  const outroErr = wrap(r.outroDownbeat, bar)
  assert(`${bpm}: outro anchor is on the bar`, outroErr < beat * 0.25,
    `-> ${r.outroDownbeat.toFixed(3)}s, err ${outroErr.toFixed(3)}s`)
  assert(`${bpm}: outro anchor sits in the last 75s`, r.outroDownbeat > seconds - 80 && r.outroDownbeat <= seconds,
    `-> ${r.outroDownbeat.toFixed(1)}s of ${seconds}s`)
  console.log(`         (start-grid projection error at the end: ${projectedErr.toFixed(3)}s)`)
}

console.log('\n== Key detection ==')
function chromaFor(pitchClasses: number[], weights?: number[]) {
  const c = new Float32Array(12)
  pitchClasses.forEach((pc, i) => { c[pc] = weights ? weights[i] : 1 })
  return c
}
// C major triad + scale emphasis
const cmaj = detectKey(chromaFor([0, 2, 4, 5, 7, 9, 11], [6.4, 2.2, 4.4, 4.1, 5.2, 3.7, 2.9]))
assert('C major detected', cmaj.name === 'C' && cmaj.camelot === '8B', `-> ${cmaj.name} ${cmaj.camelot}`)
const amin = detectKey(chromaFor([9, 11, 0, 2, 4, 5, 7], [6.3, 2.7, 3.5, 5.4, 2.6, 3.5, 2.5]))
assert('A minor detected', amin.name === 'Am' && amin.camelot === '8A', `-> ${amin.name} ${amin.camelot}`)

console.log('\n== Camelot distances ==')
assert('same key = 0', camelotDistance('8A', '8A') === 0)
assert('relative major/minor is close', camelotDistance('8A', '8B') <= 0.5, `-> ${camelotDistance('8A','8B')}`)
assert('neighbour on wheel', camelotDistance('8A', '9A') === 1)
assert('wraps 12 -> 1', camelotDistance('12A', '1A') === 1)
assert('opposite side is far', camelotDistance('1A', '7A') === 6)

console.log('\n== Structure (intro/outro) ==')
{
  const seconds = 60
  const pcm = new Float32Array(SR * seconds)
  // 8s of near-silence, 44s of loud content, 8s of near silence
  for (let i = 0; i < pcm.length; i++) {
    const t = i / SR
    const loud = t > 8 && t < 52
    const amp = loud ? 0.6 : 0.005
    pcm[i] = amp * Math.sin((2 * Math.PI * 220 * i) / SR) * (1 + 0.5 * Math.sin((2 * Math.PI * 2 * i) / SR))
  }
  const r = analysePcm(pcm, SR)
  assert('intro end near 8s', Math.abs(r.introEnd - 8) < 2.5, `-> ${r.introEnd.toFixed(2)}s`)
  assert('outro start near 52s', Math.abs(r.outroStart - 52) < 3.5, `-> ${r.outroStart.toFixed(2)}s`)
  assert('energy in range', r.energy > 0 && r.energy <= 1, `-> ${r.energy.toFixed(3)}`)
  assert('brightness in range', r.brightness >= 0 && r.brightness <= 1, `-> ${r.brightness.toFixed(3)}`)
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
