/** Formatting helpers shared across the UI. */

export function formatTime(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

/** "1 hr 24 min" style duration, for albums and playlists. */
export function formatDuration(seconds: number | undefined | null): string {
  if (!seconds || !Number.isFinite(seconds)) return '—'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)
  if (hours > 0) return `${hours} hr ${minutes} min`
  if (minutes > 0) return `${minutes} min`
  return `${total} sec`
}

export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, exponent)
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function formatCount(value: number | undefined | null, singular: string, plural?: string): string {
  const count = value ?? 0
  return `${count.toLocaleString()} ${count === 1 ? singular : plural ?? `${singular}s`}`
}

export function formatRelative(timestamp: number | null | undefined): string {
  if (!timestamp) return 'never'
  const delta = Date.now() - timestamp
  const minutes = Math.round(delta / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(timestamp).toLocaleDateString()
}

export function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** "The Beatles" sorts under B, like every other music app. */
export function sortKey(name: string | undefined): string {
  if (!name) return ''
  return name.replace(/^(the|a|an|der|die|das|le|la|les|el|los)\s+/i, '').toLowerCase()
}

export function initials(name: string | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
}
