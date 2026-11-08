import { useMemo } from 'react'
import { summary, type Station } from '@/audio/stations'
import { useAsync } from '@/lib/hooks'
import { libraryDecades } from '@/lib/stationLibrary'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { StationIcon } from './StationIcon'

/** The stations, one tap to play, for Home. */
export function StationShelf() {
  const mine = useSettings((state) => state.stations)
  const playing = usePlayer((state) => state.station)
  const { data: decades } = useAsync(() => libraryDecades(), [], [] as Station[])
  const all = useMemo(() => [...mine, ...decades], [mine, decades])
  if (!all.length) return null
  return (
    <div className="station-strip">
      {all.map((station) => (
        <button
          key={station.id}
          className="station-chip glass"
          data-active={playing?.id === station.id || undefined}
          title={summary(station)}
          onClick={() => {
            const player = usePlayer.getState()
            if (player.station && player.playback === 'playing') void player.switchStation(station)
            else void player.playStation(station)
          }}
        >
          <span className="station-card__icon">
            <StationIcon symbol={station.icon} size={18} />
          </span>
          <span className="station-chip__name">{station.name}</span>
        </button>
      ))}
    </div>
  )
}
