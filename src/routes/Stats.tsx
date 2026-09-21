import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Trash2 } from 'lucide-react'
import type { Song } from '@/api/types'
import { allSongs, clearHistory, recentHistory, type PlayHistoryEntry } from '@/db'
import { formatDuration, formatRelative } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { useToast } from '@/store/ui'
import { Empty, Section } from '@/components/ui'
import { TrackList } from '@/components/TrackList'

/**
 * Listening stats built from Kultr's own play history (kept locally), not from
 * the server's counters — so it reflects what you actually played here.
 */
export function Stats() {
  const { data, loading, reload } = useAsync(
    async () => {
      const [history, songs] = await Promise.all([recentHistory(2000), allSongs()])
      return { history, songs }
    },
    [],
    { history: [] as PlayHistoryEntry[], songs: [] as Song[] },
  )

  const summary = useMemo(() => {
    const byId = new Map(data.songs.map((song) => [song.id, song]))
    const plays = new Map<string, number>()
    const artistSeconds = new Map<string, number>()
    let totalSeconds = 0
    const dayBuckets = new Map<string, number>()

    for (const entry of data.history) {
      totalSeconds += entry.seconds
      plays.set(entry.songId, (plays.get(entry.songId) ?? 0) + 1)
      const song = byId.get(entry.songId)
      if (song?.artist) {
        artistSeconds.set(song.artist, (artistSeconds.get(song.artist) ?? 0) + entry.seconds)
      }
      const day = new Date(entry.playedAt).toISOString().slice(0, 10)
      dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + entry.seconds)
    }

    const topSongs = [...plays.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id, count]) => ({ song: byId.get(id), count }))
      .filter((entry): entry is { song: Song; count: number } => Boolean(entry.song))

    const topArtists = [...artistSeconds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

    // Last 14 days, oldest first, for the little bar chart.
    const days: { day: string; seconds: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const key = date.toISOString().slice(0, 10)
      days.push({ day: key, seconds: dayBuckets.get(key) ?? 0 })
    }

    return { topSongs, topArtists, totalSeconds, days, plays: data.history.length }
  }, [data])

  if (loading) return <div className="skeleton" style={{ height: 300 }} />

  if (!data.history.length) {
    return (
      <Empty icon={<BarChart3 size={24} />} title="No listening history yet">
        Play something and Kultr will start keeping track. History is stored only in this browser —
        it never leaves your machine.
      </Empty>
    )
  }

  const peak = Math.max(1, ...summary.days.map((day) => day.seconds))

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Listening</h1>
          <span className="page-head__sub">
            {summary.plays.toLocaleString()} plays · {formatDuration(summary.totalSeconds)} of music
          </span>
        </div>
        <div className="page-actions">
          <button
            className="pill"
            onClick={async () => {
              await clearHistory()
              reload()
              useToast.getState().show('Listening history cleared.', 'info')
            }}
          >
            <Trash2 size={14} />
            Clear history
          </button>
        </div>
      </div>

      <Section title="The last two weeks" icon={<BarChart3 size={16} />}>
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

      <Section title="Top artists" icon={<BarChart3 size={16} />}>
        <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
          {summary.topArtists.map(([artist, seconds]) => (
            <div key={artist} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{artist}</span>
                <span style={{ color: 'var(--ink-3)' }}>{formatDuration(seconds)}</span>
              </div>
              <div className="syncbar" style={{ height: 6 }}>
                <div
                  className="syncbar__fill"
                  style={{ width: `${(seconds / summary.topArtists[0][1]) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Played most" icon={<BarChart3 size={16} />}>
        <TrackList
          songs={summary.topSongs.map((entry) => entry.song)}
          source="Your top tracks"
          numbering="index"
          sortable={false}
        />
      </Section>

      <Section title="Recent" icon={<BarChart3 size={16} />}>
        <div style={{ display: 'grid', gap: 2 }}>
          {data.history.slice(0, 25).map((entry, index) => {
            const song = data.songs.find((item) => item.id === entry.songId)
            return (
              <div
                key={`${entry.songId}-${index}`}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '7px 10px',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  {song?.albumId ? (
                    <Link to={`/album/${encodeURIComponent(song.albumId)}`}>
                      {song?.title ?? 'Unknown track'}
                    </Link>
                  ) : (
                    (song?.title ?? 'Unknown track')
                  )}
                  <span style={{ color: 'var(--ink-3)' }}> — {song?.artist ?? '—'}</span>
                </span>
                <span style={{ color: 'var(--ink-3)' }}>{formatRelative(entry.playedAt)}</span>
              </div>
            )
          })}
        </div>
      </Section>
    </>
  )
}
