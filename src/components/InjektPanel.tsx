import { useEffect, useState } from 'react'
import { Sparkles, Waves } from 'lucide-react'
import type { Song } from '@/api/types'
import { analyseTrack, type TrackAnalysis } from '@/audio/analysis'
import { getAnalysis } from '@/db'
import { formatTime } from '@/lib/format'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { Badge, Spinner } from './ui'

/**
 * Shows what InjeKt knows about the current and next track, and exactly how
 * it intends to move between them. Handy for tuning, and it makes the feature
 * legible instead of magic.
 */
export function InjektPanel() {
  const player = usePlayer()
  const { injektEnabled, injektBars, injektMaxTempoShift } = useSettings()
  const current = player.current()
  const next = player.peekNext()
  const plan = player.currentPlan()

  const [analysisA, setAnalysisA] = useState<TrackAnalysis | null>(null)
  const [analysisB, setAnalysisB] = useState<TrackAnalysis | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setAnalysisA(current ? ((await getAnalysis(current.id)) ?? null) : null)
      setAnalysisB(next ? ((await getAnalysis(next.id)) ?? null) : null)
    }
    void load().then(() => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
  }, [current?.id, next?.id, busy])

  const analyse = async (song: Song | null) => {
    if (!song) return
    setBusy(true)
    await analyseTrack(song, { force: true })
    setBusy(false)
  }

  if (!injektEnabled) {
    return (
      <p className="row__hint" style={{ padding: 12 }}>
        InjeKt is off. Turn it on in Settings → Playback to get beat-matched, key-aware transitions
        instead of a plain crossfade.
      </p>
    )
  }

  return (
    <div className="injekt">
      <div className="injekt__row">
        <span>Now playing</span>
        <span className="injekt__value">{current?.title ?? '—'}</span>
      </div>
      <TrackFacts analysis={analysisA} onAnalyse={() => void analyse(current)} busy={busy} />

      <div className="hairline" />

      <div className="injekt__row">
        <span>Up next</span>
        <span className="injekt__value">{next?.title ?? 'End of queue'}</span>
      </div>
      <TrackFacts analysis={analysisB} onAnalyse={() => void analyse(next)} busy={busy} />

      <div className="hairline" />

      {plan ? (
        <>
          <div className="injekt__row">
            <span>Transition</span>
            <span className="injekt__value">
              <Badge tone="accent">
                <Sparkles size={11} />
                {plan.type}
              </Badge>
            </span>
          </div>
          <div className="injekt__row">
            <span>Starts at</span>
            <span className="injekt__value">{formatTime(plan.startAt)}</span>
          </div>
          <div className="injekt__row">
            <span>Overlap</span>
            <span className="injekt__value">{plan.duration.toFixed(1)}s</span>
          </div>
          <div className="injekt__row">
            <span>Next track enters at</span>
            <span className="injekt__value">{formatTime(plan.inStartOffset)}</span>
          </div>
          <div className="injekt__row">
            <span>This track</span>
            <span className="injekt__value">
              {plan.outgoingRate === 1
                ? 'natural tempo'
                : `${plan.outgoingRate > 1 ? '+' : ''}${((plan.outgoingRate - 1) * 100).toFixed(1)}%${plan.outgoingRamp > 0 ? ` over ${plan.outgoingRamp.toFixed(0)}s` : ''}`}
            </span>
          </div>
          <div className="injekt__row">
            <span>Next track</span>
            <span className="injekt__value">
              {plan.incomingRate === 1
                ? 'natural tempo'
                : `${plan.incomingRate > 1 ? '+' : ''}${((plan.incomingRate - 1) * 100).toFixed(1)}%`}
            </span>
          </div>
          <div className="injekt__row">
            <span>Bass swap</span>
            <span className="injekt__value">{plan.bassSwap ? 'yes' : 'no'}</span>
          </div>

          <div className="injekt__viz" aria-hidden="true">
            <div className="a" style={{ width: '62%' }} />
            <div className="b" style={{ width: '48%' }} />
            <div className="label">
              <span>{current?.title}</span>
              <span>{next?.title}</span>
            </div>
          </div>

          <p className="row__hint">{plan.reason}</p>
        </>
      ) : (
        <p className="row__hint">
          The transition is planned about {35} seconds before the end of the track. Settings currently
          allow a {injektMaxTempoShift}% tempo shift over {injektBars} bars.
        </p>
      )}
    </div>
  )
}

function TrackFacts({
  analysis,
  onAnalyse,
  busy,
}: {
  analysis: TrackAnalysis | null
  onAnalyse: () => void
  busy: boolean
}) {
  if (!analysis) {
    return (
      <div className="injekt__row">
        <span className="row__hint" style={{ flex: 1 }}>
          Not analysed yet.
        </span>
        <button className="pill" onClick={onAnalyse} disabled={busy}>
          {busy ? <Spinner /> : <Waves size={14} />}
          Analyse now
        </button>
      </div>
    )
  }

  return (
    <div className="injekt__row" style={{ flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' }}>
      <Badge>{analysis.bpm.toFixed(0)} BPM</Badge>
      <Badge>
        {analysis.keyName} · {analysis.camelot}
      </Badge>
      <Badge>energy {Math.round(analysis.energy * 100)}%</Badge>
      <Badge>intro {formatTime(analysis.introEnd)}</Badge>
      <Badge>outro {formatTime(analysis.outroStart)}</Badge>
      <Badge tone={analysis.bpmConfidence > 0.4 ? 'success' : 'warning'}>
        {analysis.bpmSource === 'tag' ? 'BPM from tag' : `confidence ${Math.round(analysis.bpmConfidence * 100)}%`}
      </Badge>
    </div>
  )
}
