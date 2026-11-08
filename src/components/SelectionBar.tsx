import { FolderDown, Heart, ListPlus, Play, Trash2, X } from 'lucide-react'
import { toggleStarSong } from '@/lib/actions'
import { formatCount } from '@/lib/format'
import { useLastWhile, usePresence } from '@/lib/motion'
import { useOffline } from '@/store/offline'
import { usePlayer } from '@/store/player'
import { useSelection } from '@/store/selection'
import { usePlaylistPicker } from './AddToPlaylist'
import { isLocalId } from '@/local/files'
import { useCratePicker } from './Crates'
import { Package } from 'lucide-react'
import { t } from '@/i18n'

/**
 * Floating bar that appears whenever anything is ticked. Everything it offers
 * works on the whole selection at once.
 */
export function SelectionBar() {
  const selected = useSelection((state) => state.selected)
  const clear = useSelection((state) => state.clear)
  const selectedSongs = useSelection((state) => state.selectedSongs)
  const download = useOffline((state) => state.download)
  const removeOffline = useOffline((state) => state.remove)
  const offlineIds = useOffline((state) => state.ids)

  const { present, leaving } = usePresence(selected.length > 0, 200)
  // Clearing the selection is what dismisses the bar, so it would otherwise
  // read "0 tracks selected" on its way out.
  const shownCount = useLastWhile(selected.length, selected.length > 0)

  if (!present) return null
  const songs = selectedSongs()
  const storedCount = songs.filter((song) => offlineIds.has(song.id)).length

  return (
    <div
      className="selbar glass glass-strong"
      role="toolbar"
      aria-label={t("Selection actions")}
      data-leaving={leaving}
    >
      <button className="iconbtn" aria-label={t("Clear selection")} onClick={clear}>
        <X size={16} />
      </button>
      <strong style={{ fontSize: 13 }}>{t("%@ selected", formatCount(shownCount, 'track'))}</strong>

      <div className="selbar__actions">
        <button
          className="pill"
          onClick={() => {
            void usePlayer.getState().playNow(songs, 0, t('Selection'))
            clear()
          }}
        >
          <Play size={14} fill="currentColor" />
          {t("Play")}</button>
        <button className="pill" onClick={() => usePlayer.getState().enqueue(songs, 'next')}>
          <ListPlus size={14} />
          {t("Play next")}</button>
        <button
          className="pill"
          onClick={() => usePlaylistPicker.getState().show(songs.map((song) => song.id))}
        >
          <ListPlus size={14} />
          {t("Playlist")}</button>
        <button
          className="pill"
          onClick={async () => {
            for (const song of songs) await toggleStarSong(song)
          }}
        >
          <Heart size={14} />
          {t("Favourite")}</button>
        <button className="pill" onClick={() => useCratePicker.getState().show({ kind: 'songs', songs })}>
          <Package size={14} />
          {t("Crate")}</button>
        {songs.every((song) => isLocalId(song.id)) ? null : (
          <button className="pill pill-accent" onClick={() => void download(songs, 'Selection')}>
            <FolderDown size={14} />
            {t("Sync offline")}</button>
        )}
        {storedCount > 0 ? (
          <button
            className="pill"
            title={t("Delete %@ downloaded track(s)", storedCount)}
            onClick={() => void removeOffline(songs.map((song) => song.id))}
          >
            <Trash2 size={14} />
            {t("Delete downloads")}</button>
        ) : null}
      </div>
    </div>
  )
}
