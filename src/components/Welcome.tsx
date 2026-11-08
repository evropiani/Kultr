import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Infinity as InfinityIcon, Library, Palette, Search, Sparkles } from 'lucide-react'
import { useSettings, WAS_INSTALLED } from '@/store/settings'
import { Modal } from './ui'

const SLIDES = [
  {
    icon: Library,
    title: 'Welcome to Kultr',
    text: 'Your whole library is kept right here, so browsing and search are instant and work without a connection. Check for updates in the top bar brings in anything new.',
  },
  {
    icon: Sparkles,
    title: 'It mixes like a DJ',
    text: 'Crossfade, gapless albums, and InjeKt: tempo-matched blends that land on the beat, with a bass swap. Click Next to skip, or hold it to mix into the next track now.',
  },
  {
    icon: InfinityIcon,
    title: 'The music never runs out',
    text: 'Tap shuffle twice for Karousel: when the queue ends, music like it keeps coming. Stations play endless mixes by tempo, energy or decade, and the energy planner builds a set from a line you draw.',
    link: { to: '/stations', label: 'See the stations' },
  },
  {
    icon: Search,
    title: 'Just say it',
    text: 'The search field does things too: “play Night Drive”, “shuffle” and an artist, “sleep in 30 minutes”, “mix now”, “plan an hour”. Press / from anywhere to jump to it.',
  },
  {
    icon: Palette,
    title: 'Make it yours',
    text: 'Light, dark or night mode, any accent colour, corners, borders and the playhead in Settings → Appearance; the shelves on Home in Settings → Home page.',
    link: { to: '/settings', label: 'Open Settings' },
  },
] as const

/** A short tour on the first start, once. */
export function Welcome() {
  const seen = useSettings((state) => state.hasSeenWelcome)
  const setSetting = useSettings((state) => state.set)
  // Someone who used Kultr before the tour existed has seen it all already.
  const [open, setOpen] = useState(() => !seen && !WAS_INSTALLED)
  const [index, setIndex] = useState(0)
  const close = () => {
    setSetting('hasSeenWelcome', true)
    setOpen(false)
  }
  const slide = SLIDES[index]
  const Icon = slide.icon
  const last = index === SLIDES.length - 1

  return (
    <Modal
      open={open}
      onClose={close}
      title={`${index + 1} of ${SLIDES.length}`}
      footer={
        <>
          <button className="pill" style={{ marginRight: 'auto' }} onClick={close}>
            Skip
          </button>
          {index > 0 ? (
            <button className="pill" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          ) : null}
          <button className="pill pill-accent" onClick={() => (last ? close() : setIndex(index + 1))}>
            {last ? 'Start listening' : 'Next'}
          </button>
        </>
      }
    >
      <div className="welcome">
        <span className="welcome__icon">
          <Icon size={30} />
        </span>
        <h2>{slide.title}</h2>
        <p>{slide.text}</p>
        {'link' in slide && slide.link ? (
          <Link className="welcome__link" to={slide.link.to} onClick={close}>
            {slide.link.label}
          </Link>
        ) : null}
        <div className="welcome__dots" aria-hidden="true">
          {SLIDES.map((_, i) => (
            <span key={i} data-on={i === index || undefined} />
          ))}
        </div>
      </div>
    </Modal>
  )
}

