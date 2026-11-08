import { useEffect, useState } from 'react'
import { Check, FolderDown, HardDrive, Loader2, Trash2, X } from 'lucide-react'
import type { Song } from '@/api/types'
import { formatBytes } from '@/lib/format'
import { supportsFolderDownloads } from '@/lib/filesystem'
import { countPending, useOffline } from '@/store/offline'
import { Modal } from './ui'
import { isLocalId } from '@/local/files'
import { t } from '@/i18n'

/**
 * "Sync offline" button.
 *
 * It reports how much is actually missing rather than just saying "download",
 * so pressing it a second time visibly does nothing — which is the behaviour
 * people expect from a sync button.
 */
export function OfflineButton({
  songs,
  label,
  className = 'pill',
  compact,
}: {
  songs: Song[]
  label?: string
  className?: string
  compact?: boolean
}) {
  const download = useOffline((state) => state.download)
  const running = useOffline((state) => state.running)
  const ids = useOffline((state) => state.ids)
  const [pending, setPending] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!songs.length) {
      setPending(0)
      return
    }
    void countPending(songs).then((count) => {
      if (!cancelled) setPending(count)
    })
    return () => {
      cancelled = true
    }
  }, [songs, ids])

  const complete = pending === 0 && songs.length > 0
  // Music on this computer needs no downloading.
  if (songs.length && songs.every((song) => isLocalId(song.id))) return null
  const title = complete
    ? t('Every track here is already downloaded')
    : pending === null
      ? t('Download these tracks for offline playback')
      : pending === 1
        ? t('Download 1 track that is not stored yet')
        : t('Download %@ tracks that are not stored yet', pending)

  return (
    <button
      className={className}
      disabled={running || !songs.length}
      data-active={complete || undefined}
      title={title}
      onClick={() => void download(songs, label)}
    >
      {running ? (
        <Loader2 size={14} className="spin" />
      ) : complete ? (
        <Check size={14} />
      ) : (
        <FolderDown size={14} />
      )}
      {compact ? null : complete ? t("Offline") : t("Sync offline")}
      {!compact && pending ? <span className="badge" style={{ height: 18 }}>{pending}</span> : null}
    </button>
  )
}

/** Live progress for a running offline sync, shown in the sidebar footer. */
export function OfflineProgressBar() {
  const { running, progress, cancel } = useOffline()
  if (!running || !progress) return null
  const percent = progress.total ? (progress.done / progress.total) * 100 : 0

  return (
    <div className="sidebar__server" style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FolderDown size={13} />
        <strong style={{ flex: 1 }}>{t("Downloading…")}</strong>
        <button className="iconbtn" style={{ width: 22, height: 22 }} aria-label={t("Stop")} onClick={cancel}>
          <X size={13} />
        </button>
      </div>
      <div className="syncbar" style={{ height: 5 }}>
        <div className="syncbar__fill" style={{ width: `${Math.max(3, percent)}%` }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        {progress.done}/{progress.total} · {formatBytes(progress.bytes)}
      </span>
    </div>
  )
}

/**
 * Asked once, the first time anything is downloaded: browser storage, or a
 * folder on disk. Only shown where the browser can actually do both.
 */
export function OfflineDestinationPrompt() {
  const pending = useOffline((state) => state.pending)
  const chooseDestination = useOffline((state) => state.chooseDestination)
  const dismissPrompt = useOffline((state) => state.dismissPrompt)

  return (
    <Modal open={Boolean(pending)} onClose={dismissPrompt} title={t("Where should downloads go?")}>
      <p className="row__hint" style={{ marginBottom: 16 }}>
        {t("%@ track(s) are about to be downloaded. You can change this later in Settings → Offline.", pending?.length ?? 0)}</p>

      <div style={{ display: 'grid', gap: 8 }}>
        <button className="login__profile" onClick={() => void chooseDestination('folder')}>
          <FolderDown size={17} />
          <span style={{ flex: 1, minWidth: 0 }}>
            {t("A folder on this device")}<small>
              {t("You pick the folder once. Files land there with readable names, so other apps can play them too.")}</small>
          </span>
        </button>

        <button className="login__profile" onClick={() => void chooseDestination('browser')}>
          <HardDrive size={17} />
          <span style={{ flex: 1, minWidth: 0 }}>
            {t("Inside this browser")}<small>
              {t("Nothing to choose, works everywhere — but the files are only reachable from Kultr, and the browser may evict them if storage runs low.")}</small>
          </span>
        </button>
      </div>

      {!supportsFolderDownloads() ? (
        <p className="row__hint" style={{ marginTop: 14 }}>
          {t("This browser cannot write to a folder, so only browser storage is available. Chrome, Edge and other Chromium browsers can.")}</p>
      ) : null}
    </Modal>
  )
}

/** Remove-downloads button, paired with OfflineButton where it makes sense. */
export function RemoveOfflineButton({ songs }: { songs: Song[] }) {
  const remove = useOffline((state) => state.remove)
  const ids = useOffline((state) => state.ids)
  const stored = songs.filter((song) => ids.has(song.id))
  if (!stored.length) return null

  return (
    <button
      className="pill"
      title={t("Delete %@ downloaded track(s)", stored.length)}
      onClick={() => void remove(stored.map((song) => song.id))}
    >
      <Trash2 size={14} />
      {t("Remove downloads")}</button>
  )
}
