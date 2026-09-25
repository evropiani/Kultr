import { useEffect, useState } from 'react'
import {
  Heart,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Timer,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { engine } from '@/audio/engine'
import { artUrl } from '@/lib/artwork'
import { toggleStarSong } from '@/lib/actions'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { Art } from './ui'
import { Scrubber, overlapRegion } from './Scrubber'
import { SleepTimerMenu } from './SleepTimer'
import { CastButton } from './Cast'

/** Read straight from the engine so the scrubber needs no React state. */
const getEngineTime = () => engine.currentTime

export function PlayerBar() {
  const player = usePlayer()
  const song = player.current()
  const { volume, muted, injektEnabled, crossfadeEnabled, crossfadeSeconds } = useSettings()
  const setSetting = useSettings((state) => state.set)
  const setNowPlaying = useUi((state) => state.setNowPlaying)
  const setQueue = useUi((state) => state.setQueue)
  const queueOpen = useUi((state) => state.queueOpen)
  const [starred, setStarred] = useState(false)

  useEffect(() => setStarred(Boolean(song?.starred)), [song?.id, song?.starred])

  if (!song) {
    return (
      <footer className="player glass glass-strong">
        <div className="player__meta">
          <div className="player__art" style={{ display: 'grid', placeItems: 'center' }}>
            <ListMusic size={20} opacity={0.4} />
          </div>
          <div className="player__text">
            <span className="player__title">Nothing playing</span>
            <span className="player__artist">Pick something from your library</span>
          </div>
        </div>
        <div className="player__center">
          <div className="player__buttons">
            <button className="iconbtn" disabled>
              <SkipBack size={18} />
            </button>
            <button className="player__play" disabled>
              <Play size={18} fill="currentColor" />
            </button>
            <button className="iconbtn" disabled>
              <SkipForward size={18} />
            </button>
          </div>
        </div>
        <div className="player__right" />
      </footer>
    )
  }

  const playing = player.playback === 'playing'
  const duration = player.duration || song.duration || 0
  const overlap = overlapRegion(
    player.currentPlan(),
    duration,
    injektEnabled,
    crossfadeEnabled,
    crossfadeSeconds,
  )

  return (
    <footer className="player glass glass-strong">
      <div className="player__meta">
        <div className="player__art" onClick={() => setNowPlaying(true)} title="Open the full player">
          <Art src={artUrl(song, 160)} alt={song.album ?? song.title} />
        </div>
        <div className="player__text">
          <span className="player__title">{song.title}</span>
          <span className="player__artist">
            {song.artist}
            {song.album ? ` — ${song.album}` : ''}
          </span>
        </div>
        <button
          className="iconbtn"
          data-active={starred}
          aria-label={starred ? 'Remove from favourites' : 'Add to favourites'}
          onClick={async () => setStarred(await toggleStarSong(song, starred))}
        >
          <Heart size={16} fill={starred ? 'currentColor' : 'none'} />
        </button>
        {player.transition ? (
          <span className="badge" data-tone="accent" title={player.transition.plan.reason}>
            <Sparkles size={11} />
            Mixing
          </span>
        ) : null}
      </div>

      <div className="player__center">
        <div className="player__buttons">
          <button
            className="iconbtn"
            data-active={player.shuffle}
            aria-label="Shuffle"
            onClick={() => player.setShuffle(!player.shuffle)}
          >
            <Shuffle size={16} />
          </button>
          <button className="iconbtn" aria-label="Previous track" onClick={() => void player.previous()}>
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button
            className="player__play"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => void player.toggle()}
          >
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <button className="iconbtn" aria-label="Next track" onClick={() => void player.next(true)}>
            <SkipForward size={18} fill="currentColor" />
          </button>
          <button
            className="iconbtn"
            data-active={player.repeat !== 'off'}
            aria-label={`Repeat: ${player.repeat}`}
            onClick={player.cycleRepeat}
          >
            {player.repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>
        </div>
        <Scrubber
          getTime={getEngineTime}
          duration={duration}
          onSeek={player.seek}
          overlap={overlap}
          active={playing}
        />
      </div>

      <div className="player__right">
        <button
          className="iconbtn"
          data-active={injektEnabled}
          aria-label={injektEnabled ? 'Turn InjeKt off' : 'Turn InjeKt on'}
          aria-pressed={injektEnabled}
          title={
            injektEnabled
              ? 'InjeKt is on — transitions are beat-matched and key-aware'
              : 'InjeKt is off — plain crossfade between tracks'
          }
          onClick={() => setSetting('injektEnabled', !injektEnabled)}
        >
          <Sparkles size={17} />
        </button>
        <CastButton />
        <SleepTimerMenu>
          <Timer size={16} />
        </SleepTimerMenu>
        <button
          className="iconbtn"
          data-active={queueOpen}
          aria-label="Queue"
          onClick={() => setQueue(!queueOpen)}
        >
          <ListMusic size={17} />
        </button>
        <div className="player__volume">
          <button
            className="iconbtn"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={player.toggleMute}
          >
            {muted || volume === 0 ? (
              <VolumeX size={17} />
            ) : volume < 0.5 ? (
              <Volume1 size={17} />
            ) : (
              <Volume2 size={17} />
            )}
          </button>
          <input
            className="slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            aria-label="Volume"
            style={{ ['--fill' as string]: `${(muted ? 0 : volume) * 100}%` }}
            onChange={(event) => player.setVolume(Number(event.target.value))}
          />
        </div>
        <button
          className="iconbtn"
          aria-label="Open the full player"
          title="Open the full player"
          onClick={() => setNowPlaying(true)}
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </footer>
  )
}
