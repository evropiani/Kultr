import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Play, Plus, RotateCcw, Square, Trash2 } from 'lucide-react'
import { needsAnalysis, readStation, STATION_PRESETS, stationName, summary, type Station } from '@/audio/stations'
import { allGenres, analysisCount, counts as libraryCounts } from '@/db'
import { useAsync } from '@/lib/hooks'
import { libraryDecades, stationCounts, stationPool } from '@/lib/stationLibrary'
import { newId, tagCounts } from '@/lib/collection'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { useSync } from '@/store/sync'
import { useToast } from '@/store/ui'
import { STATION_ICONS, StationIcon } from '@/components/StationIcon'
import { Modal, Spinner, Switch } from '@/components/ui'
import { t } from '@/i18n'

/**
 * Stations: endless mixes from your own library, by tempo, energy, key,
 * genre, years, tags, rating and when the music was added. Turn the dial to
 * choose; while one plays, turning it mixes into the next. As in Kultr for
 * iOS and Android.
 */
export function Stations() {
  const mine = useSettings((state) => state.stations)
  const setSetting = useSettings((state) => state.set)
  const lastCheck = useSync((state) => state.state.lastCheck)
  const playing = usePlayer((state) => state.station)
  const [editing, setEditing] = useState<Station | null>(null)

  const { data } = useAsync(
    async () => {
      const decades = await libraryDecades()
      const all = [...mine, ...decades]
      const [count, analysed, library] = await Promise.all([stationCounts(all), analysisCount(), libraryCounts()])
      return { decades, count, analysed, songs: library.songs }
    },
    [mine, lastCheck],
    { decades: [] as Station[], count: {} as Record<string, number>, analysed: 0, songs: 0 },
  )
  const all = useMemo(() => [...mine, ...data.decades], [mine, data.decades])
  const isMine = (station: Station) => mine.some((entry) => entry.id === station.id)

  const play = (station: Station) => {
    const player = usePlayer.getState()
    if (player.station && player.playback === 'playing') void player.switchStation(station)
    else void player.playStation(station)
  }

  const save = (station: Station) => {
    const at = mine.findIndex((entry) => entry.id === station.id)
    setSetting('stations', at >= 0 ? mine.map((entry) => (entry.id === station.id ? station : entry)) : [...mine, station])
    setEditing(null)
  }

  const analysisNote =
    data.songs > 0 && data.analysed < data.songs * 0.5 ? (
      <p className="row__hint" style={{ marginTop: 6 }}>
        {t("Rules about energy and key use InjeKt’s analysis, and %@ of %@ tracks are analysed so far.", data.analysed.toLocaleString(), data.songs.toLocaleString())}{' '}<Link to="/sync">{t("Analyse the rest on the Sync page")}</Link>{' '}
        {t("and those stations fill up.")}</p>
    ) : null

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>{t("Stations")}</h1>
          <p className="page-head__sub">
            {t("Endless mixes from your own library. Kultr picks what fits and InjeKt mixes one track into the next.")}</p>
          {analysisNote}
        </div>
        <div className="page-actions">
          <button
            className="pill pill-accent"
            onClick={() => setEditing({ id: newId('s'), name: t('New station'), icon: 'dot.radiowaves.left.and.right' })}
          >
            <Plus size={14} />
            {t("New station")}</button>
        </div>
      </div>

      {all.length ? <Dial stations={all} playing={playing} onPlay={play} /> : null}

      <div className="station-grid">
        {all.map((station) => {
          const count = data.count[station.id]
          const active = playing?.id === station.id
          return (
            <div key={station.id} className="station-card glass" data-active={active || undefined}>
              <button className="station-card__main" onClick={() => play(station)} title={t("Play %@", stationName(station))}>
                <span className="station-card__icon">
                  <StationIcon symbol={station.icon} size={20} />
                </span>
                <span className="station-card__text">
                  <strong>{stationName(station)}</strong>
                  <span>{summary(station)}</span>
                  <small>
                    {count === undefined ? '…' : count === 1 ? t("1 track") : t("%@ tracks", count.toLocaleString())}
                    {active ? t(" · playing") : ''}
                  </small>
                </span>
              </button>
              <div className="station-card__actions">
                {active ? (
                  <button className="pill pill-icon" aria-label={t("End the station")} title={t("End the station")} onClick={() => usePlayer.getState().endStation()}>
                    <Square size={13} />
                  </button>
                ) : (
                  <button className="pill pill-icon" aria-label={t("Play %@", stationName(station))} title={t("Play")} onClick={() => play(station)}>
                    <Play size={14} />
                  </button>
                )}
                {isMine(station) ? (
                  <button className="pill pill-icon" aria-label={t("Edit %@", stationName(station))} title={t("Edit")} onClick={() => setEditing(station)}>
                    <Pencil size={14} />
                  </button>
                ) : (
                  <button
                    className="pill pill-icon"
                    aria-label={t("Make a station like %@", stationName(station))}
                    title={t("Make your own from this")}
                    onClick={() => setEditing({ ...station, id: newId('s'), icon: station.icon })}
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        <button
          className="pill"
          onClick={() => {
            if (window.confirm(t("Put back the stations Kultr starts with? Stations you made or changed go."))) setSetting('stations', STATION_PRESETS)
          }}
        >
          <RotateCcw size={14} />
          {t("Reset to the starting stations")}</button>
      </div>

      <StationEditor
        station={editing}
        isNew={Boolean(editing && !isMine(editing))}
        onClose={() => setEditing(null)}
        onSave={save}
        onDelete={(station) => {
          setSetting(
            'stations',
            mine.filter((entry) => entry.id !== station.id),
          )
          setEditing(null)
        }}
      />
    </>
  )
}

/**
 * The dial: turn it to choose a station (drag, scroll, or the arrow keys).
 * Stopping on one plays it; while one plays, turning mixes into the next.
 */
function Dial({ stations, playing, onPlay }: { stations: Station[]; playing: Station | null; onPlay: (station: Station) => void }) {
  const playingIndex = playing ? stations.findIndex((station) => station.id === playing.id) : -1
  const [index, setIndex] = useState(Math.max(0, playingIndex))
  const commit = useRef(0)
  const drag = useRef<{ angle: number; start: number } | null>(null)
  const knob = useRef<HTMLDivElement>(null)
  const step = 360 / Math.max(stations.length, 1)

  useEffect(() => {
    if (playingIndex >= 0) setIndex(playingIndex)
  }, [playingIndex])

  const turnTo = (next: number, play = true) => {
    const wrapped = ((next % stations.length) + stations.length) % stations.length
    setIndex(wrapped)
    window.clearTimeout(commit.current)
    // A station plays once the dial has rested on it a moment, so turning
    // past a few does not start each of them.
    if (play && playing) commit.current = window.setTimeout(() => onPlay(stations[wrapped]), 900)
  }

  const angleOf = (event: React.PointerEvent) => {
    const rect = knob.current!.getBoundingClientRect()
    return (Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * 180) / Math.PI
  }

  const current = stations[index] ?? stations[0]
  return (
    <div className="dial-wrap glass">
      <div
        className="dial"
        ref={knob}
        role="slider"
        tabIndex={0}
        aria-label={t("Station dial")}
        aria-valuemin={0}
        aria-valuemax={stations.length - 1}
        aria-valuenow={index}
        aria-valuetext={current ? stationName(current) : undefined}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') turnTo(index + 1)
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') turnTo(index - 1)
          else if (event.key === 'Enter' || event.key === ' ') onPlay(current)
          else return
          event.preventDefault()
        }}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) < 4) return
          turnTo(index + (event.deltaY > 0 ? 1 : -1))
        }}
        onPointerDown={(event) => {
          ;(event.target as Element).setPointerCapture?.(event.pointerId)
          drag.current = { angle: angleOf(event), start: index }
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          let delta = angleOf(event) - drag.current.angle
          if (delta > 180) delta -= 360
          if (delta < -180) delta += 360
          const next = drag.current.start + Math.round(delta / step)
          if (((next % stations.length) + stations.length) % stations.length !== index) turnTo(next)
        }}
        onPointerUp={() => {
          drag.current = null
        }}
      >
        <div className="dial__ring" style={{ transform: `rotate(${-index * step}deg)` }}>
          {stations.map((station, i) => (
            <span key={station.id} className="dial__tick" data-on={i === index || undefined} style={{ transform: `rotate(${i * step}deg)` }} />
          ))}
        </div>
        <div className="dial__face">
          <StationIcon symbol={current?.icon ?? ''} size={26} />
        </div>
      </div>
      <div className="dial__label">
        <span className="dial__eyebrow">{playing ? (playing.id === current?.id ? t("Playing") : t("Turn to mix in")) : t("Turn to choose")}</span>
        <strong>{current ? stationName(current) : null}</strong>
        <span>{current ? summary(current) : ''}</span>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="pill pill-accent" onClick={() => current && onPlay(current)}>
            <Play size={14} />
            {playing && playing.id !== current?.id ? t("Mix into it") : t("Play")}
          </button>
          {playing ? (
            <button className="pill" onClick={() => usePlayer.getState().endStation()}>
              <Square size={13} />
              {t("End station")}</button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const KEYS = Array.from({ length: 12 }, (_, i) => [`${i + 1}A`, `${i + 1}B`]).flat()

/** Edit a station's rules, with a live count of the tracks that fit. */
function StationEditor({
  station,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  station: Station | null
  isNew: boolean
  onClose: () => void
  onSave: (station: Station) => void
  onDelete: (station: Station) => void
}) {
  const [draft, setDraft] = useState<Station | null>(station)
  const annotations = useSettings((state) => state.annotations)
  const toast = useToast()
  useEffect(() => setDraft(station), [station])

  const { data: genres } = useAsync(async () => (await allGenres()).map((genre) => genre.value).sort((a, b) => a.localeCompare(b)), [], [] as string[])
  const tags = useMemo(() => tagCounts(annotations).map((entry) => entry.tag), [annotations])
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!draft) return
    let cancelled = false
    setCount(null)
    const timer = window.setTimeout(async () => {
      const pool = await stationPool(draft, { playableOnly: false })
      if (!cancelled) setCount(pool.length)
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draft])

  if (!draft) return <Modal open={false} onClose={onClose} title={t("Station")}>{null}</Modal>

  const patch = (change: Partial<Station>) => setDraft((current) => (current ? { ...current, ...change } : current))
  const num = (value: string) => (value.trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value))
  const bounds = (min: number | null, max: number | null) => (min === null && max === null ? null : { ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) })
  const toggle = (list: string[] | null | undefined, value: string) => {
    const current = list ?? []
    return current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
  }

  return (
    <Modal
      open={Boolean(station)}
      onClose={onClose}
      title={isNew ? t("New station") : t("Edit %@", station?.name ?? 'station')}
      footer={
        <>
          {!isNew ? (
            <button className="pill" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={() => onDelete(draft)}>
              <Trash2 size={14} />
              {t("Delete")}</button>
          ) : null}
          <button className="pill" onClick={onClose}>
            {t("Cancel")}</button>
          <button
            className="pill pill-accent"
            onClick={() => {
              const clean = readStation(draft)
              if (!clean) return
              onSave(clean)
              toast.show(t("Saved %@.", clean.name), 'success')
            }}
          >
            {t("Save")}</button>
        </>
      }
    >
      <div className="station-editor">
        <label className="station-editor__field">
          <span>{t("Name")}</span>
          <input className="field-input" value={draft.name} maxLength={80} onChange={(event) => patch({ name: event.target.value })} />
        </label>
        <div className="station-editor__field">
          <span>{t("Icon")}</span>
          <div className="icon-picker">
            {STATION_ICONS.filter((entry) => entry.symbol !== 'shippingbox.fill').map((entry) => (
              <button
                key={entry.symbol}
                type="button"
                className="icon-picker__item"
                data-on={draft.icon === entry.symbol || undefined}
                aria-label={t(entry.label)}
                title={t(entry.label)}
                onClick={() => patch({ icon: entry.symbol })}
              >
                <entry.icon size={16} />
              </button>
            ))}
          </div>
        </div>
        <div className="station-editor__pair">
          <label className="station-editor__field">
            <span>{t("Tempo from (BPM)")}</span>
            <input className="field-input" inputMode="numeric" value={draft.bpm?.min ?? ''} placeholder={t("any")} onChange={(event) => patch({ bpm: bounds(num(event.target.value), draft.bpm?.max ?? null) })} />
          </label>
          <label className="station-editor__field">
            <span>{t("to")}</span>
            <input className="field-input" inputMode="numeric" value={draft.bpm?.max ?? ''} placeholder={t("any")} onChange={(event) => patch({ bpm: bounds(draft.bpm?.min ?? null, num(event.target.value)) })} />
          </label>
        </div>
        <div className="station-editor__pair">
          <label className="station-editor__field">
            <span>{t("Energy from (1–10)")}</span>
            <input
              className="field-input"
              inputMode="numeric"
              value={draft.energy?.min !== undefined && draft.energy?.min !== null ? Math.round(draft.energy.min * 10) : ''}
              placeholder={t("any")}
              onChange={(event) => {
                const value = num(event.target.value)
                patch({ energy: bounds(value === null ? null : Math.min(10, Math.max(0, value)) / 10, draft.energy?.max ?? null) })
              }}
            />
          </label>
          <label className="station-editor__field">
            <span>{t("to")}</span>
            <input
              className="field-input"
              inputMode="numeric"
              value={draft.energy?.max !== undefined && draft.energy?.max !== null ? Math.round(draft.energy.max * 10) : ''}
              placeholder={t("any")}
              onChange={(event) => {
                const value = num(event.target.value)
                patch({ energy: bounds(draft.energy?.min ?? null, value === null ? null : Math.min(10, Math.max(0, value)) / 10) })
              }}
            />
          </label>
        </div>
        <div className="station-editor__pair">
          <label className="station-editor__field">
            <span>{t("Years from")}</span>
            <input className="field-input" inputMode="numeric" value={draft.years?.min ?? ''} placeholder={t("any")} onChange={(event) => patch({ years: bounds(num(event.target.value), draft.years?.max ?? null) })} />
          </label>
          <label className="station-editor__field">
            <span>{t("to")}</span>
            <input className="field-input" inputMode="numeric" value={draft.years?.max ?? ''} placeholder={t("any")} onChange={(event) => patch({ years: bounds(draft.years?.min ?? null, num(event.target.value)) })} />
          </label>
        </div>
        <div className="station-editor__field">
          <span>{t("Keys %@", draft.keys?.length ? t("· %@ chosen", draft.keys.length) : t("· any"))}</span>
          <div className="chip-row">
            {KEYS.map((key) => (
              <button key={key} type="button" className="chip" data-on={draft.keys?.includes(key) || undefined} onClick={() => patch({ keys: toggle(draft.keys, key) })}>
                {key}
              </button>
            ))}
          </div>
        </div>
        {genres.length ? (
          <div className="station-editor__field">
            <span>{t("Genres %@", draft.genres?.length ? t("· %@ chosen", draft.genres.length) : t("· any"))}</span>
            <div className="chip-row chip-row--scroll">
              {genres.map((genre) => (
                <button key={genre} type="button" className="chip" data-on={draft.genres?.includes(genre) || undefined} onClick={() => patch({ genres: toggle(draft.genres, genre) })}>
                  {genre}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {tags.length ? (
          <div className="station-editor__field">
            <span>{t("Tagged %@", draft.tags?.length ? '' : t("· any"))}</span>
            <div className="chip-row">
              {tags.map((tag) => (
                <button key={tag} type="button" className="chip" data-on={draft.tags?.includes(tag) || undefined} onClick={() => patch({ tags: toggle(draft.tags, tag) })}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="station-editor__pair">
          <label className="station-editor__field">
            <span>{t("Rating")}</span>
            <select className="field-input" value={draft.minRating ?? 0} onChange={(event) => patch({ minRating: Number(event.target.value) || null })}>
              <option value={0}>{t("Any")}</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {t("%@★ and up", n)}</option>
              ))}
            </select>
          </label>
          <label className="station-editor__field">
            <span>{t("Added")}</span>
            <select className="field-input" value={draft.addedDays ?? 0} onChange={(event) => patch({ addedDays: Number(event.target.value) || null })}>
              <option value={0}>{t("Any time")}</option>
              <option value={30}>{t("In the last 30 days")}</option>
              <option value={90}>{t("In the last 90 days")}</option>
              <option value={365}>{t("This year")}</option>
            </select>
          </label>
        </div>
        <div className="station-editor__toggles">
          <label>
            <Switch checked={Boolean(draft.unplayed)} onChange={(value) => patch({ unplayed: value })} label={t("Never played")} />
            {t("Never played")}</label>
          <label>
            <Switch checked={Boolean(draft.favourites)} onChange={(value) => patch({ favourites: value })} label={t("Favourites only")} />
            {t("Favourites only")}</label>
        </div>
        <p className="row__hint">
          {count === null ? <Spinner /> : count === 1 ? t("1 track fits.") : t("%@ tracks fit.", count.toLocaleString())}{' '}
          {summary(draft)}
          {needsAnalysis(draft) ? t(" Energy and key need InjeKt’s analysis, so only analysed tracks count.") : ''}
        </p>
      </div>
    </Modal>
  )
}
