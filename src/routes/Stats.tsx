import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Clock, RefreshCw, Trash2, Users } from 'lucide-react'
import type { Song } from '@/api/types'
import { allSongs, clearHistory, recentHistory, type PlayHistoryEntry } from '@/db'
import { formatCount, formatDuration, formatRelative } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { artistPlays, mostPlayed, recentPlays } from '@/lib/listening'
import { useSync } from '@/store/sync'
import { useToast } from '@/store/ui'
import { Empty, Section } from '@/components/ui'
import { TrackList } from '@/components/TrackList'

/**
 * Listening stats.
 *
 * Play counts and last-played times come from the server, so they cover every
 * device and survive clearing this browser. Navidrome keeps a count and a
 * last-played time per track rather than a log of every play, so the
 * day-by-day chart is the one part built from this browser's own history.
 */
export function Stats() {
  const listeningAt = useSync((state) => state.listeningAt)
  const lastCheck = useSync((state) => state.state.lastCheck)
  const refreshListening = useSync((state) => state.refreshListening)
  const [refreshing, setRefreshing] = useState(false)

  const { data, loading, reload } = useAsync(
    async () => {
      const [history, songs] = await Promise.all([recentHistory(2000), allSongs()])
      return { history, songs }
    },
    [listeningAt, lastCheck],
    { history: [] as PlayHistoryEntry[], songs: [] as Song[] },
  )

  const summary = useMemo(() => {
    const totalPlays = data.songs.reduce((sum, song) => sum + (song.playCount ?? 0), 0)
    const recent = recentPlays(data.songs, data.history, 25)
    const top = mostPlayed(data.songs, 20)
    const artists = artistPlays(data.songs, 10)

    let localSeconds = 0
    const dayBuckets = new Map<string, number>()
    for (const entry of data.history) {
      localSeconds += entry.seconds
      const day = new Date(entry.playedAt).toISOString().slice(0, 10)
      dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + entry.seconds)
    }
    // Last 14 days, oldest first, for the little bar chart.
    const days: { day: string; seconds: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const key = date.toISOString().slice(0, 10)
      days.push({ day: key, seconds: dayBuckets.get(key) ?? 0 })
    }
    const pending = data.history.filter((entry) => entry.pending).length

    return { totalPlays, recent, top, artists, localSeconds, days, pending }
  }, [data])

  if (loading) return <div className="skeleton" style={{ height: 300 }} />

  const refresh = async () => {
    setRefreshing(true)
    try {
      await refreshListening()
      reload()
    } finally {
      setRefreshing(false)
    }
  }

  if (!summary.totalPlays && !data.history.length) {
    return (
      <Empty
        icon={<BarChart3 size={24} />}
        title="Nothing played yet"
        action={
          <button className="pill" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw size={14} className={refreshing ? 'spin' : undefined} />
            Check the server
          </button>
        }
      >
        Play something and it shows up here. Plays are counted on your Navidrome server, so what you
        play on other devices counts too, and none of it is lost if this browser's data is cleared.
      </Empty>
    )
  }

  const peak = Math.max(1, ...summary.days.map((day) => day.seconds))
  const topArtistPlays = summary.artists[0]?.plays ?? 1

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Listening</h1>
          <span className="page-head__sub">
            {formatCount(summary.totalPlays, 'play')} counted on your server
            {summary.pending ? ` · ${formatCount(summary.pending, 'play')} waiting to be sent` : ''}
          </span>
        </div>
        <div className="page-actions">
          <button className="pill" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw size={14} className={refreshing ? 'spin' : undefined} />
            Refresh from server
          </button>
        </div>
      </div>

      {summary.recent.length ? (
        <Section title="Recently played" icon={<Clock size={16} />}>
          <div style={{ display: 'grid', gap: 2 }}>
            {summary.recent.map(({ song, at }) => (
              <div
                key={song.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '7px 10px',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  {song.albumId ? (
                    <Link to={`/album/${encodeURIComponent(song.albumId)}`}>{song.title}</Link>
                  ) : (
                    song.title
                  )}
                  <span style={{ color: 'var(--ink-3)' }}> — {song.artist ?? '—'}</span>
                </span>
                <span style={{ color: 'var(--ink-3)' }}>{formatRelative(at)}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {summary.top.length ? (
        <Section title="Played the most" icon={<BarChart3 size={16} />}>
          <TrackList songs={summary.top} source="Your top tracks" numbering="index" sortable={false} />
        </Section>
      ) : null}

      {summary.artists.length ? (
        <Section title="Top artists" icon={<Users size={16} />}>
          <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
            {summary.artists.map((entry) => (
              <div key={entry.artistId ?? entry.artist} style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  {entry.artistId ? (
                    <Link to={`/artist/${encodeURIComponent(entry.artistId)}`}>{entry.artist}</Link>
                  ) : (
                    <span>{entry.artist}</span>
                  )}
                  <span style={{ color: 'var(--ink-3)' }}>{formatCount(entry.plays, 'play')}</span>
                </div>
                <div className="syncbar" style={{ height: 6 }}>
                  <div className="syncbar__fill" style={{ width: `${(entry.plays / topArtistPlays) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {data.history.length ? (
        <Section
          title="In this browser, the last two weeks"
          icon={<BarChart3 size={16} />}
          description={`${formatDuration(summary.localSeconds)} of music played here. Your server keeps a count and a last-played time for each track rather than a log of every play, so this chart only knows about this browser.`}
          actions={
            <button
              className="pill"
              onClick={async () => {
                await clearHistory()
                reload()
                useToast.getState().show('This browser’s history was cleared. Play counts on your server are untouched.', 'info')
              }}
            >
              <Trash2 size={14} />
              Clear
            </button>
          }
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 6,
              height: 140,
              paddingTop: 10,
            }}
          >
            {summary.days.map((day) => (
              <div key={day.day} style={{ flex: 1, display: 'grid', gap: 6, justifyItems: 'center' }}>
                <div
                  title={`${day.day}: ${formatDuration(day.seconds)}`}
                  style={{
                    width: '100%',
                    height: `${Math.max(2, (day.seconds / peak) * 104)}px`,
                    borderRadius: 6,
                    background:
                      'linear-gradient(180deg, var(--accent), rgb(var(--accent-r) var(--accent-g) var(--accent-b) / 0.35))',
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{day.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  )
}
