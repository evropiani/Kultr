import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import type { ScanStatus, Song } from '@/api/types'
import { describeError, maybeClient } from '@/api/subsonic'
import { allSongs, analysedIds, analysisCount, clearAnalysis } from '@/db'
import { formatCount, formatRelative } from '@/lib/format'
import { analyseMany, type BatchProgress } from '@/audio/analysis'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useSync } from '@/store/sync'
import { useToast } from '@/store/ui'
import { Modal, Row, Section, Switch } from '@/components/ui'
import { locale, t } from '@/i18n'
import type { SyncPhase } from '@/sync/engine'

const PHASE_LABEL: Record<SyncPhase, string> = {
  idle: 'waiting',
  connecting: 'connecting',
  scanning: 'reading files',
  artists: 'artists',
  albums: 'albums',
  songs: 'tracks',
  playlists: 'playlists',
  genres: 'genres',
  cleanup: 'tidying up',
  done: 'done',
  error: 'error',
  cancelled: 'cancelled',
}

export function SyncPage() {
  const sync = useSync()
  const auth = useAuth()
  const settings = useSettings()
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [scan, setScan] = useState<ScanStatus | null>(null)

  useEffect(() => {
    void sync.refreshState()
    void sync.probe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshScan = useCallback(async () => {
    try {
      setScan((await maybeClient()?.getScanStatus()) ?? null)
    } catch {
      setScan(null)
    }
  }, [])

  useEffect(() => {
    void refreshScan()
  }, [refreshScan])

  const triggerServerScan = async () => {
    try {
      const status = await maybeClient()?.startScan(false)
      setScan(status ?? null)
      useToast
        .getState()
        .show(t("Navidrome is rescanning its music folder. Run “Check for updates” when it finishes."), 'info')
    } catch (err) {
      useToast.getState().show(describeError(err), 'error')
    }
  }

  const { state, progress, running, lastSummary, error, hint } = sync

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>{t("Library sync")}</h1>
          <span className="page-head__sub">
            {t("Kultr keeps its own copy of your library so browsing is instant and works offline.")}</span>
        </div>
        <div className="page-actions">
          {running ? (
            <button className="pill" onClick={sync.cancel}>
              <X size={14} />
              {t("Cancel")}</button>
          ) : null}
          <button className="pill" disabled={running} onClick={() => void sync.run('check')}>
            <RefreshCw size={14} className={running ? 'spin' : undefined} />
            {t("Check for updates")}</button>
          <button className="pill pill-accent" disabled={running} onClick={() => void sync.run('full')}>
            <Database size={14} />
            {t("Sync everything")}</button>
        </div>
      </div>

      {running ? (
        <section className="section glass" style={{ marginBottom: 18 }}>
          <div className="section__head">
            <RefreshCw size={16} className="spin" />
            <h3>{progress.message || t("Working…")}</h3>
            <span className="value">{Math.round(progress.percent * 100)}%</span>
          </div>
          <div className="syncbar">
            <div className="syncbar__fill" style={{ width: `${Math.max(2, progress.percent * 100)}%` }} />
          </div>
          <p className="section__desc" style={{ marginTop: 10, marginBottom: 0 }}>
            {t("Phase: %@%@", t(PHASE_LABEL[progress.phase]), progress.total > 1 ? t(" · %@ of %@", progress.current.toLocaleString(), progress.total.toLocaleString()) : '')}
          </p>
        </section>
      ) : null}

      {error ? (
        <section className="section glass" style={{ marginBottom: 18, borderColor: 'rgb(255 95 87 / 0.4)' }}>
          <div className="section__head">
            <AlertTriangle size={16} color="var(--danger)" />
            <h3>{t("Sync failed")}</h3>
          </div>
          <p className="section__desc" style={{ marginBottom: 0 }}>{error}</p>
        </section>
      ) : null}

      {hint && !running ? (
        <section className="section glass" style={{ marginBottom: 18 }}>
          <div className="section__head">
            <AlertTriangle size={16} color="var(--warning)" />
            <h3>{t("Your server has changed")}</h3>
            <button className="pill pill-accent" onClick={() => void sync.run('check')}>
              {t("Update now")}</button>
          </div>
          <p className="section__desc" style={{ marginBottom: 0 }}>{hint}</p>
        </section>
      ) : null}

      {lastSummary && !running ? (
        <section className="section glass" style={{ marginBottom: 18 }}>
          <div className="section__head">
            <CheckCircle2 size={16} color="var(--success)" />
            <h3>{lastSummary.upToDate ? t("Everything is up to date") : t("Sync finished")}</h3>
            <span className="value">
              {((lastSummary.finishedAt - lastSummary.startedAt) / 1000).toFixed(1)}s
            </span>
          </div>
          <p className="section__desc" style={{ marginBottom: 0 }}>
            {lastSummary.upToDate
              ? t("Nothing on the server had changed since the last check.")
              : t("%@ album(s) added, %@ updated, %@ removed, %@ stale track(s) cleaned up.", lastSummary.albumsAdded, lastSummary.albumsUpdated, lastSummary.albumsRemoved, lastSummary.songsRemoved)}
            {lastSummary.errors.length
              ? t(" %@ album(s) could not be read — check the server log.", lastSummary.errors.length)
              : ''}
          </p>
        </section>
      ) : null}

      <Section title={t("What Kultr has stored")} icon={<Database size={16} />}>
        <div className="stats" style={{ marginTop: 6 }}>
          <Stat value={state.counts.songs} label={t("Tracks")} />
          <Stat value={state.counts.albums} label={t("Albums")} />
          <Stat value={state.counts.artists} label={t("Artists")} />
          <Stat value={state.counts.playlists} label={t("Playlists")} />
          <Stat value={state.counts.genres} label={t("Genres")} />
        </div>
        <Row label={t("Last full sync")} hint={t("A full sync re-reads every album's track list.")}>
          <span className="value" style={{ minWidth: 120 }}>{formatRelative(state.lastFullSync)}</span>
        </Row>
        <Row label={t("Last check")} hint={t("Checks read the album index and only pull what changed.")}>
          <span className="value" style={{ minWidth: 120 }}>{formatRelative(state.lastCheck)}</span>
        </Row>
      </Section>

      <Section
        title={t("Your server")}
        icon={<Server size={16} />}
        description={t("Navidrome scans your music folder on its own schedule. If you just added files, ask it to scan, wait for it to finish, then check for updates here.")}
      >
        <Row label={t("Connected to")} hint={auth.activeProfile()?.serverUrl || t("Same origin as this page")}>
          <span className="value" style={{ minWidth: 140 }}>
            {auth.serverInfo?.type ?? t("navidrome")} {auth.serverInfo?.serverVersion ?? auth.serverInfo?.version ?? ''}
          </span>
        </Row>
        <Row
          label={t("Server scan")}
          hint={
            scan
              ? scan.scanning
                ? t("A scan is running right now.")
                : t("Server reports %@%@.", formatCount(scan.count ?? 0, 'track'), scan.lastScan ? t(", last scanned %@", new Date(scan.lastScan).toLocaleString(locale())) : '')
              : t("Scan status is unavailable — your account may not have admin rights.")
          }
        >
          <button className="pill" onClick={() => void refreshScan()}>
            {t("Refresh")}</button>
          <button className="pill" disabled={scan?.scanning} onClick={() => void triggerServerScan()}>
            {t("Start a scan")}</button>
        </Row>
      </Section>

      <Section
        title={t("Automatic syncing")}
        icon={<RefreshCw size={16} />}
        description={t("Kultr can quietly check for changes while it is open.")}
      >
        <Row label={t("Check on startup")} hint={t("Runs an incremental check a few seconds after you connect.")}>
          <Switch
            checked={settings.autoSyncOnStart}
            onChange={(value) => settings.set('autoSyncOnStart', value)}
            label={t("Check on startup")}
          />
        </Row>
        <Row
          label={t("Repeat check")}
          hint={t("How often to look for changes while Kultr stays open. Set to 0 to disable.")}
        >
          <input
            className="field"
            style={{ width: 96 }}
            type="number"
            min={0}
            max={1440}
            value={settings.autoSyncMinutes}
            onChange={(event) => settings.set('autoSyncMinutes', Number(event.target.value))}
          />
          <span className="value">{t("minutes")}</span>
        </Row>
        <Row
          label={t("Include playlist contents")}
          hint={t("Fetches every playlist's track list during a sync. Turn off if you have hundreds of playlists.")}
        >
          <Switch
            checked={settings.syncPlaylistContents}
            onChange={(value) => settings.set('syncPlaylistContents', value)}
            label={t("Include playlist contents")}
          />
        </Row>
      </Section>

      <AnalysisSection />

      <Section
        title={t("Local storage")}
        icon={<HardDrive size={16} />}
        description={t("Clearing the mirror does not touch anything on your server — you can always sync again.")}
      >
        <Row label={t("Clear the local library")} hint={t("Removes mirrored tracks, albums, artists and playlists.")}>
          <button className="pill" onClick={() => setConfirmWipe(true)}>
            <Trash2 size={14} />
            {t("Clear")}</button>
        </Row>
      </Section>

      <Modal
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title={t("Clear the local library?")}
        footer={
          <>
            <button className="pill" onClick={() => setConfirmWipe(false)}>
              {t("Cancel")}</button>
            <button
              className="pill"
              style={{ color: 'var(--danger)' }}
              onClick={async () => {
                await sync.wipe()
                setConfirmWipe(false)
                useToast.getState().show(t("Local library cleared."), 'info')
              }}
            >
              {t("Clear it")}</button>
          </>
        }
      >
        <p className="row__hint">
          {t("Your music, playlists and favourites stay safe on Navidrome. You will need to sync again before browsing works offline.")}</p>
      </Modal>
    </>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value.toLocaleString()}</span>
      <span className="stat__label">{label}</span>
    </div>
  )
}

/** Batch InjeKt analysis with progress and cancellation. */
function AnalysisSection() {
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [current, setCurrent] = useState('')
  const [running, setRunning] = useState(false)
  const [analysed, setAnalysed] = useState(0)
  const [library, setLibrary] = useState(0)
  const controller = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    const [count, songs] = await Promise.all([analysisCount(), allSongs()])
    setAnalysed(count)
    setLibrary(songs.length)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const start = async (mode: 'missing' | 'all') => {
    const songs: Song[] = await allSongs()
    let queue = songs
    if (mode === 'missing') {
      const known = await analysedIds()
      queue = songs.filter((song) => !known.has(song.id))
    }
    if (!queue.length) {
      useToast.getState().show(t("Every track has already been analysed."), 'success')
      return
    }
    controller.current = new AbortController()
    setRunning(true)
    setTotal(queue.length)
    setDone(0)
    const succeeded = await analyseMany(
      queue,
      (progress: BatchProgress) => {
        setDone(progress.done)
        setCurrent(progress.current ?? '')
      },
      { concurrency: 2, signal: controller.current.signal },
    )
    setRunning(false)
    await refresh()
    useToast
      .getState()
      .show(t("Analysed %@ of %@ tracks.", succeeded.toLocaleString(), queue.length.toLocaleString()), 'success')
  }

  const percent = total ? done / total : 0

  return (
    <Section
      title={t("InjeKt analysis")}
      icon={<Sparkles size={16} />}
      description={t("InjeKt needs each track's tempo, key, energy and intro/outro points. Analysis happens automatically for whatever is about to play, but you can do it in bulk so every transition is ready from the first play. Each track is streamed once at a low bitrate; nothing is written to your server.")}
    >
      <div className="stats" style={{ marginTop: 6 }}>
        <Stat value={analysed} label={t("Analysed")} />
        <Stat value={Math.max(0, library - analysed)} label={t("Remaining")} />
      </div>

      {running ? (
        <>
          <div className="syncbar" style={{ marginTop: 14 }}>
            <div className="syncbar__fill" style={{ width: `${Math.max(2, percent * 100)}%` }} />
          </div>
          <p className="section__desc" style={{ marginTop: 10 }}>
            {done.toLocaleString()} / {total.toLocaleString()} · {current}
          </p>
        </>
      ) : null}

      <Row label={t("Analyse the library")} hint={t("Only the tracks that have not been analysed yet.")}>
        {running ? (
          <button
            className="pill"
            onClick={() => {
              controller.current?.abort()
              setRunning(false)
            }}
          >
            <X size={14} />
            {t("Stop")}</button>
        ) : (
          <>
            <button className="pill" onClick={() => void start('missing')}>
              {t("Analyse missing")}</button>
            <button className="pill" onClick={() => void start('all')}>
              {t("Re-analyse all")}</button>
          </>
        )}
      </Row>
      <Row label={t("Clear analysis")} hint={t("Throw the cached tempo and key data away.")}>
        <button
          className="pill"
          disabled={running}
          onClick={async () => {
            await clearAnalysis()
            await refresh()
            useToast.getState().show(t("Analysis cache cleared."), 'info')
          }}
        >
          <Trash2 size={14} />
          {t("Clear")}</button>
      </Row>
    </Section>
  )
}
