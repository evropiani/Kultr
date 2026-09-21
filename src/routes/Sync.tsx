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
        .show('Navidrome is rescanning its music folder. Run “Check for updates” when it finishes.', 'info')
    } catch (err) {
      useToast.getState().show(describeError(err), 'error')
    }
  }

  const { state, progress, running, lastSummary, error, hint } = sync

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Library sync</h1>
          <span className="page-head__sub">
            Kultr keeps its own copy of your library so browsing is instant and works offline.
          </span>
        </div>
        <div className="page-actions">
          {running ? (
            <button className="pill" onClick={sync.cancel}>
              <X size={14} />
              Cancel
            </button>
          ) : null}
          <button className="pill" disabled={running} onClick={() => void sync.run('check')}>
            <RefreshCw size={14} className={running ? 'spin' : undefined} />
            Check for updates
          </button>
          <button className="pill pill-accent" disabled={running} onClick={() => void sync.run('full')}>
            <Database size={14} />
            Sync everything
          </button>
        </div>
      </div>

      {running ? (
        <section className="section glass" style={{ marginBottom: 18 }}>
          <div className="section__head">
            <RefreshCw size={16} className="spin" />
            <h3>{progress.message || 'Working…'}</h3>
            <span className="value">{Math.round(progress.percent * 100)}%</span>
          </div>
          <div className="syncbar">
            <div className="syncbar__fill" style={{ width: `${Math.max(2, progress.percent * 100)}%` }} />
          </div>
          <p className="section__desc" style={{ marginTop: 10, marginBottom: 0 }}>
            Phase: {progress.phase}
            {progress.total > 1 ? ` · ${progress.current.toLocaleString()} of ${progress.total.toLocaleString()}` : ''}
          </p>
        </section>
      ) : null}

      {error ? (
        <section className="section glass" style={{ marginBottom: 18, borderColor: 'rgb(255 95 87 / 0.4)' }}>
          <div className="section__head">
            <AlertTriangle size={16} color="var(--danger)" />
            <h3>Sync failed</h3>
          </div>
          <p className="section__desc" style={{ marginBottom: 0 }}>{error}</p>
        </section>
      ) : null}

      {hint && !running ? (
        <section className="section glass" style={{ marginBottom: 18 }}>
          <div className="section__head">
            <AlertTriangle size={16} color="var(--warning)" />
            <h3>Your server has changed</h3>
            <button className="pill pill-accent" onClick={() => void sync.run('check')}>
              Update now
            </button>
          </div>
          <p className="section__desc" style={{ marginBottom: 0 }}>{hint}</p>
        </section>
      ) : null}

      {lastSummary && !running ? (
        <section className="section glass" style={{ marginBottom: 18 }}>
          <div className="section__head">
            <CheckCircle2 size={16} color="var(--success)" />
            <h3>{lastSummary.upToDate ? 'Everything is up to date' : 'Sync finished'}</h3>
            <span className="value">
              {((lastSummary.finishedAt - lastSummary.startedAt) / 1000).toFixed(1)}s
            </span>
          </div>
          <p className="section__desc" style={{ marginBottom: 0 }}>
            {lastSummary.upToDate
              ? 'Nothing on the server had changed since the last check.'
              : `${lastSummary.albumsAdded} album(s) added, ${lastSummary.albumsUpdated} updated, ${lastSummary.albumsRemoved} removed, ${lastSummary.songsRemoved} stale track(s) cleaned up.`}
            {lastSummary.errors.length
              ? ` ${lastSummary.errors.length} album(s) could not be read — check the server log.`
              : ''}
          </p>
        </section>
      ) : null}

      <Section title="What Kultr has stored" icon={<Database size={16} />}>
        <div className="stats" style={{ marginTop: 6 }}>
          <Stat value={state.counts.songs} label="Tracks" />
          <Stat value={state.counts.albums} label="Albums" />
          <Stat value={state.counts.artists} label="Artists" />
          <Stat value={state.counts.playlists} label="Playlists" />
          <Stat value={state.counts.genres} label="Genres" />
        </div>
        <Row label="Last full sync" hint="A full sync re-reads every album's track list.">
          <span className="value" style={{ minWidth: 120 }}>{formatRelative(state.lastFullSync)}</span>
        </Row>
        <Row label="Last check" hint="Checks read the album index and only pull what changed.">
          <span className="value" style={{ minWidth: 120 }}>{formatRelative(state.lastCheck)}</span>
        </Row>
      </Section>

      <Section
        title="Your server"
        icon={<Server size={16} />}
        description="Navidrome scans your music folder on its own schedule. If you just added files, ask it to scan, wait for it to finish, then check for updates here."
      >
        <Row label="Connected to" hint={auth.activeProfile()?.serverUrl || 'Same origin as this page'}>
          <span className="value" style={{ minWidth: 140 }}>
            {auth.serverInfo?.type ?? 'navidrome'} {auth.serverInfo?.serverVersion ?? auth.serverInfo?.version ?? ''}
          </span>
        </Row>
        <Row
          label="Server scan"
          hint={
            scan
              ? scan.scanning
                ? 'A scan is running right now.'
                : `Server reports ${formatCount(scan.count ?? 0, 'track')}${scan.lastScan ? `, last scanned ${new Date(scan.lastScan).toLocaleString()}` : ''}.`
              : 'Scan status is unavailable — your account may not have admin rights.'
          }
        >
          <button className="pill" onClick={() => void refreshScan()}>
            Refresh
          </button>
          <button className="pill" disabled={scan?.scanning} onClick={() => void triggerServerScan()}>
            Start a scan
          </button>
        </Row>
      </Section>

      <Section
        title="Automatic syncing"
        icon={<RefreshCw size={16} />}
        description="Kultr can quietly check for changes while it is open."
      >
        <Row label="Check on startup" hint="Runs an incremental check a few seconds after you connect.">
          <Switch
            checked={settings.autoSyncOnStart}
            onChange={(value) => settings.set('autoSyncOnStart', value)}
            label="Check on startup"
          />
        </Row>
        <Row
          label="Repeat check"
          hint="How often to look for changes while Kultr stays open. Set to 0 to disable."
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
          <span className="value">minutes</span>
        </Row>
        <Row
          label="Include playlist contents"
          hint="Fetches every playlist's track list during a sync. Turn off if you have hundreds of playlists."
        >
          <Switch
            checked={settings.syncPlaylistContents}
            onChange={(value) => settings.set('syncPlaylistContents', value)}
            label="Include playlist contents"
          />
        </Row>
      </Section>

      <AnalysisSection />

      <Section
        title="Local storage"
        icon={<HardDrive size={16} />}
        description="Clearing the mirror does not touch anything on your server — you can always sync again."
      >
        <Row label="Clear the local library" hint="Removes mirrored tracks, albums, artists and playlists.">
          <button className="pill" onClick={() => setConfirmWipe(true)}>
            <Trash2 size={14} />
            Clear
          </button>
        </Row>
      </Section>

      <Modal
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="Clear the local library?"
        footer={
          <>
            <button className="pill" onClick={() => setConfirmWipe(false)}>
              Cancel
            </button>
            <button
              className="pill"
              style={{ color: 'var(--danger)' }}
              onClick={async () => {
                await sync.wipe()
                setConfirmWipe(false)
                useToast.getState().show('Local library cleared.', 'info')
              }}
            >
              Clear it
            </button>
          </>
        }
      >
        <p className="row__hint">
          Your music, playlists and favourites stay safe on Navidrome. You will need to sync again
          before browsing works offline.
        </p>
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

/** Batch AutoMix analysis with progress and cancellation. */
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
      useToast.getState().show('Every track has already been analysed.', 'success')
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
      .show(`Analysed ${succeeded.toLocaleString()} of ${queue.length.toLocaleString()} tracks.`, 'success')
  }

  const percent = total ? done / total : 0

  return (
    <Section
      title="AutoMix analysis"
      icon={<Sparkles size={16} />}
      description="AutoMix needs each track's tempo, key, energy and intro/outro points. Analysis happens automatically for whatever is about to play, but you can do it in bulk so every transition is ready from the first play. Each track is streamed once at a low bitrate; nothing is written to your server."
    >
      <div className="stats" style={{ marginTop: 6 }}>
        <Stat value={analysed} label="Analysed" />
        <Stat value={Math.max(0, library - analysed)} label="Remaining" />
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

      <Row label="Analyse the library" hint="Only the tracks that have not been analysed yet.">
        {running ? (
          <button
            className="pill"
            onClick={() => {
              controller.current?.abort()
              setRunning(false)
            }}
          >
            <X size={14} />
            Stop
          </button>
        ) : (
          <>
            <button className="pill" onClick={() => void start('missing')}>
              Analyse missing
            </button>
            <button className="pill" onClick={() => void start('all')}>
              Re-analyse all
            </button>
          </>
        )}
      </Row>
      <Row label="Clear analysis" hint="Throw the cached tempo and key data away.">
        <button
          className="pill"
          disabled={running}
          onClick={async () => {
            await clearAnalysis()
            await refresh()
            useToast.getState().show('Analysis cache cleared.', 'info')
          }}
        >
          <Trash2 size={14} />
          Clear
        </button>
      </Row>
    </Section>
  )
}
