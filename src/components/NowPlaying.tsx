import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown,
  Heart,
  ListMusic,
  Pause,
  Play,
  SkipBack,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from 'lucide-react'
import type { Song } from '@/api/types'
import { engine } from '@/audio/engine'
import { artUrl } from '@/lib/artwork'
import { toggleStarSong } from '@/lib/actions'
import { formatTime } from '@/lib/format'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { usePresence, useSlidingIndicator } from '@/lib/motion'
import { Art } from './ui'
import { Scrubber, overlapRegion } from './Scrubber'
import { Lyrics } from './Lyrics'
import { InjektPanel } from './InjektPanel'
import { CastButton } from './Cast'
import { RepeatButton, ShuffleButton } from './ModeButtons'
import { KAROUSEL_ADDED, KAROUSEL_WAITING, KarouselHeading } from './KarouselHeading'
import { NextButton } from './NextButton'
import { useTrackAnalysis } from '@/lib/beatGrid'
import { renderTemplate } from '@/lib/studio'

type Tab = 'queue' | 'lyrics' | 'injekt'

const getEngineTime = () => engine.currentTime

export function NowPlaying() {
  const open = useUi((state) => state.nowPlayingOpen)
  const setNowPlaying = useUi((state) => state.setNowPlaying)
  const player = usePlayer()
  const song = player.current()
  const {
    showLyrics,
    crossfadeEnabled,
    crossfadeSeconds,
    injektEnabled,
    showPlayerPanel,
  } = useSettings()
  const setSetting = useSettings((state) => state.set)
  const [tab, setTab] = useState<Tab>('queue')
  const [starred, setStarred] = useState(Boolean(song?.starred))
  // The full player stays open across tracks; the heart has to follow them.
  useEffect(() => setStarred(Boolean(song?.starred)), [song?.id, song?.starred])
  const analysis = useTrackAnalysis(song?.id)
  const beats = useMemo(
    () => (analysis && analysis.bpm > 0 && analysis.bpmConfidence >= 0.25 ? { bpm: analysis.bpm, offset: analysis.downbeatOffset || analysis.beatOffset || 0 } : null),
    [analysis],
  )
  const factsTemplate = useSettings((state) => state.factsTemplate)
  // Stays mounted for the slide back down, rather than vanishing on close.
  const { present, leaving } = usePresence(open && Boolean(song), 300)
  const tabsRef = useRef<HTMLDivElement>(null)
  const tabMarkRef = useRef<HTMLSpanElement>(null)
  const slideTab = useSlidingIndicator(tabsRef, tabMarkRef, "button[data-active='true']", [
    tab,
    present,
    showPlayerPanel,
    showLyrics,
  ])

  if (!present || !song) return null

  const playing = player.playback === 'playing'
  const duration = player.duration || song.duration || 0
  const overlap = overlapRegion(
    player.currentPlan(),
    duration,
    injektEnabled,
    crossfadeEnabled,
    crossfadeSeconds,
  )

  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: 'queue', label: 'Up next' },
    { id: 'lyrics', label: 'Lyrics', hidden: !showLyrics },
    { id: 'injekt', label: 'InjeKt' },
  ]

  return (
    <div className="npv" role="dialog" aria-label="Now playing" data-leaving={leaving}>
      <div className="npv__bar">
        <button className="iconbtn" aria-label="Close" onClick={() => setNowPlaying(false)}>
          <ChevronDown size={20} />
        </button>
        <h3>{player.source || 'Now playing'}</h3>
        <div style={{ flex: 1 }} />
        {player.transition ? (
          <span className="badge" data-tone="accent">
            <Sparkles size={11} />
            {player.transition.plan.label}
          </span>
        ) : null}
        <button
          className="pill"
          data-active={injektEnabled}
          aria-pressed={injektEnabled}
          title={
            injektEnabled
              ? 'InjeKt is on — transitions are beat-matched and key-aware'
              : 'InjeKt is off — plain crossfade between tracks'
          }
          onClick={() => setSetting('injektEnabled', !injektEnabled)}
        >
          <Sparkles size={13} />
          InjeKt {injektEnabled ? 'on' : 'off'}
        </button>
        <button
          className="iconbtn"
          aria-label={showPlayerPanel ? 'Hide the side panel' : 'Show the side panel'}
          aria-pressed={showPlayerPanel}
          title={showPlayerPanel ? 'Hide the side panel' : 'Show the side panel'}
          onClick={() => setSetting('showPlayerPanel', !showPlayerPanel)}
        >
          {showPlayerPanel ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </div>

      <div className="npv__body" data-panel={showPlayerPanel}>
        <div className="npv__left">
          <div className="npv__art" data-playing={playing}>
            <Art src={artUrl(song, 900)} alt={song.album ?? song.title} />
          </div>

          <div className="npv__info">
            <h2 className="npv__title">{song.title}</h2>
            <p className="npv__artist">
              {song.artistId ? (
                <Link to={`/artist/${encodeURIComponent(song.artistId)}`} onClick={() => setNowPlaying(false)}>
                  {song.artist}
                </Link>
              ) : (
                song.artist
              )}
              {song.albumId ? (
                <>
                  {' — '}
                  <Link to={`/album/${encodeURIComponent(song.albumId)}`} onClick={() => setNowPlaying(false)}>
                    {song.album}
                  </Link>
                </>
              ) : null}
            </p>
            {/* One quiet line rather than a row of pills, as in Kultr for iOS. */}
            <p className="npv__facts">
              {factsTemplate
                ? renderTemplate(factsTemplate, {
                    year: song.year ? String(song.year) : '',
                    genre: song.genre ?? '',
                    format: song.suffix?.toUpperCase() ?? '',
                    bitrate: song.bitRate ? String(song.bitRate) : '',
                    bpm: analysis?.bpm ? String(Math.round(analysis.bpm)) : song.bpm ? String(song.bpm) : '',
                    key: analysis?.camelot ?? '',
                    energy: analysis ? String(Math.round(analysis.energy * 10)) : '',
                    rating: song.userRating ? String(song.userRating) : '',
                    plays: song.playCount ? String(song.playCount) : '',
                    album: song.album ?? '',
                  })
                : [song.year, song.genre, song.suffix?.toUpperCase(), song.bitRate ? `${song.bitRate} kbps` : null]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
          </div>

          <div className="npv__controls">
            <Scrubber
              getTime={getEngineTime}
              duration={duration}
              onSeek={player.seek}
              overlap={overlap}
              active={playing}
              beats={beats}
            />
            {/* Three columns, not one flex row: the two side groups each take
                an equal share, so the play button sits dead centre however
                many controls flank it. */}
            <div className="npv__buttons">
              <div className="npv__side">
                <ShuffleButton size={18} />
                <button
                  className="iconbtn"
                  data-active={starred}
                  aria-label="Favourite"
                  onClick={async () => setStarred(await toggleStarSong(song, starred))}
                >
                  <Heart size={18} fill={starred ? 'currentColor' : 'none'} />
                </button>
                <button className="iconbtn" aria-label="Previous" onClick={() => void player.previous()}>
                  <SkipBack size={24} fill="currentColor" />
                </button>
              </div>
              <button
                className="npv__play"
                aria-label={playing ? 'Pause' : 'Play'}
                onClick={() => void player.toggle()}
              >
                {playing ? (
                  <Pause size={26} fill="currentColor" />
                ) : (
                  <Play size={26} fill="currentColor" style={{ marginLeft: 3 }} />
                )}
              </button>
              <div className="npv__side">
                <NextButton size={24} label="Next" />
                <RepeatButton size={18} />
                <CastButton size={18} />
              </div>
            </div>
          </div>
        </div>

        {showPlayerPanel ? (
        <div className="npv__right">
          <div className="npv__tabs" ref={tabsRef}>
            <span className="npv__tabmark" ref={tabMarkRef} aria-hidden="true" />
            {tabs
              .filter((entry) => !entry.hidden)
              .map((entry) => (
                <button
                  key={entry.id}
                  className="pill"
                  data-active={tab === entry.id}
                  onClick={(event) => {
                    slideTab(event.currentTarget)
                    setTab(entry.id)
                  }}
                >
                  {entry.label}
                </button>
              ))}
          </div>

          <div className="npv__pane glass">
            {/* Keyed so a new tab fades in rather than swapping in place. */}
            <div className="npv__panebody" key={tab}>
              {tab === 'queue' ? <UpNext /> : null}
              {tab === 'lyrics' ? <Lyrics song={song} /> : null}
              {tab === 'injekt' ? <InjektPanel /> : null}
            </div>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  )
}

function UpNext() {
  const player = usePlayer()
  const karousel = useSettings((state) => state.injektAutoQueue)
  const upcoming = player.queue.slice(player.index + 1, player.index + 40)
  // What Karousel added goes under its own heading.
  const split = upcoming.findIndex((song) => song.kultrKarousel)
  const firstKarousel = split >= 0 ? split : upcoming.length
  // Waiting to top the queue up; a repeating queue never runs out, so not then.
  const waiting = karousel && player.repeat === 'off' && split < 0 && !player.current()?.kultrStreamUrl

  const row = (song: Song, offset: number) => (
    <button
      key={`${song.id}-${offset}`}
      className="queue__item"
      style={{ width: '100%' }}
      onClick={() => void player.jumpTo(player.index + 1 + offset)}
    >
      <div className="queue__art">
        <Art src={artUrl(song, 80)} alt={song.album ?? song.title} />
      </div>
      <div className="trackrow__text" style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span className="trackrow__title">{song.title}</span>
        <span className="trackrow__artist">{song.artist}</span>
      </div>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{formatTime(song.duration)}</span>
    </button>
  )

  if (!upcoming.length) {
    return waiting ? (
      <KarouselHeading text={KAROUSEL_WAITING} />
    ) : (
      <p className="row__hint">
        Nothing queued after this one. Tap shuffle twice for Karousel, and music like this keeps
        playing when the queue runs out.
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {upcoming.slice(0, firstKarousel).map((song, offset) => row(song, offset))}
      {split >= 0 ? <KarouselHeading text={KAROUSEL_ADDED} /> : null}
      {upcoming.slice(firstKarousel).map((song, offset) => row(song, firstKarousel + offset))}
      {waiting ? <KarouselHeading text={KAROUSEL_WAITING} /> : null}
      <p className="row__hint" style={{ marginTop: 8 }}>
        <ListMusic size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
        Drag to reorder in the queue panel.
      </p>
    </div>
  )
}
