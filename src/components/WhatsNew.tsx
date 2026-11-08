import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import changelogText from '../../CHANGELOG.md?raw'
import { parseChangelog, releasesSince, type Release } from '@/lib/changelog'
import { WAS_INSTALLED } from '@/store/settings'
import { Markdown } from './Markdown'
import { Modal } from './ui'

const SEEN_KEY = 'kultr.lastSeenVersion'

export const RELEASES: Release[] = parseChangelog(changelogText)

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}
function writeSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    /* private mode */
  }
}

/** One release's entries, as the update log and What's new show them. */
export function ReleaseNotes({ release }: { release: Release }) {
  return (
    <article className="release">
      <h2>
        Kultr {release.version} <small>{release.date}</small>
      </h2>
      {release.entries.map((entry) => (
        <section key={entry.when + entry.title}>
          <h3>{entry.title}</h3>
          <Markdown text={entry.body} />
        </section>
      ))}
    </article>
  )
}

/**
 * What's new: after an update, what changed in every version since the one
 * last seen, once. A first install gets the welcome instead.
 */
export function WhatsNew() {
  const current = __KULTR_VERSION__
  const [since] = useState(() => {
    const seen = readSeen()
    if (!seen) {
      // Someone who used Kultr before this screen existed hears about this
      // version; a new install starts with the welcome.
      if (!WAS_INSTALLED) writeSeen(current)
      return WAS_INSTALLED ? null : current
    }
    return seen
  })
  const releases = useMemo(() => {
    if (since === current) return []
    if (since === null) return RELEASES.filter((release) => release.version === current)
    return releasesSince(RELEASES, since, current).slice(0, 6)
  }, [since, current])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (releases.length) setOpen(true)
  }, [releases.length])

  const close = () => {
    writeSeen(current)
    setOpen(false)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="What’s new in Kultr"
      footer={
        <>
          <Link className="pill" to="/updates" onClick={close}>
            The whole update log
          </Link>
          <button className="pill pill-accent" onClick={close}>
            Got it
          </button>
        </>
      }
    >
      <div className="whats-new">
        {releases.map((release) => (
          <ReleaseNotes key={release.version} release={release} />
        ))}
      </div>
    </Modal>
  )
}

/** Every version's notes, newest first: Settings → About → Update log. */
export function UpdateLog() {
  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Update log</h1>
          <span className="page-head__sub">
            Every change to Kultr, newest first. You have version {__KULTR_VERSION__}.
          </span>
        </div>
      </div>
      <div className="update-log">
        {RELEASES.map((release) => (
          <section key={release.version} className="section glass">
            <ReleaseNotes release={release} />
          </section>
        ))}
      </div>
    </>
  )
}
