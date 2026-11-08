import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderOpen, FolderPlus, HardDrive, KeyRound, RefreshCw, Trash2, Upload } from 'lucide-react'
import { maybeClient } from '@/api/subsonic'
import { isLocalClient } from '@/local/client'
import { allFolders, deleteFolder, putFolder } from '@/local/db'
import { forgetFolders } from '@/local/files'
import {
  canImport,
  canOpenFolders,
  clearImported,
  desktop,
  folderAccess,
  importedFolder,
  importFiles,
  pickFolder,
  requestFolderAccess,
  type MusicFolder,
} from '@/local/folders'
import { isLocalProfile, useAuth } from '@/store/auth'
import { useSync } from '@/store/sync'
import { useToast } from '@/store/ui'
import { Row, Spinner } from './ui'
import { t } from '@/i18n'

/**
 * Music on this computer: choosing folders, importing files, and asking again
 * for folders the browser has stopped letting Kultr read.
 */

export interface FolderRow {
  folder: MusicFolder
  access: PermissionState
}

/** The music folders and whether each can be read right now. */
export function useMusicFolders(): { rows: FolderRow[]; loading: boolean; reload: () => Promise<void> } {
  const [rows, setRows] = useState<FolderRow[]>([])
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    try {
      const folders = await allFolders()
      setRows(await Promise.all(folders.map(async (folder) => ({ folder, access: await folderAccess(folder) }))))
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])
  const lastCheck = useSync((state) => state.state.lastCheck)
  useEffect(() => {
    void reload()
  }, [reload, lastCheck])
  return { rows, loading, reload }
}

/** Use the music on this computer (if not already), then read the folders. */
async function useAndScan(): Promise<void> {
  forgetFolders()
  const auth = useAuth.getState()
  if (!isLocalProfile(auth.activeProfile()) || auth.status !== 'connected') {
    // Connecting starts the first read of the folders on its own (App.tsx).
    await auth.connectLocal()
    return
  }
  const client = maybeClient()
  if (isLocalClient(client)) client.invalidate()
  const sync = useSync.getState()
  if (sync.running) sync.cancel()
  await sync.run('check')
}

/** Ask for a folder and add it. Must run inside a click. True if one was added. */
export async function addMusicFolder(): Promise<boolean> {
  const folder = await pickFolder()
  if (!folder) return false
  const existing = await allFolders()
  let same: MusicFolder | undefined
  for (const other of existing) {
    if (folder.path && other.path === folder.path) same = other
    const a = other.handle as unknown as { isSameEntry?: (b: unknown) => Promise<boolean> } | undefined
    if (!same && a?.isSameEntry && folder.handle && other.kind === 'handle' && (await a.isSameEntry(folder.handle).catch(() => false))) same = other
    if (same) break
  }
  if (same) {
    useToast.getState().show(t("%@ is already one of your music folders.", same.name), 'info')
    return false
  }
  await putFolder(folder)
  await useAndScan()
  return true
}

/** Copy chosen files into Kultr's own storage, then read them. */
export async function importMusic(files: File[], onProgress?: (done: number, total: number) => void): Promise<number> {
  const folder = importedFolder()
  if (!(await allFolders()).some((other) => other.id === folder.id)) await putFolder(folder)
  const count = await importFiles(files, onProgress)
  if (count) await useAndScan()
  return count
}

/** Hidden file inputs for importing, a folder at a time or file by file. */
function useImportInputs(onDone?: () => void) {
  const folderInput = useRef<HTMLInputElement>(null)
  const filesInput = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const toast = useToast()

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (!files.length) return
    setProgress({ done: 0, total: files.length })
    try {
      const count = await importMusic(files, (done, total) => setProgress({ done, total }))
      toast.show(count ? t("Imported %@ file(s).", count.toLocaleString()) : t("None of those were music files Kultr can play."), count ? 'success' : 'warning')
      if (count) onDone?.()
    } catch (err) {
      toast.show(t("Could not import: %@", err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setProgress(null)
    }
  }

  const inputs = (
    <>
      <input
        ref={folderInput}
        type="file"
        hidden
        multiple
        // A folder at a time, keeping the folders inside it.
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(event) => void onChange(event)}
      />
      <input
        ref={filesInput}
        type="file"
        hidden
        multiple
        accept="audio/*,.flac,.opus,.ogg,.m4a,.aiff,.aif,.wav,.jpg,.jpeg,.png"
        onChange={(event) => void onChange(event)}
      />
    </>
  )
  return {
    inputs,
    progress,
    importFolder: () => folderInput.current?.click(),
    importFiles: () => filesInput.current?.click(),
  }
}

/** The buttons to start with music on this computer; on the login screen and in Settings. */
export function LocalMusicChooser({ onReady }: { onReady?: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const imports = useImportInputs(onReady)
  const openable = canOpenFolders()
  // The desktop app reads folders on disk; copying music into it would only duplicate it.
  const importable = canImport() && !desktop()

  const choose = async () => {
    setBusy(true)
    try {
      if (await addMusicFolder()) onReady?.()
    } catch (err) {
      toast.show(t("Could not open that folder: %@", err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!openable && !importable) {
    return <p className="login__hint">{t("This browser cannot read music from your computer. Try Chrome, Edge or Firefox, or the desktop app.")}</p>
  }

  return (
    <div className="local-chooser">
      {imports.inputs}
      {openable ? (
        <button type="button" className="pill pill-lg local-chooser__main" disabled={busy || Boolean(imports.progress)} onClick={() => void choose()}>
          {busy ? <Spinner /> : <FolderOpen size={16} />}
          {t("Choose a music folder")}</button>
      ) : null}
      {importable ? (
        <div className="local-chooser__more">
          <button type="button" className="pill" disabled={Boolean(imports.progress)} onClick={imports.importFolder}>
            <Upload size={14} />
            {openable ? t("Import a folder instead") : t("Import a music folder")}
          </button>
          <button type="button" className="pill" disabled={Boolean(imports.progress)} onClick={imports.importFiles}>
            <Upload size={14} />
            {t("Import files")}</button>
        </div>
      ) : null}
      {imports.progress ? (
        <p className="login__hint" role="status">
          {t("Copying %@ of %@ into Kultr…", imports.progress.done.toLocaleString(), imports.progress.total.toLocaleString())}</p>
      ) : (
        <p className="login__hint">
          {openable
            ? desktop()
              ? t("Kultr reads the folder where it is and finds new music whenever you sync.")
              : t("Kultr reads the folder where it is; nothing is uploaded or copied. The browser may ask once per visit before it lets Kultr read it again.")
            : t("This browser cannot keep a folder open, so the music is copied into Kultr’s own storage in the browser. Nothing leaves your computer.")}
        </p>
      )}
    </div>
  )
}

const KIND_LABEL: Record<MusicFolder['kind'], string> = {
  handle: 'Read where it is',
  opfs: 'Copied into this browser',
  desktop: 'Read where it is',
}

/** The music folders, for Settings. */
export function MusicFoldersRows() {
  const { rows, loading, reload } = useMusicFolders()
  const toast = useToast()
  const running = useSync((state) => state.running)
  const progress = useSync((state) => state.progress)
  const imports = useImportInputs(() => void reload())
  const local = useAuth((state) => isLocalProfile(state.activeProfile()))

  if (loading) return <Spinner />

  return (
    <>
      {imports.inputs}
      {rows.length === 0 ? <p className="row__hint">{t("No music folders yet.")}</p> : null}
      {rows.map(({ folder, access }) => (
        <Row
          key={folder.id}
          label={folder.name}
          hint={`${folder.path ?? t(KIND_LABEL[folder.kind])}${access === 'granted' ? '' : t(' · Kultr needs your permission to read it again')}`}
        >
          {access !== 'granted' ? (
            <button
              className="pill pill-accent"
              onClick={async () => {
                if (await requestFolderAccess(folder)) {
                  await reload()
                  await useAndScan()
                }
              }}
            >
              <KeyRound size={14} />
              {t("Allow")}</button>
          ) : null}
          {folder.kind === 'opfs' ? (
            <button className="pill" onClick={imports.importFolder} title={t("Copy another folder of music in")}>
              <Upload size={14} />
              {t("Import more")}</button>
          ) : null}
          <button
            className="pill pill-icon"
            aria-label={t("Remove %@", folder.name)}
            title={folder.kind === 'opfs' ? t("Remove, and delete the copies from this browser") : t("Remove from Kultr (the files stay where they are)")}
            onClick={async () => {
              const message =
                folder.kind === 'opfs'
                  ? t('Remove the music imported into Kultr? The copies in this browser are deleted; the originals on your computer are not touched.')
                  : t('Stop using %@? The files stay where they are.', folder.name)
              if (!window.confirm(message)) return
              await deleteFolder(folder.id)
              if (folder.kind === 'desktop' && folder.path) await desktop()?.forgetFolder?.(folder.path)
              if (folder.kind === 'opfs') await clearImported()
              await reload()
              if (local) await useAndScan()
              toast.show(t("Removed %@.", folder.name), 'info')
            }}
          >
            <Trash2 size={14} />
          </button>
        </Row>
      ))}
      <Row
        label={t("Add music")}
        hint={
          canOpenFolders()
            ? t("Add a folder; Kultr reads the folders inside it too. Albums come from the tags in the files, or from the folder names when there are none.")
            : t("This browser cannot keep a folder open, so music is copied into Kultr’s storage in the browser.")
        }
        wrap
      >
        {canOpenFolders() ? (
          <button
            className="pill pill-accent"
            onClick={async () => {
              try {
                if (await addMusicFolder()) await reload()
              } catch (err) {
                toast.show(t("Could not open that folder: %@", err instanceof Error ? err.message : String(err)), 'error')
              }
            }}
          >
            <FolderPlus size={14} />
            {t("Add a folder")}</button>
        ) : null}
        {canImport() && !desktop() ? (
          <>
            <button className="pill" disabled={Boolean(imports.progress)} onClick={imports.importFolder}>
              <Upload size={14} />
              {t("Import a folder")}</button>
            <button className="pill" disabled={Boolean(imports.progress)} onClick={imports.importFiles}>
              <Upload size={14} />
              {t("Import files")}</button>
          </>
        ) : null}
      </Row>
      {rows.length ? (
        <Row
          label={local ? t("Look for new music") : t("Use this music")}
          hint={
            running && local
              ? progress.message
              : local
                ? t("Reads the folders again. Only new and changed files are opened, so it is quick after the first time.")
                : t("Switch from your server to the music on this computer.")
          }
        >
          <button
            className="pill"
            disabled={running}
            onClick={() => void useAndScan()}
          >
            {local ? <RefreshCw size={14} className={running ? 'spin' : undefined} /> : <HardDrive size={14} />}
            {local ? (running ? t("Reading…") : t("Rescan")) : t("Use it")}
          </button>
        </Row>
      ) : null}
      {imports.progress ? (
        <p className="row__hint" role="status">
          {t("Copying %@ of %@ into Kultr…", imports.progress.done.toLocaleString(), imports.progress.total.toLocaleString())}</p>
      ) : null}
    </>
  )
}

/**
 * Shown while music on this computer is in use and the browser has stopped
 * letting Kultr read a folder (it asks again after a restart). One click
 * brings it back; the rest of the library carries on meanwhile.
 */
export function FolderAccessBanner() {
  const local = useAuth((state) => state.status === 'connected' && isLocalProfile(state.activeProfile()))
  const { rows, reload } = useMusicFolders()
  if (!local) return null
  const blocked = rows.filter((row) => row.access !== 'granted')
  if (!blocked.length) return null
  const names = blocked.map((row) => row.folder.name).join(', ')
  return (
    <div className="folder-banner glass" role="status">
      <KeyRound size={16} />
      <span>
        {t("Your browser needs your permission again before Kultr can play from")}{' '}<strong>{names}</strong>.
      </span>
      <button
        className="pill pill-accent"
        onClick={async () => {
          let any = false
          for (const row of blocked) any = (await requestFolderAccess(row.folder)) || any
          await reload()
          if (any) {
            forgetFolders()
            void useSync.getState().run('check')
          }
        }}
      >
        {t("Allow")}</button>
    </div>
  )
}
