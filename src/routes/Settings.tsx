import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Blend,
  Download,
  FolderDown,
  Gauge,
  Pencil,
  Info,
  Keyboard,
  LogOut,
  Palette,
  Plus,
  Server,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Trash2,
  Volume2,
} from 'lucide-react'
import { destroyDatabase } from '@/db'
import {
  clearDownloadFolder,
  pickDownloadFolder,
  supportsFolderDownloads,
} from '@/lib/filesystem'
import { formatBytes } from '@/lib/format'
import {
  buildSettingsFile,
  downloadSettingsFile,
  readSettingsFile,
} from '@/lib/settingsFile'
import { useOffline } from '@/store/offline'
import { engine } from '@/audio/engine'
import { useAuth } from '@/store/auth'
import {
  EQ_BANDS,
  EQ_PRESETS,
  useSettings,
  type AudioEngineMode,
  type CrossfadeCurve,
  type GlassLevel,
  type GridSize,
  type OfflineDestination,
  type ReplayGainMode,
  type ThemeMode,
} from '@/store/settings'
import { useToast, useUi } from '@/store/ui'
import { Modal, Row, Section, Segmented, SliderRow, Switch } from '@/components/ui'

export function Settings() {
  const settings = useSettings()
  const auth = useAuth()
  const navigate = useNavigate()
  const setShortcuts = useUi((state) => state.setShortcuts)
  const offline = useOffline()
  const [confirmReset, setConfirmReset] = useState(false)
  const toast = useToast()
  const importInput = useRef<HTMLInputElement>(null)

  const importSettings = async (file: File) => {
    try {
      const result = readSettingsFile(JSON.parse(await file.text()))
      settings.merge(result.patch)
      engine.applyEq()
      const extra = result.skipped.length ? `, ${result.skipped.length} skipped` : ''
      toast.show(`Imported ${result.applied.length} settings${extra}.`, 'success')
    } catch (err) {
      toast.show((err as Error).message || 'That file could not be read.', 'error')
    }
  }

  useEffect(() => {
    void offline.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="settings">
      <div className="page-head">
        <div className="page-head__title">
          <h1>Settings</h1>
          <span className="page-head__sub">Kultr {__KULTR_VERSION__}</span>
        </div>
      </div>

      {/* ------------------------------------------------------ appearance */}
      <Section title="Appearance" icon={<Palette size={16} />}>
        <Row label="Theme">
          <Segmented<ThemeMode>
            value={settings.theme}
            onChange={(value) => settings.set('theme', value)}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
        </Row>
        <Row
          label="Surface blur"
          hint="Full is the complete effect. Reduced blurs less, and Off removes the blur entirely — pick one of those if scrolling feels heavy on older hardware."
        >
          <Segmented<GlassLevel>
            value={settings.glass}
            onChange={(value) => settings.set('glass', value)}
            options={[
              { value: 'liquid', label: 'Full' },
              { value: 'frosted', label: 'Reduced' },
              { value: 'solid', label: 'Off' },
            ]}
          />
        </Row>
        <Row
          label="Colour from artwork"
          hint="Tints the whole interface with the dominant colour of whatever is playing."
        >
          <Switch
            checked={settings.accentMode === 'artwork'}
            onChange={(value) => settings.set('accentMode', value ? 'artwork' : 'fixed')}
            label="Colour from artwork"
          />
        </Row>
        {settings.accentMode === 'fixed' ? (
          <Row label="Accent colour">
            <input
              type="color"
              value={settings.accent}
              aria-label="Accent colour"
              style={{ width: 48, height: 32, border: 0, background: 'none' }}
              onChange={(event) => settings.set('accent', event.target.value)}
            />
          </Row>
        ) : null}
        <Row label="Blurred artwork background">
          <Switch
            checked={settings.backdropArtwork}
            onChange={(value) => settings.set('backdropArtwork', value)}
            label="Blurred artwork background"
          />
        </Row>
        <Row label="Reduce motion" hint="Stops the drifting background and spring animations.">
          <Switch
            checked={settings.reduceMotion}
            onChange={(value) => settings.set('reduceMotion', value)}
            label="Reduce motion"
          />
        </Row>
        <Row label="Grid size">
          <Segmented<GridSize>
            value={settings.gridSize}
            onChange={(value) => settings.set('gridSize', value)}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ]}
          />
        </Row>
        <Row label="Compact track rows">
          <Switch
            checked={settings.compactRows}
            onChange={(value) => settings.set('compactRows', value)}
            label="Compact track rows"
          />
        </Row>
      </Section>

      {/* -------------------------------------------------------- crossfade */}
      <Section
        title="Crossfade"
        icon={<Blend size={16} />}
        description="Overlap the end of one track with the start of the next. InjeKt overrides these numbers when it is switched on and knows both tracks."
      >
        <Row label="Crossfade between tracks">
          <Switch
            checked={settings.crossfadeEnabled}
            onChange={(value) => settings.set('crossfadeEnabled', value)}
            label="Crossfade between tracks"
          />
        </Row>
        <Row
          label="Crossfade length"
          hint="How long the two tracks overlap. 0 turns it into a gapless hand-off."
          stack
        >
          <SliderRow
            label="Crossfade length"
            min={0}
            max={20}
            step={0.5}
            value={settings.crossfadeSeconds}
            onChange={(value) => settings.set('crossfadeSeconds', value)}
            format={(value) => (value === 0 ? 'off' : `${value.toFixed(1)} s`)}
          />
        </Row>
        <Row
          label="Fade shape"
          hint="Equal power keeps the perceived loudness steady through the blend — the usual choice."
        >
          <Segmented<CrossfadeCurve>
            value={settings.crossfadeCurve}
            onChange={(value) => settings.set('crossfadeCurve', value)}
            options={[
              { value: 'equalPower', label: 'Equal power' },
              { value: 'linear', label: 'Linear' },
              { value: 'smooth', label: 'Smooth' },
              { value: 'sharp', label: 'Sharp' },
            ]}
          />
        </Row>
        <Row label="Also fade when you skip" hint="A short fade instead of a hard cut on next/previous.">
          <Switch
            checked={settings.crossfadeOnSkip}
            onChange={(value) => settings.set('crossfadeOnSkip', value)}
            label="Fade when skipping"
          />
        </Row>
        <Row
          label="Gapless playback"
          hint="With crossfade off, the next track is preloaded and starts the instant the current one ends."
        >
          <Switch
            checked={settings.gapless}
            onChange={(value) => settings.set('gapless', value)}
            label="Gapless playback"
          />
        </Row>
      </Section>

      {/* ---------------------------------------------------------- injekt */}
      <Section
        title="InjeKt"
        icon={<Sparkles size={16} />}
        description="Kultr analyses each track's tempo, key, energy and structure, then mixes like a DJ would: it starts the blend at the outro, beat-matches the incoming track, swaps the basslines over and skips long intros. Everything degrades to a normal crossfade when two tracks simply do not fit."
      >
        <Row label="Enable InjeKt">
          <Switch
            checked={settings.injektEnabled}
            onChange={(value) => settings.set('injektEnabled', value)}
            label="Enable InjeKt"
          />
        </Row>
        <Row
          label="Beat-match"
          hint="Time-stretches the two tracks until their beats line up, then eases the new one back to its own tempo."
        >
          <Switch
            checked={settings.injektBeatMatch}
            onChange={(value) => settings.set('injektBeatMatch', value)}
            label="Beat-match"
          />
        </Row>
        <Row
          label="Meet in the middle"
          hint="Drifts the track you are listening to toward the next one's tempo before the blend starts, instead of making the new track do all the stretching. Because the change is shared, it is half as audible on each side — and pairs that were too far apart to match suddenly are not."
        >
          <Switch
            checked={settings.injektTempoRamp}
            onChange={(value) => settings.set('injektTempoRamp', value)}
            label="Meet in the middle"
          />
        </Row>
        <Row
          label="Tempo share"
          hint="How much of the gap the current track closes. 0% leaves it alone, 100% makes it travel the whole way to the next track's tempo."
          stack
        >
          <SliderRow
            label="Tempo share"
            min={0}
            max={100}
            step={5}
            value={settings.injektTempoBlend}
            onChange={(value) => settings.set('injektTempoBlend', value)}
            format={(value) => `${value}% this track / ${100 - value}% the next`}
          />
        </Row>
        <Row
          label="Maximum tempo shift"
          hint="How far either track may be stretched. Above roughly 8% it starts to be audible."
          stack
        >
          <SliderRow
            label="Maximum tempo shift"
            min={0}
            max={20}
            step={0.5}
            value={settings.injektMaxTempoShift}
            onChange={(value) => settings.set('injektMaxTempoShift', value)}
            format={(value) => `${value.toFixed(1)} %`}
          />
        </Row>
        <Row label="Transition length" hint="In bars of the outgoing track. Shortened automatically when two tracks clash." stack>
          <SliderRow
            label="Transition length"
            min={2}
            max={32}
            step={2}
            value={settings.injektBars}
            onChange={(value) => settings.set('injektBars', value)}
            format={(value) => `${value} bars`}
          />
        </Row>
        <Row
          label="Bass swap"
          hint="Rolls the outgoing bass off before the incoming bass comes up, so two kick drums never fight. Needs Web Audio mode."
        >
          <Switch
            checked={settings.injektBassSwap}
            onChange={(value) => settings.set('injektBassSwap', value)}
            label="Bass swap"
          />
        </Row>
        <Row
          label="Harmonic mixing"
          hint="Uses the detected musical key. When two keys clash, the outgoing track is filtered out instead of blended."
        >
          <Switch
            checked={settings.injektHarmonic}
            onChange={(value) => settings.set('injektHarmonic', value)}
            label="Harmonic mixing"
          />
        </Row>
        <Row label="Skip long intros" hint="Brings the next track in at its first real downbeat.">
          <Switch
            checked={settings.injektSkipIntro}
            onChange={(value) => settings.set('injektSkipIntro', value)}
            label="Skip long intros"
          />
        </Row>
        <Row
          label="Keep playing similar music"
          hint="When the queue runs out, Kultr continues with tracks that match the current one by tempo, key and energy."
        >
          <Switch
            checked={settings.injektAutoQueue}
            onChange={(value) => settings.set('injektAutoQueue', value)}
            label="Keep playing similar music"
          />
        </Row>
        <Row
          label="Analyse ahead"
          hint="Analyses the next track while the current one plays, so the first transition is already ready."
        >
          <Switch
            checked={settings.injektAnalyseAhead}
            onChange={(value) => settings.set('injektAnalyseAhead', value)}
            label="Analyse ahead"
          />
        </Row>
      </Section>

      {/* ------------------------------------------------------------ audio */}
      <Section title="Audio" icon={<Volume2 size={16} />}>
        <Row
          label="Volume levelling"
          hint="Uses the ReplayGain tags Navidrome reports so quiet and loud albums play at a similar level."
        >
          <Segmented<ReplayGainMode>
            value={settings.replayGainMode}
            onChange={(value) => {
              settings.set('replayGainMode', value)
              engine.refreshGains()
            }}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'track', label: 'Track' },
              { value: 'album', label: 'Album' },
            ]}
          />
        </Row>
        {settings.replayGainMode !== 'off' ? (
          <Row label="Pre-amp" hint="Applied on top of the ReplayGain value." stack>
            <SliderRow
              label="ReplayGain pre-amp"
              min={-12}
              max={12}
              step={0.5}
              value={settings.replayGainPreamp}
              onChange={(value) => {
                settings.set('replayGainPreamp', value)
                engine.refreshGains()
              }}
              format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`}
            />
          </Row>
        ) : null}
        <Row
          label="Streaming quality"
          hint="0 means the original file. A lower number asks Navidrome to transcode, which helps on slow connections."
        >
          <select
            className="field"
            style={{ width: 150 }}
            value={settings.preferredBitrate}
            onChange={(event) => settings.set('preferredBitrate', Number(event.target.value))}
          >
            <option value={0}>Original</option>
            <option value={320}>320 kbps</option>
            <option value={256}>256 kbps</option>
            <option value={192}>192 kbps</option>
            <option value={128}>128 kbps</option>
            <option value={96}>96 kbps</option>
            <option value={64}>64 kbps</option>
          </select>
        </Row>
        <Row
          label="Transcode format"
          hint="Leave empty to let the server decide. Useful if your browser cannot play the original format. FLAC and ALAC stay lossless, so they are large — and your server has to be set up to produce them."
        >
          <select
            className="field"
            style={{ width: 150 }}
            value={settings.preferredFormat}
            onChange={(event) => settings.set('preferredFormat', event.target.value)}
          >
            <option value="">Server default</option>
            <option value="mp3">MP3</option>
            <option value="opus">Opus</option>
            <option value="aac">AAC</option>
            <option value="flac">FLAC (lossless)</option>
            <option value="alac">ALAC (lossless)</option>
            <option value="raw">Raw (no transcoding)</option>
          </select>
        </Row>
        <Row
          label="Audio engine"
          hint={`Currently running in ${engine.mode === 'webaudio' ? 'Web Audio' : 'compatibility'} mode. Web Audio enables the equaliser, visualizer and the InjeKt bass swap, but needs the audio to be readable cross-origin. Changing this takes effect after a reload.`}
        >
          <Segmented<AudioEngineMode>
            value={settings.audioEngine}
            onChange={(value) => settings.set('audioEngine', value)}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'webaudio', label: 'Web Audio' },
              { value: 'element', label: 'Compatibility' },
            ]}
          />
        </Row>
        <Row label="Scrobble plays" hint="Tells Navidrome what you listened to, which feeds its own statistics.">
          <Switch
            checked={settings.scrobble}
            onChange={(value) => settings.set('scrobble', value)}
            label="Scrobble plays"
          />
        </Row>
        <Row label="Resume where you left off" hint="Restores the queue and position when Kultr reopens.">
          <Switch
            checked={settings.resumeOnStart}
            onChange={(value) => settings.set('resumeOnStart', value)}
            label="Resume on start"
          />
        </Row>
      </Section>

      {/* ------------------------------------------------------- equaliser */}
      <Section
        title="Equaliser"
        icon={<SlidersHorizontal size={16} />}
        description={
          engine.mode === 'webaudio'
            ? 'Ten bands of parametric EQ applied to everything Kultr plays.'
            : 'The equaliser needs Web Audio mode, which is unavailable right now — see the note under Audio.'
        }
      >
        <Row label="Enable the equaliser">
          <Switch
            checked={settings.eqEnabled}
            onChange={(value) => {
              settings.set('eqEnabled', value)
              engine.applyEq()
            }}
            label="Enable the equaliser"
          />
        </Row>
        <Row label="Preset">
          <select
            className="field"
            style={{ width: 170 }}
            value={settings.eqPreset}
            onChange={(event) => {
              settings.applyEqPreset(event.target.value)
              engine.applyEq()
            }}
          >
            {Object.keys(EQ_PRESETS).map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </Row>

        <div className="eq">
          {EQ_BANDS.map((frequency, index) => (
            <div className="eq__band" key={frequency}>
              <span className="eq__gain">
                {settings.eqGains[index] > 0 ? '+' : ''}
                {(settings.eqGains[index] ?? 0).toFixed(0)}
              </span>
              <input
                className="eq__slider"
                type="range"
                min={-12}
                max={12}
                step={1}
                value={settings.eqGains[index] ?? 0}
                aria-label={`${frequency} hertz`}
                disabled={!settings.eqEnabled}
                onChange={(event) => {
                  const gains = [...settings.eqGains]
                  gains[index] = Number(event.target.value)
                  settings.merge({ eqGains: gains, eqPreset: 'Custom' })
                  engine.applyEq()
                }}
              />
              <span className="eq__label">
                {frequency >= 1000 ? `${frequency / 1000}k` : frequency}
              </span>
            </div>
          ))}
        </div>

        <Row label="Pre-amp" hint="Pull this down if the equaliser makes things clip." stack>
          <SliderRow
            label="Equaliser pre-amp"
            min={-12}
            max={6}
            step={0.5}
            value={settings.eqPreamp}
            onChange={(value) => {
              settings.set('eqPreamp', value)
              engine.applyEq()
            }}
            format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`}
          />
        </Row>
      </Section>


      {/* --------------------------------------------------------- offline */}
      <Section
        title="Offline"
        icon={<FolderDown size={16} />}
        description="Where “Sync offline” puts the audio. Syncing is incremental — running it again only fetches tracks you do not already have."
      >
        <Row
          label="Download location"
          hint={
            settings.offlineDestination === 'folder'
              ? settings.offlineFolderName
                ? `Saving to “${settings.offlineFolderName}”. Files are named Artist - Album - Track, so other players can read them.`
                : 'No folder chosen yet — you will be asked the first time you download.'
              : 'Stored inside this browser. Works everywhere, but only Kultr can reach the files and the browser may evict them if space runs short.'
          }
        >
          <Segmented<OfflineDestination>
            value={settings.offlineDestination}
            onChange={async (value) => {
              if (value === 'folder') {
                if (!supportsFolderDownloads()) {
                  useToast
                    .getState()
                    .show(
                      'This browser cannot write to a folder. Chrome, Edge and other Chromium browsers can.',
                      'warning',
                    )
                  return
                }
                const picked = await pickDownloadFolder().catch(() => null)
                if (!picked) return
                settings.merge({
                  offlineDestination: 'folder',
                  offlineFolderName: picked.name,
                  offlineDestinationChosen: true,
                })
              } else {
                settings.merge({ offlineDestination: 'browser', offlineDestinationChosen: true })
              }
            }}
            options={[
              { value: 'browser', label: 'This browser' },
              { value: 'folder', label: 'A folder' },
            ]}
          />
        </Row>

        {settings.offlineDestination === 'folder' ? (
          <Row
            label="Folder"
            hint="Browsers only allow writing where you have explicitly pointed the app, so the folder is chosen with a picker rather than typed as a path."
          >
            <button
              className="pill"
              onClick={async () => {
                const picked = await pickDownloadFolder().catch(() => null)
                if (picked) settings.merge({ offlineFolderName: picked.name })
              }}
            >
              <FolderDown size={14} />
              {settings.offlineFolderName || 'Choose a folder…'}
            </button>
            {settings.offlineFolderName ? (
              <button
                className="pill"
                aria-label="Forget this folder"
                onClick={async () => {
                  await clearDownloadFolder()
                  settings.merge({ offlineFolderName: '' })
                }}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </Row>
        ) : null}

        <Row
          label="Parallel downloads"
          hint="How many tracks to fetch at once. Lower it if your server struggles."
          stack
        >
          <SliderRow
            label="Parallel downloads"
            min={1}
            max={8}
            step={1}
            value={settings.offlineConcurrency}
            onChange={(value) => settings.set('offlineConcurrency', value)}
            format={(value) => `${value}`}
          />
        </Row>

        <Row
          label="Stored right now"
          hint="Manage individual tracks on the Offline page in the sidebar."
        >
          <span className="value" style={{ minWidth: 160 }}>
            {offline.usage.count.toLocaleString()} track(s) · {formatBytes(offline.usage.bytes)}
          </span>
        </Row>
        <Row label="Prefer offline copies" hint="Play a downloaded file instead of streaming when one exists.">
          <Switch
            checked={settings.offlineFirst}
            onChange={(value) => settings.set('offlineFirst', value)}
            label="Prefer offline copies"
          />
        </Row>
      </Section>

      {/* ------------------------------------------------------- interface */}
      <Section title="Interface" icon={<Gauge size={16} />}>
        <Row label="Show lyrics tab">
          <Switch
            checked={settings.showLyrics}
            onChange={(value) => settings.set('showLyrics', value)}
            label="Show lyrics"
          />
        </Row>
        <Row label="Show visualizer tab">
          <Switch
            checked={settings.showVisualizer}
            onChange={(value) => settings.set('showVisualizer', value)}
            label="Show visualizer"
          />
        </Row>
        <Row label="Keyboard shortcuts" hint="Space to play/pause, arrows to seek, and more.">
          <Switch
            checked={settings.keyboardShortcuts}
            onChange={(value) => settings.set('keyboardShortcuts', value)}
            label="Keyboard shortcuts"
          />
          <button className="pill" onClick={() => setShortcuts(true)}>
            <Keyboard size={14} />
            View
          </button>
        </Row>
      </Section>

      {/* ---------------------------------------------------------- backup */}
      <Section
        title="Backup"
        icon={<Download size={16} />}
        description="Carry your setup to another browser or machine. The file holds your preferences only — no servers, no usernames and no passwords, so it is safe to keep anywhere. Anything specific to this device, like the download folder, stays behind too."
      >
        <Row
          label="Export settings"
          hint="Saves a small JSON file with everything in this page except your servers."
        >
          <button
            className="pill"
            onClick={() => {
              const name = downloadSettingsFile(buildSettingsFile(settings, __KULTR_VERSION__))
              toast.show(`Saved ${name}.`, 'success')
            }}
          >
            <Download size={14} />
            Export
          </button>
        </Row>
        <Row
          label="Import settings"
          hint="Replaces the preferences in the file and leaves everything else as it is. Unknown or credential-shaped entries are ignored."
        >
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void importSettings(file)
            }}
          />
          <button className="pill" onClick={() => importInput.current?.click()}>
            <Upload size={14} />
            Import
          </button>
        </Row>
      </Section>

      {/* --------------------------------------------------------- account */}
      <Section
        title="Servers"
        icon={<Server size={16} />}
        description="Add as many Navidrome servers as you like. Switching servers swaps the library, queue and downloads for that server's own. Turning one off keeps it in the list without connecting to it."
        actions={
          <button
            className="pill pill-accent"
            onClick={() => navigate('/login?add=1')}
          >
            <Plus size={14} />
            Add a server
          </button>
        }
      >
        {auth.profiles.length === 0 ? (
          <p className="row__hint">No servers saved yet.</p>
        ) : null}

        {auth.profiles.map((profile) => {
          const active = profile.id === auth.activeId
          const enabled = profile.enabled !== false
          return (
            <Row
              key={profile.id}
              label={profile.label}
              hint={`${profile.username} · ${profile.serverUrl || 'same origin as this page'}${
                active ? ' · connected' : enabled ? '' : ' · switched off'
              }`}
            >
              <Switch
                checked={enabled}
                onChange={(value) => auth.setProfileEnabled(profile.id, value)}
                label={`Enable ${profile.label}`}
              />
              {active ? (
                <span className="badge" data-tone="success">
                  Active
                </span>
              ) : (
                <button
                  className="pill"
                  disabled={!enabled}
                  title={enabled ? 'Connect to this server' : 'Switch it on first'}
                  onClick={() => void auth.switchProfile(profile.id)}
                >
                  Connect
                </button>
              )}
              <button
                className="pill pill-icon"
                aria-label={`Rename ${profile.label}`}
                title="Rename"
                onClick={() => {
                  const next = window.prompt('Name for this server', profile.label)
                  if (next !== null) auth.renameProfile(profile.id, next)
                }}
              >
                <Pencil size={14} />
              </button>
              <button
                className="pill pill-icon"
                aria-label={`Forget ${profile.label}`}
                title="Forget this server"
                onClick={() => auth.removeProfile(profile.id)}
              >
                <Trash2 size={14} />
              </button>
            </Row>
          )
        })}

        <Row label="Sign out" hint="Forgets the password for this session and returns to the login screen.">
          <button
            className="pill"
            onClick={() => {
              auth.logout()
              navigate('/login')
            }}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </Row>
        <Row label="Reset Kultr" hint="Deletes the local database, settings and offline files.">
          <button className="pill" style={{ color: 'var(--danger)' }} onClick={() => setConfirmReset(true)}>
            <Trash2 size={14} />
            Reset everything
          </button>
        </Row>
      </Section>

      <Section
        title="About"
        icon={<Info size={16} />}
        description="Kultr was vibecoded with Claude Code — designed, written, tested and deployed by prompting Anthropic's CLI rather than by hand. The whole thing, from the tempo detection to the reverse proxy, came out of that conversation."
      >
        <Row label="Built with" hint="Anthropic's agentic coding tool.">
          <a className="pill" href="https://claude.ai/code" target="_blank" rel="noreferrer">
            <Sparkles size={14} />
            Claude Code
          </a>
        </Row>
        <Row label="Version">
          <span className="value" style={{ minWidth: 120 }}>{__KULTR_VERSION__}</span>
        </Row>
        <Row label="Built">
          <span className="value" style={{ minWidth: 160 }}>
            {new Date(__KULTR_BUILD_DATE__).toLocaleString()}
          </span>
        </Row>
        <Row label="Source" hint="Issues and pull requests welcome.">
          <a className="pill" href="https://github.com/evropiani/Kultr" target="_blank" rel="noreferrer">
            github.com/evropiani/Kultr
          </a>
        </Row>
      </Section>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset Kultr?"
        footer={
          <>
            <button className="pill" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <button
              className="pill"
              style={{ color: 'var(--danger)' }}
              onClick={async () => {
                await destroyDatabase()
                localStorage.clear()
                sessionStorage.clear()
                useToast.getState().show('Everything cleared. Reloading…', 'info')
                setTimeout(() => location.reload(), 600)
              }}
            >
              Reset everything
            </button>
          </>
        }
      >
        <p className="row__hint">
          This wipes the local library mirror, your settings, saved servers, offline downloads and
          InjeKt analysis from this browser. Nothing on your Navidrome server is touched.
        </p>
      </Modal>
    </div>
  )
}
