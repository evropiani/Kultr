import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CirclePlus, Play, RefreshCw } from 'lucide-react'
import type { Song } from '@/api/types'
import { karouselSources } from '@/audio/karouselMusic'
import { artUrl } from '@/lib/artwork'
import { formatTime } from '@/lib/format'
import { suggestSongs } from '@/lib/playlistSuggestions'
import { usePlayer } from '@/store/player'
import { Art, Spinner } from './ui'
import { t } from '@/i18n'

/** How long a suggestion takes to leave once it has been added. */
const LEAVE_MS = 220

/**
 * Suggested songs at the bottom of a playlist, as on Spotify. Each has a +
 * to add it to the playlist; once one is added, the suggestions turn to
 * songs like it. Refresh offers different ones.
 */
export function PlaylistSuggestions({ songs, onAdd }: { songs: Song[]; onAdd: (song: Song) => Promise<boolean> }) {
  const [list, setList] = useState<Song[] | null>(null)
  const [basis, setBasis] = useState<Song | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<string | null>(null)
  const songsRef = useRef(songs)
  songsRef.current = songs
  // Only the newest request may change the list.
  const latest = useRef(0)

  const load = useCallback(async (playlist: Song[], added: Song | null, leaveOut: Song[] = []) => {
    const mine = ++latest.current
    setBusy(true)
    try {
      const picks = await suggestSongs(await karouselSources(), { playlist, added, leaveOut })
      if (mine !== latest.current) return
      setList(picks)
      setBasis(added)
    } catch {
      if (mine === latest.current) setList((current) => current ?? [])
    } finally {
      if (mine === latest.current) setBusy(false)
    }
  }, [])

  // Once per playlist: the page gives each playlist its own suggestions.
  useEffect(() => {
    void load(songsRef.current, null)
  }, [load])

  const add = async (song: Song) => {
    if (adding) return
    setAdding(song.id)
    const added = await onAdd(song)
    setAdding(null)
    if (!added) return
    setLeaving(song.id)
    window.setTimeout(() => {
      setLeaving(null)
      setList((current) => current?.filter((item) => item.id !== song.id) ?? null)
    }, LEAVE_MS)
    const playlist = songsRef.current.some((item) => item.id === song.id) ? songsRef.current : [...songsRef.current, song]
    void load(playlist, song)
  }

  const subtitle = basis
    ? t('More like “%@”', basis.title)
    : songs.length
      ? t('Based on the songs in this playlist')
      : t('Based on what you play most')

  return (
    <section className="suggestions" aria-busy={busy} aria-label={t('Recommended songs')}>
      <div className="suggestions__head">
        <div>
          <h2>{t('Recommended songs')}</h2>
          <p className="row__hint">{subtitle}</p>
        </div>
        {busy && list ? <Spinner /> : null}
      </div>

      {list === null ? (
        <div className="tracks">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="suggestion suggestion--skeleton" aria-hidden="true">
              <span />
              <div className="trackrow__main">
                <div className="trackrow__art" />
                <div className="suggestion__lines">
                  <i />
                  <i />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="row__hint suggestions__empty">
          {t('Nothing to suggest yet. Add a few songs, or play some music, and suggestions follow.')}
        </p>
      ) : (
        <div className="tracks">
          {list.map((song) => (
            <div
              key={song.id}
              className="suggestion"
              data-leaving={leaving === song.id}
              onDoubleClick={() => void usePlayer.getState().playNow([song], 0, t('Recommended songs'))}
            >
              <button
                className="suggestion__play"
                aria-label={t('Play %@', song.title)}
                onClick={() => void usePlayer.getState().playNow([song], 0, t('Recommended songs'))}
              >
                <Play size={14} fill="currentColor" />
              </button>
              <div className="trackrow__main">
                <div className="trackrow__art">
                  <Art src={artUrl(song, 80)} alt={song.album ?? song.title} />
                </div>
                <div className="trackrow__text">
                  <span className="trackrow__title">{song.title}</span>
                  {song.artistId ? (
                    <Link className="trackrow__artist" to={`/artist/${encodeURIComponent(song.artistId)}`}>
                      {song.artist}
                    </Link>
                  ) : (
                    <span className="trackrow__artist">{song.artist}</span>
                  )}
                </div>
              </div>
              <span className="trackrow__album suggestion__album">
                {song.albumId ? (
                  <Link className="trackrow__album" to={`/album/${encodeURIComponent(song.albumId)}`}>
                    {song.album}
                  </Link>
                ) : (
                  song.album
                )}
              </span>
              <span className="suggestion__time">{formatTime(song.duration)}</span>
              <button
                className="iconbtn suggestion__add"
                aria-label={t('Add “%@” to this playlist', song.title)}
                title={t('Add to this playlist')}
                disabled={Boolean(adding)}
                onClick={() => void add(song)}
              >
                {adding === song.id ? <Spinner /> : <CirclePlus size={20} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {list !== null ? (
        <div className="suggestions__foot">
          <button
            className="pill"
            disabled={busy}
            onClick={() => void load(songsRef.current, basis, list)}
          >
            <RefreshCw size={14} />
            {t('Refresh')}
          </button>
        </div>
      ) : null}
    </section>
  )
}
