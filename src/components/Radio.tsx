import { useMemo } from 'react'
import { Heart } from 'lucide-react'
import type { RadioStation, Song } from '@/api/types'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'

/**
 * Internet radio, shared between the Radio page and the home page.
 *
 * Stations are not library tracks: they have no duration and no cover art, and
 * Subsonic has no notion of starring one. Hearting a station is therefore
 * local to Kultr and lives in settings, which is why it travels with a
 * settings export but not to other clients.
 */

/** Wrap stations as the pseudo-tracks the player understands. */
export function radioSongs(stations: RadioStation[]): Song[] {
  return stations.map((station) => ({
    id: station.id,
    title: station.name,
    artist: 'Internet radio',
    album: station.homePageUrl ?? '',
    duration: 0,
    kultrStreamUrl: station.streamUrl,
  }))
}

export function RadioGrid({
  stations,
  songs,
}: {
  stations: RadioStation[]
  songs: Song[]
}) {
  const favourites = useSettings((state) => state.favouriteRadios)
  const setSetting = useSettings((state) => state.set)
  const favouriteSet = useMemo(() => new Set(favourites), [favourites])

  const toggle = (id: string) => {
    setSetting(
      'favouriteRadios',
      favouriteSet.has(id) ? favourites.filter((entry) => entry !== id) : [...favourites, id],
    )
  }

  return (
    <div className="radios">
      {stations.map((station, index) => {
        const starred = favouriteSet.has(station.id)
        return (
          <div key={station.id} className="radio glass glass-hit">
            <button
              className="radio__play"
              onClick={() => void usePlayer.getState().playNow(songs, index, 'Radio')}
            >
              <span className="radio__name">{station.name}</span>
              <span className="radio__url">{station.streamUrl}</span>
            </button>
            <button
              className="iconbtn"
              data-active={starred}
              aria-label={starred ? `Unfavourite ${station.name}` : `Favourite ${station.name}`}
              aria-pressed={starred}
              onClick={() => toggle(station.id)}
            >
              <Heart size={16} fill={starred ? 'currentColor' : 'none'} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
