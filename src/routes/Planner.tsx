import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ListPlus, Play, Wand2 } from 'lucide-react'
import type { Song } from '@/api/types'
import type { TrackAnalysis } from '@/audio/analysis'
import { CURVES, planSet, resampled, valueAt, type PlannedTrack } from '@/audio/energyPlan'
import { allAnalyses, allSongs, offlineIdSet } from '@/db'
import { createPlaylistWith } from '@/lib/actions'
import { formatDuration } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { artUrl } from '@/lib/artwork'
import { usePlayer } from '@/store/player'
import { useToast } from '@/store/ui'
import { Art, Segmented } from '@/components/ui'

const POINTS = 12

/** Seconds as a clock: 4:05, or 1:02:30. */
const clock = (seconds: number) => {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}
const MINUTES = ['30', '60', '90', '120'] as const

/**
 * The energy planner: draw how the next hour should feel, calm to peak, and
 * Kultr builds a set that follows the line, with tempos and keys that mix.
 * As in Kultr for iOS and Android.
 */
export function Planner() {
  const [params] = useSearchParams()
  const asked = Number(params.get('minutes'))
  const [minutes, setMinutes] = useState<string>(MINUTES.includes(String(asked) as (typeof MINUTES)[number]) ? String(asked) : '60')
  const [points, setPoints] = useState<number[]>(() => resampled(CURVES[0].points, POINTS))
  const [plan, setPlan] = useState<PlannedTrack[] | null>(null)
  const toast = useToast()

  const { data, loading } = useAsync(
    async () => {
      const [songs, analyses] = await Promise.all([allSongs(), allAnalyses()])
      const offline = !navigator.onLine ? await offlineIdSet() : null
      const candidates: [Song, TrackAnalysis][] = []
      for (const song of songs) {
        const analysis = analyses.get(song.id)
        if (!analysis) continue
        if (offline && !offline.has(song.id) && !song.id.startsWith('local:')) continue
        candidates.push([song, analysis])
      }
      return { candidates, songs: songs.length }
    },
    [],
    { candidates: [] as [Song, TrackAnalysis][], songs: 0 },
  )

  const build = () => {
    const set = planSet(points, Number(minutes), data.candidates)
    setPlan(set)
    if (!set.length) toast.show('Nothing to plan with yet: Kultr needs analysed tracks.', 'warning')
  }

  const total = plan?.length ? plan[plan.length - 1].startsAt + (plan[plan.length - 1].song.duration ?? 0) : 0
  // Some of the library is not analysed yet, so the planner has less to choose from.
  const tooFew = !loading && data.candidates.length < data.songs

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Energy planner</h1>
          <span className="page-head__sub">
            Draw how the set should feel, calm at the bottom and peak at the top. Kultr picks tracks whose energy follows
            the line, with tempos and keys that mix.
          </span>
        </div>
        <div className="page-actions">
          <Segmented
            value={minutes}
            options={MINUTES.map((value) => ({ value, label: value === '60' ? '1 hour' : value === '120' ? '2 hours' : `${value} min` }))}
            onChange={(value) => setMinutes(value)}
          />
        </div>
      </div>

      <section className="section glass planner">
        <CurveEditor points={points} onChange={setPoints} plan={plan} minutes={Number(minutes)} />
        <div className="planner__presets">
          {CURVES.map((curve) => (
            <button key={curve.id} className="pill" onClick={() => setPoints(resampled(curve.points, POINTS))}>
              {curve.name}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button className="pill pill-accent" disabled={loading || !data.candidates.length} onClick={build}>
            <Wand2 size={14} />
            {plan ? 'Plan again' : 'Plan the set'}
          </button>
        </div>
        {tooFew ? (
          <p className="row__hint">
            The planner works from InjeKt’s analysis, and {data.candidates.length.toLocaleString()} of{' '}
            {data.songs.toLocaleString()} tracks are analysed. <Link to="/sync">Analyse the rest on the Sync page</Link> for a
            set that fits the line better.
          </p>
        ) : null}
      </section>

      {plan?.length ? (
        <section className="section glass" style={{ marginTop: 16 }}>
          <div className="section__head">
            <h3>
              {plan.length} tracks · {formatDuration(total)}
            </h3>
            <span className="section__actions" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="pill pill-accent" onClick={() => void usePlayer.getState().playNow(plan.map((t) => t.song), 0, 'Energy planner')}>
                <Play size={14} />
                Play the set
              </button>
              <button
                className="pill"
                onClick={async () => {
                  const name = `Set · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                  await createPlaylistWith(name, plan.map((t) => t.song.id))
                }}
              >
                <ListPlus size={14} />
                Save as playlist
              </button>
            </span>
          </div>
          <ol className="planned">
            {plan.map((track, index) => (
              <li key={track.song.id} className="planned__row">
                <span className="planned__time">{clock(track.startsAt)}</span>
                <Art src={artUrl(track.song, 96)} alt={track.song.album ?? track.song.title} className="planned__art" />
                <span className="planned__text">
                  <strong>{track.song.title}</strong>
                  <span>{track.song.artist}</span>
                </span>
                <span className="planned__energy" title={`Energy ${Math.round(track.energy * 10)} (the line asked for ${Math.round(track.target * 10)})`}>
                  <span className="planned__bar">
                    <span style={{ width: `${track.energy * 100}%` }} />
                    <i style={{ left: `${track.target * 100}%` }} />
                  </span>
                  {Math.round(track.energy * 10)}
                </span>
                <button
                  className="pill pill-icon"
                  aria-label={`Play from ${track.song.title}`}
                  title="Play from here"
                  onClick={() => void usePlayer.getState().playNow(plan.map((t) => t.song), index, 'Energy planner')}
                >
                  <Play size={13} />
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  )
}

/** Drag across it to draw the line; the planned tracks show as dots along it. */
function CurveEditor({
  points,
  onChange,
  plan,
  minutes,
}: {
  points: number[]
  onChange: (points: number[]) => void
  plan: PlannedTrack[] | null
  minutes: number
}) {
  const ref = useRef<SVGSVGElement>(null)
  const drawing = useRef(false)
  const W = 600
  const H = 180
  const pad = 12
  const x = (fraction: number) => pad + fraction * (W - pad * 2)
  const y = (value: number) => H - pad - value * (H - pad * 2)

  const path = useMemo(() => {
    const samples = 60
    return Array.from({ length: samples + 1 }, (_, i) => `${i ? 'L' : 'M'}${x(i / samples).toFixed(1)},${y(valueAt(points, i / samples)).toFixed(1)}`).join(' ')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points])

  const set = (event: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const fx = Math.min(1, Math.max(0, ((event.clientX - rect.left) / rect.width) * (W / (W - pad * 2)) - pad / (W - pad * 2)))
    const fy = Math.min(1, Math.max(0, 1 - ((event.clientY - rect.top) / rect.height) * (H / (H - pad * 2)) + pad / (H - pad * 2)))
    const index = Math.round(fx * (points.length - 1))
    if (Math.abs(points[index] - fy) < 0.005) return
    onChange(points.map((value, i) => (i === index ? fy : value)))
  }

  const total = minutes * 60
  return (
    <svg
      ref={ref}
      className="curve"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="The energy line: drag to draw it"
      onPointerDown={(event) => {
        ;(event.target as Element).setPointerCapture?.(event.pointerId)
        drawing.current = true
        set(event)
      }}
      onPointerMove={(event) => drawing.current && set(event)}
      onPointerUp={() => {
        drawing.current = false
      }}
    >
      {[0.25, 0.5, 0.75].map((line) => (
        <line key={line} x1={pad} x2={W - pad} y1={y(line)} y2={y(line)} className="curve__grid" />
      ))}
      <text x={pad + 4} y={pad + 12} className="curve__label">
        Peak
      </text>
      <text x={pad + 4} y={H - pad - 6} className="curve__label">
        Calm
      </text>
      <path d={`${path} L${x(1)},${y(0)} L${x(0)},${y(0)} Z`} className="curve__fill" />
      <path d={path} className="curve__line" />
      {points.map((value, i) => (
        <circle key={i} cx={x(i / (points.length - 1))} cy={y(value)} r={5} className="curve__handle" />
      ))}
      {plan?.map((track) => (
        <circle key={track.song.id} cx={x(Math.min(1, track.startsAt / total))} cy={y(track.energy)} r={3.5} className="curve__track" />
      ))}
    </svg>
  )
}
