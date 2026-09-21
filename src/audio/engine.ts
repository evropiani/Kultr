import type { Song } from '@/api/types'
import { getClient } from '@/api/subsonic'
import { getOffline } from '@/db'
import { getStoredFolder, readFromFolder } from '@/lib/filesystem'
import { EQ_BANDS, settings, type CrossfadeCurve } from '@/store/settings'
import { getAudioContext, isWebAudioSupported, unlockAudio } from './context'
import type { TransitionPlan } from './injekt'

/**
 * Two-deck audio engine.
 *
 * Deck A and deck B are real <audio> elements. Whenever crossfade or InjeKt is
 * active the next track is loaded on the idle deck and both play at once for
 * the length of the transition, each through its own gain (and, in Web Audio
 * mode, its own low-shelf and high-pass filter so we can swap basslines and
 * sweep out of a track the way a DJ would).
 *
 * If Web Audio is unavailable — or the audio turns out not to be CORS-readable,
 * which silences MediaElementSource — the engine drops to "element" mode and
 * crossfades with plain element volume instead. Everything still works; only
 * the EQ, visualizer and bass-swap parts of InjeKt go away.
 */

export type EngineMode = 'webaudio' | 'element'
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface EngineCallbacks {
  onState: (state: PlaybackState) => void
  onTime: (currentTime: number, duration: number) => void
  /** The engine moved to a new track on its own (transition or natural end). */
  onAdvance: (reason: 'transition' | 'ended') => void
  /** Asks the app to compute and hand back a transition plan for the next track. */
  prepareNext: (secondsRemaining: number) => void
  onTransitionStart: (plan: TransitionPlan, song: Song) => void
  onTransitionEnd: () => void
  onError: (message: string) => void
  onModeChange: (mode: EngineMode, reason: string) => void
}

const noop = () => {}

const DEFAULT_CALLBACKS: EngineCallbacks = {
  onState: noop,
  onTime: noop,
  onAdvance: noop,
  prepareNext: noop,
  onTransitionStart: noop,
  onTransitionEnd: noop,
  onError: noop,
  onModeChange: noop,
}

/** How early we ask the app for the next track's transition plan. */
const PREPARE_LEAD_SECONDS = 35
const CURVE_POINTS = 256

interface Deck {
  id: 'a' | 'b'
  el: HTMLAudioElement
  source: MediaElementAudioSourceNode | null
  gain: GainNode | null
  bass: BiquadFilterNode | null
  sweep: BiquadFilterNode | null
  song: Song | null
  /** Base level from ReplayGain/normalisation, 0..1. */
  base: number
  /** Fade level 0..1 (element mode keeps this in JS, Web Audio in the node). */
  fade: number
  objectUrl: string | null
}

function curveValue(curve: CrossfadeCurve, t: number, rising: boolean): number {
  const x = Math.min(1, Math.max(0, t))
  switch (curve) {
    case 'linear':
      return rising ? x : 1 - x
    case 'smooth': {
      const s = x * x * (3 - 2 * x)
      return rising ? s : 1 - s
    }
    case 'sharp': {
      // Fast out, slow in — keeps a busy mix from turning to mud.
      const s = Math.pow(x, 0.6)
      return rising ? s : 1 - Math.pow(x, 1.8)
    }
    case 'equalPower':
    default:
      return rising ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2)
  }
}

function buildCurve(curve: CrossfadeCurve, rising: boolean, from: number, to: number): Float32Array {
  const values = new Float32Array(CURVE_POINTS)
  for (let i = 0; i < CURVE_POINTS; i++) {
    const t = i / (CURVE_POINTS - 1)
    const shape = curveValue(curve, t, rising)
    values[i] = from + (to - from) * (rising ? shape : 1 - shape)
  }
  return values
}

function dbCurve(fromDb: number, toDb: number, shape: (t: number) => number): Float32Array {
  const values = new Float32Array(CURVE_POINTS)
  for (let i = 0; i < CURVE_POINTS; i++) {
    const t = shape(i / (CURVE_POINTS - 1))
    values[i] = fromDb + (toDb - fromDb) * t
  }
  return values
}

export class AudioEngine {
  mode: EngineMode = 'element'
  private ctx: AudioContext | null = null
  private decks: Record<'a' | 'b', Deck>
  private activeId: 'a' | 'b' = 'a'
  private busGain: GainNode | null = null
  private eqNodes: BiquadFilterNode[] = []
  private preamp: GainNode | null = null
  private masterGain: GainNode | null = null
  private analyser: AnalyserNode | null = null

  private callbacks: EngineCallbacks = DEFAULT_CALLBACKS
  private rafHandle = 0
  private state: PlaybackState = 'idle'
  private transitioning = false
  private preparedFor: string | null = null
  private pending: { song: Song; plan: TransitionPlan } | null = null
  private elementFades: {
    deck: Deck
    from: number
    to: number
    start: number
    duration: number
    curve: CrossfadeCurve
    rising: boolean
    onDone?: () => void
  }[] = []
  private tempoRelease: { deck: Deck; from: number; start: number; duration: number } | null = null
  private silenceSince = 0
  private silenceChecked = false
  private started = false

  constructor() {
    this.decks = { a: this.createDeck('a'), b: this.createDeck('b') }
  }

  // ------------------------------------------------------------- lifecycle --

  private createDeck(id: 'a' | 'b'): Deck {
    const el = new Audio()
    el.preload = 'auto'
    el.crossOrigin = 'anonymous'
    el.volume = 0
    // Beat-matching should time-stretch, not change pitch.
    el.preservesPitch = true
    const legacy = el as unknown as { webkitPreservesPitch?: boolean }
    if ('webkitPreservesPitch' in legacy) legacy.webkitPreservesPitch = true
    return {
      id,
      el,
      source: null,
      gain: null,
      bass: null,
      sweep: null,
      song: null,
      base: 1,
      fade: 0,
      objectUrl: null,
    }
  }

  attach(callbacks: Partial<EngineCallbacks>): void {
    this.callbacks = { ...DEFAULT_CALLBACKS, ...callbacks }
  }

  /** Build the Web Audio graph. Safe to call more than once. */
  init(): void {
    if (this.started) return
    this.started = true

    const preference = settings().audioEngine
    const wantWebAudio = preference !== 'element' && isWebAudioSupported()
    if (wantWebAudio) {
      const ctx = getAudioContext()
      if (ctx) {
        try {
          this.buildGraph(ctx)
          this.mode = 'webaudio'
        } catch (err) {
          console.warn('[kultr] Web Audio graph failed, using element mode', err)
          this.mode = 'element'
        }
      }
    }

    for (const deck of [this.decks.a, this.decks.b]) this.wireDeckEvents(deck)
    this.setVolume(settings().muted ? 0 : settings().volume)
    this.loop()
  }

  private buildGraph(ctx: AudioContext): void {
    this.ctx = ctx
    this.busGain = ctx.createGain()
    this.busGain.gain.value = 1

    this.eqNodes = EQ_BANDS.map((frequency, index) => {
      const filter = ctx.createBiquadFilter()
      filter.type = index === 0 ? 'lowshelf' : index === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      filter.frequency.value = frequency
      filter.Q.value = 1.1
      filter.gain.value = 0
      return filter
    })

    this.preamp = ctx.createGain()
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.8
    this.masterGain = ctx.createGain()

    let node: AudioNode = this.busGain
    for (const filter of this.eqNodes) {
      node.connect(filter)
      node = filter
    }
    node.connect(this.preamp)
    this.preamp.connect(this.analyser)
    this.analyser.connect(this.masterGain)
    this.masterGain.connect(ctx.destination)

    for (const deck of [this.decks.a, this.decks.b]) this.connectDeck(deck, ctx)
    this.applyEq()
  }

  private connectDeck(deck: Deck, ctx: AudioContext): void {
    if (deck.source) return
    deck.source = ctx.createMediaElementSource(deck.el)
    deck.bass = ctx.createBiquadFilter()
    deck.bass.type = 'lowshelf'
    deck.bass.frequency.value = 180
    deck.bass.gain.value = 0
    deck.sweep = ctx.createBiquadFilter()
    deck.sweep.type = 'highpass'
    deck.sweep.frequency.value = 20
    deck.sweep.Q.value = 0.7
    deck.gain = ctx.createGain()
    deck.gain.gain.value = 0
    deck.el.volume = 1

    deck.source.connect(deck.bass)
    deck.bass.connect(deck.sweep)
    deck.sweep.connect(deck.gain)
    deck.gain.connect(this.busGain as GainNode)
  }

  private wireDeckEvents(deck: Deck): void {
    deck.el.addEventListener('ended', () => {
      if (deck.id !== this.activeId) return
      if (this.transitioning) return
      this.callbacks.onAdvance('ended')
    })
    deck.el.addEventListener('error', () => {
      if (deck.id !== this.activeId) return
      const code = deck.el.error?.code
      const message =
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? 'This file format is not supported by your browser. Try enabling transcoding in Navidrome.'
          : code === MediaError.MEDIA_ERR_NETWORK
            ? 'The connection to your server dropped while streaming.'
            : 'Playback failed.'
      this.setState('error')
      this.callbacks.onError(message)
    })
    deck.el.addEventListener('waiting', () => {
      if (deck.id === this.activeId && this.state === 'playing') this.setState('loading')
    })
    deck.el.addEventListener('playing', () => {
      if (deck.id === this.activeId) this.setState('playing')
    })
  }

  // ------------------------------------------------------------- accessors --

  get active(): Deck {
    return this.decks[this.activeId]
  }
  get idle(): Deck {
    return this.decks[this.activeId === 'a' ? 'b' : 'a']
  }
  get currentSong(): Song | null {
    return this.active.song
  }
  get analyserNode(): AnalyserNode | null {
    return this.analyser
  }
  get isTransitioning(): boolean {
    return this.transitioning
  }
  get currentTime(): number {
    return this.active.el.currentTime || 0
  }
  get duration(): number {
    const el = this.active.el
    if (Number.isFinite(el.duration) && el.duration > 0) return el.duration
    return this.active.song?.duration ?? 0
  }

  private setState(state: PlaybackState): void {
    if (this.state === state) return
    this.state = state
    this.callbacks.onState(state)
  }

  // ------------------------------------------------------------------ urls --

  private async sourceFor(song: Song): Promise<{ url: string; objectUrl: string | null }> {
    // Internet radio and anything else that is not a library track.
    if (song.kultrStreamUrl) return { url: song.kultrStreamUrl, objectUrl: null }

    if (settings().offlineFirst) {
      try {
        const offline = await getOffline(song.id)
        if (offline?.blob) {
          const objectUrl = URL.createObjectURL(offline.blob)
          return { url: objectUrl, objectUrl }
        }
        if (offline?.fileName) {
          // Stored in the folder the person chose rather than in the browser.
          const folder = await getStoredFolder()
          const file = folder ? await readFromFolder(folder, offline.fileName) : null
          if (file) {
            const objectUrl = URL.createObjectURL(file)
            return { url: objectUrl, objectUrl }
          }
        }
      } catch {
        /* fall through to streaming */
      }
    }
    const { preferredBitrate, preferredFormat } = settings()
    const url = getClient().streamUrl(song.id, {
      maxBitRate: preferredBitrate || undefined,
      format: preferredFormat || undefined,
      estimateContentLength: true,
    })
    return { url, objectUrl: null }
  }

  /** Linear gain for a song, honouring ReplayGain settings. */
  private baseGainFor(song: Song): number {
    const { replayGainMode, replayGainPreamp } = settings()
    if (replayGainMode === 'off') return 1
    const rg = song.replayGain
    const gainDb = replayGainMode === 'album' ? rg?.albumGain ?? rg?.trackGain : rg?.trackGain
    if (gainDb === undefined) return 1
    const peak = (replayGainMode === 'album' ? rg?.albumPeak : rg?.trackPeak) ?? 1
    let scale = Math.pow(10, (gainDb + replayGainPreamp) / 20)
    // Never push a track into clipping.
    if (peak > 0 && scale * peak > 1) scale = 1 / peak
    return Math.min(4, Math.max(0.05, scale))
  }

  private releaseDeckUrl(deck: Deck): void {
    if (deck.objectUrl) {
      URL.revokeObjectURL(deck.objectUrl)
      deck.objectUrl = null
    }
  }

  private async prime(deck: Deck, song: Song, startAt = 0): Promise<void> {
    const { url, objectUrl } = await this.sourceFor(song)
    this.releaseDeckUrl(deck)
    deck.objectUrl = objectUrl
    deck.song = song
    deck.base = this.baseGainFor(song)
    deck.el.src = url
    deck.el.playbackRate = 1
    deck.el.load()
    if (startAt > 0) {
      await new Promise<void>((resolve) => {
        const onReady = () => {
          deck.el.removeEventListener('loadedmetadata', onReady)
          resolve()
        }
        if (deck.el.readyState >= 1) resolve()
        else deck.el.addEventListener('loadedmetadata', onReady)
        setTimeout(resolve, 4000)
      })
      try {
        deck.el.currentTime = startAt
      } catch {
        /* seeking before metadata; ignore */
      }
    }
  }

  private setDeckLevel(deck: Deck, fade: number): void {
    deck.fade = fade
    if (this.mode === 'webaudio' && deck.gain && this.ctx) {
      deck.gain.gain.cancelScheduledValues(this.ctx.currentTime)
      deck.gain.gain.setValueAtTime(deck.base * fade, this.ctx.currentTime)
    } else {
      deck.el.volume = Math.min(1, Math.max(0, deck.base * fade * this.elementMaster))
    }
  }

  private elementMaster = 1

  // -------------------------------------------------------------- playback --

  /** Load a track and start playing it, cancelling anything in flight. */
  async play(song: Song, options: { startAt?: number; autoplay?: boolean } = {}): Promise<void> {
    this.init()
    await unlockAudio()
    this.cancelTransition()
    this.pending = null
    this.preparedFor = null

    const deck = this.active
    const other = this.idle
    other.el.pause()
    this.setDeckLevel(other, 0)
    other.song = null

    this.setState('loading')
    await this.prime(deck, song, options.startAt ?? 0)
    this.setDeckLevel(deck, 1)

    if (options.autoplay === false) {
      this.setState('paused')
      return
    }
    await this.start(deck)
  }

  private async start(deck: Deck): Promise<void> {
    try {
      await deck.el.play()
      this.silenceSince = performance.now()
      this.silenceChecked = false
      this.setState('playing')
    } catch (err) {
      if ((err as Error)?.name === 'NotAllowedError') {
        this.setState('paused')
        this.callbacks.onError('Your browser blocked autoplay — press play to start.')
      } else {
        this.setState('error')
        this.callbacks.onError('Could not start playback.')
      }
    }
  }

  async resume(): Promise<void> {
    this.init()
    await unlockAudio()
    if (!this.active.song) return
    await this.start(this.active)
  }

  pause(): void {
    this.active.el.pause()
    if (this.transitioning) this.idle.el.pause()
    this.setState('paused')
  }

  async toggle(): Promise<void> {
    if (this.state === 'playing' || this.state === 'loading') this.pause()
    else await this.resume()
  }

  stop(): void {
    this.cancelTransition()
    for (const deck of [this.decks.a, this.decks.b]) {
      deck.el.pause()
      deck.el.removeAttribute('src')
      deck.el.load()
      deck.song = null
      this.releaseDeckUrl(deck)
      this.setDeckLevel(deck, 0)
    }
    this.pending = null
    this.preparedFor = null
    this.setState('idle')
  }

  seek(seconds: number): void {
    const deck = this.active
    if (!deck.song) return
    // Seeking invalidates a scheduled transition.
    this.pending = null
    this.preparedFor = null
    try {
      deck.el.currentTime = Math.max(0, Math.min(seconds, this.duration || seconds))
    } catch {
      /* ignore */
    }
  }

  setVolume(volume: number): void {
    const value = Math.min(1, Math.max(0, volume))
    this.elementMaster = value
    if (this.mode === 'webaudio' && this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02)
    } else {
      for (const deck of [this.decks.a, this.decks.b]) {
        deck.el.volume = Math.min(1, Math.max(0, deck.base * deck.fade * value))
      }
    }
  }

  setPlaybackRate(rate: number): void {
    this.active.el.playbackRate = Math.min(2, Math.max(0.5, rate))
  }

  applyEq(): void {
    if (this.mode !== 'webaudio' || !this.preamp || !this.ctx) return
    const { eqEnabled, eqGains, eqPreamp } = settings()
    this.eqNodes.forEach((node, index) => {
      node.gain.setTargetAtTime(eqEnabled ? eqGains[index] ?? 0 : 0, this.ctx!.currentTime, 0.05)
    })
    const preampLinear = Math.pow(10, (eqEnabled ? eqPreamp : 0) / 20)
    this.preamp.gain.setTargetAtTime(preampLinear, this.ctx.currentTime, 0.05)
  }

  /** Re-read per-song gain after a ReplayGain settings change. */
  refreshGains(): void {
    for (const deck of [this.decks.a, this.decks.b]) {
      if (!deck.song) continue
      deck.base = this.baseGainFor(deck.song)
      this.setDeckLevel(deck, deck.fade)
    }
  }

  // ------------------------------------------------------------ transitions --

  /** Hand the engine a plan produced by the InjeKt planner. */
  setPendingTransition(song: Song, plan: TransitionPlan): void {
    this.pending = { song, plan }
    if (plan.type === 'gapless' || plan.duration > 0) {
      // Warm up the idle deck so the transition starts instantly.
      void this.prime(this.idle, song, plan.inStartOffset).then(() => {
        this.setDeckLevel(this.idle, 0)
      })
    }
  }

  clearPendingTransition(): void {
    this.pending = null
    this.preparedFor = null
  }

  /** Manual skip with a short fade, used by next/previous. */
  async skipTo(song: Song, options: { fade?: number; startAt?: number } = {}): Promise<void> {
    const fadeSeconds = options.fade ?? 0
    if (fadeSeconds <= 0.05 || !this.active.song || this.state !== 'playing') {
      await this.play(song, { startAt: options.startAt })
      return
    }
    this.init()
    await unlockAudio()
    this.cancelTransition()
    const from = this.active
    const to = this.idle
    await this.prime(to, song, options.startAt ?? 0)
    this.setDeckLevel(to, 0)
    await this.start(to)
    this.runFade(from, from.fade, 0, fadeSeconds, 'equalPower', false, () => {
      from.el.pause()
      this.releaseDeckUrl(from)
      from.song = null
    })
    this.runFade(to, 0, 1, fadeSeconds, 'equalPower', true)
    this.activeId = to.id
    this.pending = null
    this.preparedFor = null
  }

  private runFade(
    deck: Deck,
    from: number,
    to: number,
    duration: number,
    curve: CrossfadeCurve,
    rising: boolean,
    onDone?: () => void,
  ): void {
    if (this.mode === 'webaudio' && deck.gain && this.ctx) {
      const now = this.ctx.currentTime
      const param = deck.gain.gain
      param.cancelScheduledValues(now)
      param.setValueAtTime(deck.base * from, now)
      param.setValueCurveAtTime(buildCurve(curve, rising, deck.base * from, deck.base * to), now, duration)
      deck.fade = to
      if (onDone) window.setTimeout(onDone, duration * 1000 + 60)
    } else {
      this.elementFades.push({
        deck,
        from,
        to,
        start: performance.now(),
        duration: duration * 1000,
        curve,
        rising,
        onDone,
      })
    }
  }

  private executeTransition(song: Song, plan: TransitionPlan): void {
    const from = this.active
    const to = this.idle
    if (!from.song) return

    this.transitioning = true
    this.callbacks.onTransitionStart(plan, song)

    const duration = Math.max(0.05, plan.duration)

    const finish = () => {
      from.el.pause()
      this.releaseDeckUrl(from)
      from.song = null
      this.setDeckLevel(from, 0)
      if (this.mode === 'webaudio' && from.bass && from.sweep && this.ctx) {
        from.bass.gain.cancelScheduledValues(this.ctx.currentTime)
        from.bass.gain.setValueAtTime(0, this.ctx.currentTime)
        from.sweep.frequency.cancelScheduledValues(this.ctx.currentTime)
        from.sweep.frequency.setValueAtTime(20, this.ctx.currentTime)
      }
      this.transitioning = false
      this.callbacks.onTransitionEnd()
    }

    const begin = async () => {
      if (to.song?.id !== song.id) await this.prime(to, song, plan.inStartOffset)
      if (Math.abs(plan.incomingRate - 1) > 0.001) to.el.playbackRate = plan.incomingRate
      this.setDeckLevel(to, 0)
      await this.start(to)

      if (plan.type === 'cut') {
        this.setDeckLevel(to, 1)
        finish()
      } else {
        this.runFade(from, from.fade, 0, duration, plan.curve, false, finish)
        this.runFade(to, 0, 1, duration, plan.curve, true)
      }

      if (this.mode === 'webaudio' && this.ctx) {
        const now = this.ctx.currentTime
        if (plan.bassSwap && from.bass && to.bass) {
          // Drop the outgoing bass early, bring the incoming bass in late, so
          // the two kick drums never fight.
          from.bass.gain.cancelScheduledValues(now)
          from.bass.gain.setValueAtTime(0, now)
          from.bass.gain.setValueCurveAtTime(dbCurve(0, -26, (t) => Math.min(1, t / 0.55)), now, duration)
          to.bass.gain.cancelScheduledValues(now)
          to.bass.gain.setValueAtTime(-26, now)
          to.bass.gain.setValueCurveAtTime(
            dbCurve(-26, 0, (t) => Math.max(0, (t - 0.35) / 0.65)),
            now,
            duration,
          )
        }
        if (plan.sweep && from.sweep) {
          from.sweep.frequency.cancelScheduledValues(now)
          from.sweep.frequency.setValueAtTime(20, now)
          from.sweep.frequency.exponentialRampToValueAtTime(2400, now + duration)
        }
      }

      if (plan.tempoRelease > 0 && Math.abs(plan.incomingRate - 1) > 0.001) {
        this.tempoRelease = {
          deck: to,
          from: plan.incomingRate,
          start: performance.now() + duration * 1000,
          duration: plan.tempoRelease * 1000,
        }
      }

      this.activeId = to.id
      this.pending = null
      this.preparedFor = null
      this.callbacks.onAdvance('transition')
    }

    void begin()
  }

  private cancelTransition(): void {
    this.transitioning = false
    this.elementFades = []
    this.tempoRelease = null
  }

  // ------------------------------------------------------------------ loop --

  private lastTimeReport = 0

  private loop = (): void => {
    this.rafHandle = requestAnimationFrame(this.loop)
    const now = performance.now()

    // With nothing playing and nothing scheduled there is genuinely no work to
    // do. Bailing out here keeps an idle tab idle instead of burning a frame's
    // worth of CPU sixty times a second forever.
    if (
      this.state !== 'playing' &&
      !this.elementFades.length &&
      !this.tempoRelease &&
      !this.transitioning
    ) {
      return
    }

    // Element-mode fades.
    if (this.elementFades.length) {
      const remaining: typeof this.elementFades = []
      for (const fade of this.elementFades) {
        const t = fade.duration > 0 ? (now - fade.start) / fade.duration : 1
        if (t >= 1) {
          this.setDeckLevel(fade.deck, fade.to)
          fade.onDone?.()
        } else {
          const shape = curveValue(fade.curve, t, fade.rising)
          const level = fade.rising
            ? fade.from + (fade.to - fade.from) * shape
            : fade.to + (fade.from - fade.to) * shape
          this.setDeckLevel(fade.deck, level)
          remaining.push(fade)
        }
      }
      this.elementFades = remaining
    }

    // Ease a beat-matched track back to its natural tempo.
    if (this.tempoRelease) {
      const { deck, from, start, duration } = this.tempoRelease
      const t = (now - start) / duration
      if (t >= 1) {
        deck.el.playbackRate = 1
        this.tempoRelease = null
      } else if (t >= 0) {
        const eased = t * t * (3 - 2 * t)
        deck.el.playbackRate = from + (1 - from) * eased
      }
    }

    const deck = this.active
    if (!deck.song) return

    const currentTime = deck.el.currentTime || 0
    const duration = this.duration

    // The transition check below needs frame accuracy, but the UI does not —
    // reporting the time at 10 Hz instead of 60 Hz cuts the React and store
    // work for free.
    if (now - this.lastTimeReport >= 100) {
      this.lastTimeReport = now
      this.callbacks.onTime(currentTime, duration)
    }

    if (this.mode === 'webaudio' && this.state === 'playing') this.watchForSilence(now, currentTime)

    if (duration > 0 && !this.transitioning && !deck.el.paused) {
      const remaining = duration - currentTime

      if (this.pending) {
        const startAt = Math.min(this.pending.plan.startAt, duration - 0.05)
        if (currentTime >= startAt) {
          this.executeTransition(this.pending.song, this.pending.plan)
        }
      } else if (remaining <= PREPARE_LEAD_SECONDS && this.preparedFor !== deck.song.id) {
        this.preparedFor = deck.song.id
        this.callbacks.prepareNext(remaining)
      }
    }
  }

  /**
   * MediaElementSource goes silent when the audio is cross-origin without CORS
   * headers. Detect that (output flat zero while the element is clearly
   * playing) and rebuild the decks without Web Audio.
   */
  private watchForSilence(now: number, currentTime: number): void {
    if (this.silenceChecked || !this.analyser || this.elementMaster <= 0) return
    if (currentTime < 1.2) return
    if (now - this.silenceSince < 2500) return

    const data = new Uint8Array(this.analyser.fftSize)
    this.analyser.getByteTimeDomainData(data)
    let silent = true
    for (const sample of data) {
      if (sample !== 128) {
        silent = false
        break
      }
    }
    this.silenceChecked = true
    if (silent) {
      void this.fallbackToElementMode()
    }
  }

  private async fallbackToElementMode(): Promise<void> {
    const song = this.active.song
    const position = this.currentTime
    const wasPlaying = this.state === 'playing'

    for (const deck of [this.decks.a, this.decks.b]) {
      deck.el.pause()
      try {
        deck.source?.disconnect()
        deck.gain?.disconnect()
        deck.bass?.disconnect()
        deck.sweep?.disconnect()
      } catch {
        /* ignore */
      }
      this.releaseDeckUrl(deck)
    }

    // A MediaElementSource can never be undone, so the decks are replaced.
    this.decks = { a: this.createDeck('a'), b: this.createDeck('b') }
    this.activeId = 'a'
    this.mode = 'element'
    for (const deck of [this.decks.a, this.decks.b]) this.wireDeckEvents(deck)
    this.setVolume(settings().muted ? 0 : settings().volume)

    this.callbacks.onModeChange(
      'element',
      'Your server does not send CORS headers for audio, so Kultr switched to compatibility mode. Crossfade still works; the equaliser, visualizer and InjeKt bass-swap do not. Putting Kultr and Navidrome behind one reverse proxy fixes this.',
    )

    if (song) await this.play(song, { startAt: position, autoplay: wasPlaying })
  }

  destroy(): void {
    cancelAnimationFrame(this.rafHandle)
    this.stop()
  }
}

export const engine = new AudioEngine()
