import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Play } from 'lucide-react'
import type { Song } from '@/api/types'
import { allSongs, recentHistory, type PlayHistoryEntry } from '@/db'
import { artUrl } from '@/lib/artwork'
import { formatDuration } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { monthRecap, recapMonths } from '@/lib/recap'
import { usePlayer } from '@/store/player'
import { useSync } from '@/store/sync'
import { Art, Empty } from '@/components/ui'
import { locale, t } from '@/i18n'

const monthName = (ms: number) => new Date(ms).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })

/**
 * The monthly recap: what you played in this browser in a month — the time,
 * the tracks, the artists and albums you came back to, the busiest day.
 * As in Kultr for iOS and Android.
 */
export function Recap() {
  const listeningAt = useSync((state) => state.listeningAt)
  const { data, loading } = useAsync(
    async () => {
      const [history, songs] = await Promise.all([recentHistory(100_000), allSongs()])
      return { history, songs: new Map(songs.map((song) => [song.id, song])) }
    },
    [listeningAt],
    { history: [] as PlayHistoryEntry[], songs: new Map<string, Song>() },
  )
  const months = useMemo(() => recapMonths(data.history), [data.history])
  const [picked, setPicked] = useState<number | null>(null)
  const month = picked ?? months[0] ?? null
  const recap = useMemo(() => (month === null ? null : monthRecap(data.history, data.songs, month)), [data, month])

  if (loading) return <div className="skeleton" style={{ height: 300 }} />
  if (!recap || !recap.plays) {
    return (
      <Empty icon={<CalendarDays size={24} />} title={t("No recap yet")}>
        {t("The recap is made from what you play in this browser. Play some music and come back at the end of the month.")}</Empty>
    )
  }

  const change = recap.previousSeconds > 0 ? Math.round(((recap.seconds - recap.previousSeconds) / recap.previousSeconds) * 100) : null
  const hours = recap.seconds / 3600

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>{monthName(recap.month)}</h1>
          <span className="page-head__sub">
            {t("Your month in music, from what you played in this browser.")}{' '}<Link to="/stats">{t("Listening")}</Link> {' '}{t("has the counts from your server.")}</span>
        </div>
        <div className="page-actions">
          {months.length > 1 ? (
            <select className="field-input" style={{ width: 'auto' }} value={month ?? ''} onChange={(event) => setPicked(Number(event.target.value))} aria-label={t("Month")}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          ) : null}
          {recap.topSongs.length ? (
            <button className="pill pill-accent" onClick={() => void usePlayer.getState().playNow(recap.topSongs.map((e) => e.item), 0, `${monthName(recap.month)}: most played`)}>
              <Play size={14} />
              {t("Play the top songs")}</button>
          ) : null}
        </div>
      </div>

      <div className="recap-tiles">
        <div className="recap-tile glass">
          <strong>{hours >= 1 ? `${hours.toFixed(hours < 10 ? 1 : 0)} h` : formatDuration(recap.seconds)}</strong>
          <span>
            {t("listened%@", change !== null ? t(" · %@%@% on the month before", change >= 0 ? '+' : '', change) : '')}
          </span>
        </div>
        <div className="recap-tile glass">
          <strong>{recap.plays.toLocaleString()}</strong>
          <span>{t("plays of %@ tracks", recap.tracks.toLocaleString())}</span>
        </div>
        <div className="recap-tile glass">
          <strong>{recap.artists.toLocaleString()}</strong>
          <span>{t("artists")}</span>
        </div>
        <div className="recap-tile glass">
          <strong>{recap.firstListens.toLocaleString()}</strong>
          <span>{t("tracks heard for the first time")}</span>
        </div>
        {recap.busiestDay ? (
          <div className="recap-tile glass">
            <strong>{new Date(recap.busiestDay.date).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
            <span>{t("the busiest day · %@", formatDuration(recap.busiestDay.seconds))}</span>
          </div>
        ) : null}
      </div>

      <div className="recap-columns">
        <section className="section glass">
          <div className="section__head">
            <h3>{t("Most played")}</h3>
          </div>
          <ol className="recap-list">
            {recap.topSongs.map((entry, index) => (
              <li key={entry.item.id}>
                <span className="recap-list__rank">{index + 1}</span>
                <Art src={artUrl(entry.item, 96)} alt={entry.item.album ?? entry.item.title} className="recap-list__art" />
                <span className="recap-list__text">
                  <strong>{entry.item.title}</strong>
                  <span>{entry.item.artist}</span>
                </span>
                <span className="recap-list__count">{entry.plays}×</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="section glass">
          <div className="section__head">
            <h3>{t("Artists")}</h3>
          </div>
          <ol className="recap-list">
            {recap.topArtists.map((entry, index) => (
              <li key={entry.item.id ?? entry.item.name}>
                <span className="recap-list__rank">{index + 1}</span>
                <span className="recap-list__text">
                  <strong>{entry.item.id ? <Link to={`/artist/${encodeURIComponent(entry.item.id)}`}>{entry.item.name}</Link> : entry.item.name}</strong>
                  <span>{formatDuration(entry.seconds)}</span>
                </span>
                <span className="recap-list__count">{entry.plays}×</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="section glass">
          <div className="section__head">
            <h3>{t("Albums")}</h3>
          </div>
          <ol className="recap-list">
            {recap.topAlbums.map((entry, index) => (
              <li key={entry.item.id ?? entry.item.name}>
                <span className="recap-list__rank">{index + 1}</span>
                <Art src={artUrl({ coverArt: entry.item.coverArt, id: entry.item.id }, 96)} alt={entry.item.name} className="recap-list__art" />
                <span className="recap-list__text">
                  <strong>{entry.item.id ? <Link to={`/album/${encodeURIComponent(entry.item.id)}`}>{entry.item.name}</Link> : entry.item.name}</strong>
                  <span>{entry.item.artist}</span>
                </span>
                <span className="recap-list__count">{entry.plays}×</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
