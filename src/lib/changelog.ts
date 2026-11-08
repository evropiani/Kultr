/**
 * The changelog, read into versions and entries, for What's new and the
 * update log. The text is CHANGELOG.md itself, bundled at build time, so the
 * app and the repository always say the same thing.
 */

export interface ChangeEntry {
  /** "2026-11-08 17:12", as written in the heading. */
  when: string
  title: string
  /** The entry's Markdown, without its heading. */
  body: string
}

export interface Release {
  version: string
  date: string
  entries: ChangeEntry[]
}

export function parseChangelog(text: string): Release[] {
  const releases: Release[] = []
  let release: Release | null = null
  let entry: ChangeEntry | null = null
  let lines: string[] = []
  const flush = () => {
    if (entry && release) {
      entry.body = lines.join('\n').trim()
      release.entries.push(entry)
    }
    entry = null
    lines = []
  }
  for (const line of text.split('\n')) {
    const version = /^## (\d+\.\d+\.\d+)\s*(?:—|-)\s*(.+)$/.exec(line)
    if (version) {
      flush()
      release = { version: version[1], date: version[2].trim(), entries: [] }
      releases.push(release)
      continue
    }
    // "### 2026-11-08 17:12 — Title": the dash between is a spaced em dash
    // (or a spaced hyphen), never the hyphens inside the date.
    const heading = /^### (.+?)\s+—\s+(.+)$/.exec(line) ?? /^### (.+?)\s+-\s+(.+)$/.exec(line)
    if (heading && release) {
      flush()
      entry = { when: heading[1].trim(), title: heading[2].trim(), body: '' }
      continue
    }
    if (line.startsWith('## ') || line.startsWith('---')) {
      flush()
      if (line.startsWith('## ')) release = null
      continue
    }
    if (entry) lines.push(line)
  }
  flush()
  return releases
}

/** Whether version `a` is newer than `b` ("1.11.0" > "1.9.3"). */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  }
  return false
}

/** The releases after `seen`, up to and including `current`, newest first. */
export function releasesSince(releases: Release[], seen: string, current: string): Release[] {
  return releases.filter((release) => isNewer(release.version, seen) && !isNewer(release.version, current))
}
