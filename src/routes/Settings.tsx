import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Blend,
  ChevronDown,
  ChevronUp,
  Code2,
  Download,
  FolderDown,
  HardDrive,
  Pencil,
  Info,
  Keyboard,
  LayoutGrid,
  LogOut,
  Minus,
  Palette,
  Plus,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  User,
  Volume2,
} from 'lucide-react'
import { destroyDatabase } from '@/db'
import {
  clearDownloadFolder,
  pickDownloadFolder,
  supportsFolderDownloads,
} from '@/lib/filesystem'
import { formatBytes } from '@/lib/format'
import { availableHomeTiles, resolveHomeTiles } from '@/lib/homeTiles'
import {
  buildSettingsFile,
  downloadSettingsFile,
  readSettingsFile,
} from '@/lib/settingsFile'
import { useOffline } from '@/store/offline'
import { engine } from '@/audio/engine'
import { isLocalProfile, useAuth } from '@/store/auth'
import { MusicFoldersRows } from '@/components/LocalMusic'
import { WidgetEditor } from '@/components/WidgetEditor'
import { forgetLocalLibrary } from '@/local/db'
import {
  DEFAULT_SETTINGS,
  EQ_BANDS,
  EQ_PRESETS,
  PLAYHEAD_STYLES,
  useSettings,
  type AudioEngineMode,
  type CornerStyle,
  type CrossfadeCurve,
  type SurfaceBorder,
  type GlassLevel,
  type GridSize,
  type OfflineDestination,
  type ReplayGainMode,
  type ThemeMode,
} from '@/store/settings'
import { useToast, useUi } from '@/store/ui'
import { Modal, Row, Section, Segmented, SliderRow, Spinner, Switch } from '@/components/ui'
import { useFlip } from '@/lib/motion'
import { DiscordIcon, RedditIcon } from '@/components/icons'
import { locale, t, type Language } from '@/i18n'

/**
 * A settings section that remembers whether it is open.
 *
 * Keyed by title rather than a separate id: there is exactly one section per
 * title, and renaming one simply means it starts closed again, which is a
 * better trade than threading ids through every call site.
 */
function Panel(props: Parameters<typeof Section>[0]) {
  const open = useSettings((state) => state.openSettingsSections)
  const setSetting = useSettings((state) => state.set)
  const isOpen = open.includes(props.title)
  return (
    <Section
      {...props}
      collapsible
      open={isOpen}
      onToggle={(next) =>
        setSetting(
          'openSettingsSections',
          next ? [...open, props.title] : open.filter((title) => title !== props.title),
        )
      }
    />
  )
}

/** The accent swatches, the same as Kultr for iOS offers. */
const ACCENTS = ['#ff7a3d', '#ffa733', '#f2613f', '#ff6b9a', '#ffd166', '#45d67a', '#2ec4b6', '#4cc9f0', '#7c8cff']

export function Settings() {
  const settings = useSettings()
  const auth = useAuth()
  // The music on this computer has its own panel, and is never exported.
  const servers = auth.profiles.filter((profile) => !isLocalProfile(profile))
  const navigate = useNavigate()
  const setShortcuts = useUi((state) => state.setShortcuts)
  const offline = useOffline()
  const [confirmReset, setConfirmReset] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmServerExport, setConfirmServerExport] = useState(false)
  const toast = useToast()
  const importInput = useRef<HTMLInputElement>(null)

  const importSettings = async (file: File) => {
    try {
      const result = readSettingsFile(JSON.parse(await file.text()))
      settings.merge(result.patch)
      engine.applyEq()
      const added = result.servers.length ? auth.importProfiles(result.servers) : 0
      const extra = result.skipped.length ? t(', %@ skipped', result.skipped.length) : ''
      const servers = added ? t(added === 1 ? ', %@ server added' : ', %@ servers added', added) : ''
      toast.show(t("Imported %@ settings%@%@.", result.applied.length, extra, servers), 'success')
      if (added) {
        toast.show(t("Imported servers need a username and password before they can connect."), 'info', 9000)
      }
    } catch (err) {
      toast.show((err as Error).message || t("That file could not be read."), 'error')
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
          <h1>{t("Settings")}</h1>
          <span className="page-head__sub">{t("Kultr %@", __KULTR_VERSION__)}</span>
        </div>
      </div>

      {/* ------------------------------------------------------ appearance */}
      <Panel title={t("Appearance")} icon={<Palette size={16} />}>
        <Row label={t("Kultr Studio")} hint={t("The whole look in one place: styles to start from, the player's info line, and sharing a style as a link or a file.")}>
          <button className="pill pill-accent" onClick={() => navigate('/studio')}>
            <Palette size={14} />
            {t("Open Studio")}</button>
        </Row>
        <Row label={t("Language")} hint={t("Kultr in English or German. Device follows your browser's language.")}>
          <Segmented<Language>
            value={settings.language}
            onChange={(value) => settings.set('language', value)}
            options={[
              { value: 'system', label: t('Device') },
              { value: 'en', label: 'English' },
              { value: 'de', label: 'Deutsch' },
            ]}
          />
        </Row>
        <Row label={t("Theme")}>
          <Segmented<ThemeMode>
            value={settings.theme}
            onChange={(value) => settings.set('theme', value)}
            options={[
              { value: 'dark', label: t("Dark") },
              { value: 'light', label: t("Light") },
              { value: 'system', label: t("System") },
            ]}
          />
        </Row>
        <Row
          label={t("Night mode")}
          hint={t("Pure black instead of dark grey, for OLED screens: black pixels are switched off, which saves battery and is easiest on the eyes in a dark room. Applies whenever the dark theme is showing, System included. The artwork glow and the blur go with it.")}
        >
          <Switch
            checked={settings.nightMode}
            onChange={(value) => settings.set('nightMode', value)}
            label={t("Night mode")}
          />
        </Row>
        <Row
          label={t("Surface blur")}
          hint={t("Full is the complete effect. Reduced blurs less, and Off removes the blur entirely — pick one of those if scrolling feels heavy on older hardware.")}
        >
          <Segmented<GlassLevel>
            value={settings.glass}
            onChange={(value) => settings.set('glass', value)}
            options={[
              { value: 'liquid', label: t("Full") },
              { value: 'frosted', label: t("Reduced") },
              { value: 'solid', label: t("Off") },
            ]}
          />
        </Row>
        <Row label={t("Corners")} hint={t("How round everything in Kultr is.")}>
          <Segmented<CornerStyle>
            value={settings.corners}
            onChange={(value) => settings.set('corners', value)}
            options={[
              { value: 'sharp', label: t("Sharp") },
              { value: 'soft', label: t("Soft") },
              { value: 'round', label: t("Round") },
            ]}
          />
        </Row>
        <Row label={t("Reduce motion")} hint={t("Stops the spring animations and the movement between pages.")}>
          <Switch
            checked={settings.reduceMotion}
            onChange={(value) => settings.set('reduceMotion', value)}
            label={t("Reduce motion")}
          />
        </Row>
        <Row
          label={t("Colour from artwork")}
          hint={t("Tints the whole interface with the dominant colour of whatever is playing.")}
        >
          <Switch
            checked={settings.accentMode === 'artwork'}
            onChange={(value) => settings.set('accentMode', value ? 'artwork' : 'fixed')}
            label={t("Colour from artwork")}
          />
        </Row>
        <Row
          label={t("Accent colour")}
          hint={
            settings.accentMode === 'artwork'
              ? t("Used on its own when colour from artwork is off, and mixed into the artwork colour below when it is on.")
              : t("Used everywhere: buttons, highlights, the playhead and switches. On cream it is drawn deeper, so it still reads as text there.")
          }
          stack
        >
          <div className="swatches" role="radiogroup" aria-label={t("Accent colour")}>
            {ACCENTS.map((colour) => (
              <button
                key={colour}
                type="button"
                className="swatch"
                role="radio"
                aria-checked={settings.accent.toLowerCase() === colour}
                aria-label={colour}
                title={colour}
                style={{ background: colour }}
                onClick={() => settings.set('accent', colour)}
              />
            ))}
            <input
              type="color"
              className="swatch swatch--custom"
              value={settings.accent}
              aria-label={t("Another colour")}
              title={t("Another colour")}
              onChange={(event) => settings.set('accent', event.target.value)}
            />
          </div>
        </Row>
        {settings.accentMode === 'artwork' ? (
          <Row
            label={t("How much of your colour")}
            hint={t("Your accent laid over the artwork's colour, like an opacity. At 0% the album decides; at 100% you do; in between the interface still moves with the music but stays recognisably yours.")}
            stack
          >
            <SliderRow
              label={t("How much of your colour")}
              min={0}
              max={100}
              step={5}
              value={settings.accentBlend}
              onChange={(value) => settings.set('accentBlend', value)}
              format={(value) => (value === 0 ? 'artwork' : value === 100 ? 'yours' : `${value}% yours`)}
            />
          </Row>
        ) : null}
        <Row
          label={t("Blurred artwork background")}
          hint={t("The cover of what is playing, blurred behind every page and the full player. Off, every page is one flat colour.")}
        >
          <Switch
            checked={settings.backdropArtwork}
            onChange={(value) => settings.set('backdropArtwork', value)}
            label={t("Blurred artwork background")}
          />
        </Row>
        <Row
          label={t("Panel borders")}
          hint={t("Panels, cards and controls are outlined with a hairline. Accent colours it with the accent instead of the text colour.")}
        >
          <Segmented<SurfaceBorder>
            value={settings.surfaceBorder}
            onChange={(value) => settings.set('surfaceBorder', value)}
            options={[
              { value: 'neutral', label: t("Neutral") },
              { value: 'accent', label: t("Accent") },
            ]}
          />
        </Row>
        <Row
          label={t("Border opacity")}
          hint={t("How strongly those outlines are drawn. Low is a whisper on the edge of each panel; high is a definite frame.")}
          stack
        >
          <SliderRow
            label={t("Border opacity")}
            min={0}
            max={100}
            step={5}
            value={settings.borderOpacity}
            onChange={(value) => settings.set('borderOpacity', value)}
            format={(value) => (value === 0 ? 'invisible' : `${value}%`)}
          />
        </Row>
        <Row
          label={t("Panel opacity")}
          hint={t("How much of the background shows through the glass. Below 100% the panels get more transparent, above it they get more solid. Has no effect with surface blur switched off, since those panels are opaque by design.")}
          stack
        >
          <SliderRow
            label={t("Panel opacity")}
            min={20}
            max={200}
            step={10}
            value={settings.surfaceOpacity}
            onChange={(value) => settings.set('surfaceOpacity', value)}
            format={(value) => (value === 100 ? 'default' : `${value}%`)}
          />
        </Row>
        <Row label={t("Grid size")}>
          <Segmented<GridSize>
            value={settings.gridSize}
            onChange={(value) => settings.set('gridSize', value)}
            options={[
              { value: 'small', label: t("Small") },
              { value: 'medium', label: t("Medium") },
              { value: 'large', label: t("Large") },
            ]}
          />
        </Row>
        <Row label={t("Compact track rows")}>
          <Switch
            checked={settings.compactRows}
            onChange={(value) => settings.set('compactRows', value)}
            label={t("Compact track rows")}
          />
        </Row>
        <Row
          label={t("Playhead")}
          hint={t(PLAYHEAD_STYLES.find((style) => style.id === settings.playhead)?.note ?? '')}
          stack
        >
          <div className="playhead-picker">
            {PLAYHEAD_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                className="playhead-option"
                data-selected={settings.playhead === style.id}
                aria-pressed={settings.playhead === style.id}
                onClick={() => settings.set('playhead', style.id)}
              >
                <span className="scrub" data-style={style.id} aria-hidden="true">
                  <span className="scrub__track">
                    <span className="scrub__fill" style={{ width: '62%' }} />
                  </span>
                </span>
                <small>{t(style.name)}</small>
              </button>
            ))}
          </div>
        </Row>
        <Row label={t("Show lyrics tab")}>
          <Switch
            checked={settings.showLyrics}
            onChange={(value) => settings.set('showLyrics', value)}
            label={t("Show lyrics")}
          />
        </Row>
        <Row label={t("Count time down")} hint={t("Shows how much of the track is left instead of how much has played. Clicking the time in the player switches it too.")}>
          <Switch
            checked={settings.timeRemaining}
            onChange={(value) => settings.set('timeRemaining', value)}
            label={t("Count time down")}
          />
        </Row>
      </Panel>

      {/* ------------------------------------------------------- home page */}
      <Panel
        title={t("Home page")}
        icon={<LayoutGrid size={16} />}
        description={t("Which shelves the home page shows, and in what order. A shelf with nothing to put in it is skipped rather than shown empty, so switching one on may change nothing until there is something to fill it.")}
        actions={
          <button
            className="pill"
            onClick={() => settings.set('homeTiles', [...DEFAULT_SETTINGS.homeTiles])}
          >
            {t("Reset to defaults")}</button>
        }
      >
        <WidgetEditor />
        <div className="hairline" style={{ margin: '14px 0' }} />
        <HomeTileEditor
          value={settings.homeTiles}
          onChange={(value) => settings.set('homeTiles', value)}
        />
      </Panel>

      {/* --------------------------------------------------------- playback */}
      <Panel
        title={t("Playback")}
        icon={<Blend size={16} />}
        description={t("What happens between one track and the next, and what playing something does. InjeKt overrides the crossfade numbers when it is switched on and knows both tracks.")}
      >
        <Row label={t("Crossfade between tracks")}>
          <Switch
            checked={settings.crossfadeEnabled}
            onChange={(value) => settings.set('crossfadeEnabled', value)}
            label={t("Crossfade between tracks")}
          />
        </Row>
        <Row
          label={t("Crossfade length")}
          hint={t("How long the two tracks overlap. 0 turns it into a gapless hand-off.")}
          stack
        >
          <SliderRow
            label={t("Crossfade length")}
            min={0}
            max={20}
            step={0.5}
            value={settings.crossfadeSeconds}
            onChange={(value) => settings.set('crossfadeSeconds', value)}
            format={(value) => (value === 0 ? 'off' : `${value.toFixed(1)} s`)}
          />
        </Row>
        <Row
          label={t("Fade shape")}
          hint={t("Equal power keeps the perceived loudness steady through the blend — the usual choice.")}
        >
          <Segmented<CrossfadeCurve>
            value={settings.crossfadeCurve}
            onChange={(value) => settings.set('crossfadeCurve', value)}
            options={[
              { value: 'equalPower', label: t("Equal power") },
              { value: 'linear', label: t("Linear") },
              { value: 'smooth', label: t("Smooth") },
              { value: 'sharp', label: t("Sharp") },
            ]}
          />
        </Row>
        <Row label={t("Also fade when you skip")} hint={t("A short fade instead of a hard cut on next/previous.")}>
          <Switch
            checked={settings.crossfadeOnSkip}
            onChange={(value) => settings.set('crossfadeOnSkip', value)}
            label={t("Fade when skipping")}
          />
        </Row>
        <Row
          label={t("Gapless playback")}
          hint={t("With crossfade off, the next track is preloaded and starts the instant the current one ends.")}
        >
          <Switch
            checked={settings.gapless}
            onChange={(value) => settings.set('gapless', value)}
            label={t("Gapless playback")}
          />
        </Row>
        <Row
          label={t("Karousel")}
          hint={t("When the queue runs out, music like what's been playing keeps coming: similar songs, artists like these and your own favourites. Its songs show under their own heading in Up next, and leave the queue when you turn it off. Tapping the shuffle button twice turns it on too.")}
        >
          <Switch
            checked={settings.injektAutoQueue}
            onChange={(value) => settings.set('injektAutoQueue', value)}
            label={t("Karousel")}
          />
        </Row>
        <Row
          label={t("Wind down before sleep")}
          hint={t("In a sleep timer's last 15 minutes, Karousel and stations play their calmest picks first, so the music settles before it stops.")}
        >
          <Switch
            checked={settings.sleepWindDown}
            onChange={(value) => settings.set('sleepWindDown', value)}
            label={t("Wind down before sleep")}
          />
        </Row>
        <Row label={t("Resume where you left off")} hint={t("Restores the queue and position when Kultr reopens.")}>
          <Switch
            checked={settings.resumeOnStart}
            onChange={(value) => settings.set('resumeOnStart', value)}
            label={t("Resume on start")}
          />
        </Row>
        <Row
          label={t("Send plays to Navidrome")}
          hint={t("Counts each play on your server, so recently and most played are the same on every device and survive clearing this browser. Plays made offline are sent, with their real time, once you are back.")}
        >
          <Switch
            checked={settings.scrobble}
            onChange={(value) => settings.set('scrobble', value)}
            label={t("Scrobble plays")}
          />
        </Row>
      </Panel>

      {/* ---------------------------------------------------------- injekt */}
      <Panel
        title={t("InjeKt")}
        icon={<Sparkles size={16} />}
        description={t("Kultr analyses each track's tempo, key, energy and structure, then mixes like a DJ would: it starts the blend at the outro, beat-matches the incoming track, swaps the basslines over and skips long intros. Everything degrades to a normal crossfade when two tracks simply do not fit.")}
      >
        <Row label={t("Enable InjeKt")}>
          <Switch
            checked={settings.injektEnabled}
            onChange={(value) => settings.set('injektEnabled', value)}
            label={t("Enable InjeKt")}
          />
        </Row>
        <Row
          label={t("Beat-match")}
          hint={t("Time-stretches the two tracks until their beats line up, then eases the new one back to its own tempo.")}
        >
          <Switch
            checked={settings.injektBeatMatch}
            onChange={(value) => settings.set('injektBeatMatch', value)}
            label={t("Beat-match")}
          />
        </Row>
        <Row
          label={t("Meet in the middle")}
          hint={t("Drifts the track you are listening to toward the next one's tempo before the blend starts, instead of making the new track do all the stretching. Because the change is shared, it is half as audible on each side — and pairs that were too far apart to match suddenly are not.")}
        >
          <Switch
            checked={settings.injektTempoRamp}
            onChange={(value) => settings.set('injektTempoRamp', value)}
            label={t("Meet in the middle")}
          />
        </Row>
        <Row
          label={t("Tempo share")}
          hint={t("How much of the gap the current track closes. 0% leaves it alone, 100% makes it travel the whole way to the next track's tempo.")}
          stack
        >
          <SliderRow
            label={t("Tempo share")}
            min={0}
            max={100}
            step={5}
            value={settings.injektTempoBlend}
            onChange={(value) => settings.set('injektTempoBlend', value)}
            format={(value) => `${value}% this track / ${100 - value}% the next`}
          />
        </Row>
        <Row
          label={t("Maximum tempo shift")}
          hint={t("How far either track may be stretched. Above roughly 8% it starts to be audible.")}
          stack
        >
          <SliderRow
            label={t("Maximum tempo shift")}
            min={0}
            max={20}
            step={0.5}
            value={settings.injektMaxTempoShift}
            onChange={(value) => settings.set('injektMaxTempoShift', value)}
            format={(value) => `${value.toFixed(1)} %`}
          />
        </Row>
        <Row label={t("Transition length")} hint={t("In bars of the outgoing track. Shortened automatically when two tracks clash.")} stack>
          <SliderRow
            label={t("Transition length")}
            min={2}
            max={32}
            step={2}
            value={settings.injektBars}
            onChange={(value) => settings.set('injektBars', value)}
            format={(value) => `${value} bars`}
          />
        </Row>
        <Row
          label={t("Bass swap")}
          hint={t("Rolls the outgoing bass off before the incoming bass comes up, so two kick drums never fight. Needs Web Audio mode.")}
        >
          <Switch
            checked={settings.injektBassSwap}
            onChange={(value) => settings.set('injektBassSwap', value)}
            label={t("Bass swap")}
          />
        </Row>
        <Row
          label={t("Harmonic mixing")}
          hint={t("Uses the detected musical key. When two keys clash, the outgoing track is filtered out instead of blended.")}
        >
          <Switch
            checked={settings.injektHarmonic}
            onChange={(value) => settings.set('injektHarmonic', value)}
            label={t("Harmonic mixing")}
          />
        </Row>
        <Row label={t("Skip long intros")} hint={t("Brings the next track in at its first real downbeat.")}>
          <Switch
            checked={settings.injektSkipIntro}
            onChange={(value) => settings.set('injektSkipIntro', value)}
            label={t("Skip long intros")}
          />
        </Row>
        <Row
          label={t("Analyse ahead")}
          hint={t("The current and next track are always analysed the moment a track starts. This also analyses the one after, so skipping ahead lands on a transition that is ready too.")}
        >
          <Switch
            checked={settings.injektAnalyseAhead}
            onChange={(value) => settings.set('injektAnalyseAhead', value)}
            label={t("Analyse ahead")}
          />
        </Row>
      </Panel>

      {/* ------------------------------------------------------------ audio */}
      <Panel
        title={t("Audio")}
        icon={<Volume2 size={16} />}
        description={t("Loudness, and what Kultr asks your server to send.")}
      >
        <Row
          label={t("Volume levelling")}
          hint={t("Uses the ReplayGain tags Navidrome reports so quiet and loud albums play at a similar level.")}
        >
          <Segmented<ReplayGainMode>
            value={settings.replayGainMode}
            onChange={(value) => {
              settings.set('replayGainMode', value)
              engine.refreshGains()
            }}
            options={[
              { value: 'off', label: t("Off") },
              { value: 'track', label: t("Track") },
              { value: 'album', label: t("Album") },
            ]}
          />
        </Row>
        {settings.replayGainMode !== 'off' ? (
          <Row label={t("Pre-amp")} hint={t("Applied on top of the ReplayGain value.")} stack>
            <SliderRow
              label={t("ReplayGain pre-amp")}
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
          label={t("Streaming quality")}
          hint={t("0 means the original file. A lower number asks Navidrome to transcode, which helps on slow connections.")}
        >
          <select
            className="field"
            style={{ width: 150 }}
            value={settings.preferredBitrate}
            onChange={(event) => settings.set('preferredBitrate', Number(event.target.value))}
          >
            <option value={0}>{t("Original")}</option>
            <option value={320}>{t("320 kbps")}</option>
            <option value={256}>{t("256 kbps")}</option>
            <option value={192}>{t("192 kbps")}</option>
            <option value={128}>{t("128 kbps")}</option>
            <option value={96}>{t("96 kbps")}</option>
            <option value={64}>{t("64 kbps")}</option>
          </select>
        </Row>
        <Row
          label={t("Transcode format")}
          hint={t("Leave empty to let the server decide. Useful if your browser cannot play the original format. FLAC stays lossless: FLAC files are sent exactly as they are and anything else is converted, which Navidrome can do out of the box. ALAC needs a transcoding rule adding on the server.")}
        >
          <select
            className="field"
            style={{ width: 150 }}
            value={settings.preferredFormat}
            onChange={(event) => settings.set('preferredFormat', event.target.value)}
          >
            <option value="">{t("Server default")}</option>
            <option value="mp3">{t("MP3")}</option>
            <option value="opus">{t("Opus")}</option>
            <option value="aac">{t("AAC")}</option>
            <option value="flac">{t("FLAC (lossless)")}</option>
            <option value="alac">{t("ALAC (lossless)")}</option>
            <option value="raw">{t("Raw (no transcoding)")}</option>
          </select>
        </Row>
        <Row
          label={t("Audio engine")}
          hint={t("Currently running in %@ mode. Web Audio enables the equaliser and the InjeKt bass swap, but needs the audio to be readable cross-origin. Changing this takes effect after a reload.", engine.mode === 'webaudio' ? 'Web Audio' : t('compatibility'))}
        >
          <Segmented<AudioEngineMode>
            value={settings.audioEngine}
            onChange={(value) => settings.set('audioEngine', value)}
            options={[
              { value: 'auto', label: t("Auto") },
              { value: 'webaudio', label: t("Web Audio") },
              { value: 'element', label: t("Compatibility") },
            ]}
          />
        </Row>
      </Panel>

      {/* ------------------------------------------------------- equaliser */}
      <Panel
        title={t("Equaliser")}
        icon={<SlidersHorizontal size={16} />}
        description={
          engine.mode === 'webaudio'
            ? t("Ten bands of parametric EQ applied to everything Kultr plays.")
            : t("The equaliser needs Web Audio mode, which is unavailable right now — see the note under Audio.")
        }
      >
        <Row label={t("Enable the equaliser")}>
          <Switch
            checked={settings.eqEnabled}
            onChange={(value) => {
              settings.set('eqEnabled', value)
              engine.applyEq()
            }}
            label={t("Enable the equaliser")}
          />
        </Row>
        <Row label={t("Preset")}>
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
                {t(preset)}
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
                aria-label={t("%@ hertz", frequency)}
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

        <Row label={t("Pre-amp")} hint={t("Pull this down if the equaliser makes things clip.")} stack>
          <SliderRow
            label={t("Equaliser pre-amp")}
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
      </Panel>

      {/* --------------------------------------------------------- offline */}
      <Panel
        title={t("Offline")}
        icon={<FolderDown size={16} />}
        description={t("Where “Sync offline” puts the audio. Syncing is incremental — running it again only fetches tracks you do not already have.")}
      >
        <Row
          label={t("Download location")}
          hint={
            settings.offlineDestination === 'folder'
              ? settings.offlineFolderName
                ? t("Saving to “%@”. Files are named Artist - Album - Track, so other players can read them.", settings.offlineFolderName)
                : t("No folder chosen yet — you will be asked the first time you download.")
              : t("Stored inside this browser. Works everywhere, but only Kultr can reach the files and the browser may evict them if space runs short.")
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
                      t("This browser cannot write to a folder. Chrome, Edge and other Chromium browsers can."),
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
              { value: 'browser', label: t("This browser") },
              { value: 'folder', label: t("A folder") },
            ]}
          />
        </Row>

        {settings.offlineDestination === 'folder' ? (
          <Row
            label={t("Folder")}
            hint={t("Browsers only allow writing where you have explicitly pointed the app, so the folder is chosen with a picker rather than typed as a path.")}
          >
            <button
              className="pill"
              onClick={async () => {
                const picked = await pickDownloadFolder().catch(() => null)
                if (picked) settings.merge({ offlineFolderName: picked.name })
              }}
            >
              <FolderDown size={14} />
              {settings.offlineFolderName || t("Choose a folder…")}
            </button>
            {settings.offlineFolderName ? (
              <button
                className="pill"
                aria-label={t("Forget this folder")}
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
          label={t("Parallel downloads")}
          hint={t("How many tracks to fetch at once. Lower it if your server struggles.")}
          stack
        >
          <SliderRow
            label={t("Parallel downloads")}
            min={1}
            max={8}
            step={1}
            value={settings.offlineConcurrency}
            onChange={(value) => settings.set('offlineConcurrency', value)}
            format={(value) => `${value}`}
          />
        </Row>

        <Row
          label={t("Stored right now")}
          hint={t("Manage individual tracks on the Offline page in the sidebar.")}
        >
          <span className="value" style={{ minWidth: 160 }}>
            {t("%@ track(s) · %@", offline.usage.count.toLocaleString(), formatBytes(offline.usage.bytes))}
          </span>
        </Row>
        <Row label={t("Prefer offline copies")} hint={t("Play a downloaded file instead of streaming when one exists.")}>
          <Switch
            checked={settings.offlineFirst}
            onChange={(value) => settings.set('offlineFirst', value)}
            label={t("Prefer offline copies")}
          />
        </Row>
      </Panel>

      {/* ------------------------------------------------ music on this computer */}
      <Panel
        title={t("Music on this computer")}
        icon={<HardDrive size={16} />}
        description={
          isLocalProfile(auth.activeProfile())
            ? t("The folders Kultr builds your library from. Albums come from the tags in the files, covers from the pictures beside them or inside them. Favourites, ratings, playlists and play counts are kept by Kultr on this computer.")
            : t("Use Kultr without a server: add the folders your music is in. Using them switches Kultr from your server to this music; your server stays saved below.")
        }
      >
        <MusicFoldersRows />
      </Panel>

      {/* ---------------------------------------------------------- servers */}
      <Panel
        title={t("Servers")}
        icon={<Server size={16} />}
        description={t("Add as many Navidrome servers as you like. Switching servers swaps the library, queue and downloads for that server's own. Turning one off keeps it in the list without connecting to it.")}
        actions={
          <button
            className="pill pill-accent"
            onClick={() => navigate('/login?add=1')}
          >
            <Plus size={14} />
            {t("Add a server")}</button>
        }
      >
        {servers.length === 0 ? (
          <p className="row__hint">{t("No servers saved yet.")}</p>
        ) : null}

        {servers.map((profile) => {
          const active = profile.id === auth.activeId
          const enabled = profile.enabled !== false
          // Servers restored from an export have no username yet.
          const incomplete = !profile.username
          return (
            <Row
              key={profile.id}
              label={profile.label}
              hint={`${incomplete ? t('No sign-in details yet') : profile.username} · ${
                profile.serverUrl || t('same origin as this page')
              }${active ? t(' · connected') : enabled ? '' : t(' · switched off')}`}
            >
              <Switch
                checked={enabled}
                onChange={(value) => auth.setProfileEnabled(profile.id, value)}
                label={t("Enable %@", profile.label)}
              />
              {active ? (
                <span className="badge" data-tone="success">
                  {t("Active")}</span>
              ) : (
                <button
                  className="pill"
                  disabled={!enabled || incomplete}
                  title={
                    incomplete
                      ? t("Add a username and password first")
                      : enabled
                        ? t("Connect to this server")
                        : t("Switch it on first")
                  }
                  onClick={() => void auth.switchProfile(profile.id)}
                >
                  {t("Connect")}</button>
              )}
              <button
                className="pill pill-icon"
                aria-label={t("Edit %@", profile.label)}
                title={t("Edit this server")}
                onClick={() => setEditing(profile.id)}
              >
                <Pencil size={14} />
              </button>
              <button
                className="pill pill-icon"
                aria-label={t("Forget %@", profile.label)}
                title={t("Forget this server")}
                onClick={() => auth.removeProfile(profile.id)}
              >
                <Trash2 size={14} />
              </button>
            </Row>
          )
        })}

        <Row label={t("Sign out")} hint={t("Forgets the password for this session and returns to the login screen.")}>
          <button
            className="pill"
            onClick={() => {
              auth.logout()
              navigate('/login')
            }}
          >
            <LogOut size={14} />
            {t("Sign out")}</button>
        </Row>
      </Panel>

      {/* -------------------------------------------------------- custom css */}
      <Panel
        title={t("Custom CSS")}
        icon={<Code2 size={16} />}
        description={t("Applied last, so it overrides everything else. Kultr's own class names are not a stable interface — they can change between versions, and a rule that stops matching simply does nothing. Useful variables: --accent-r/g/b, --glass-tint, --glass-edge, --ink, --r-lg.")}
      >
        <Row label={t("Stylesheet")} stack>
          <textarea
            className="codebox"
            spellCheck={false}
            rows={10}
            placeholder={t("/* e.g. a fatter playhead */\n.scrub__track { height: 8px; }")}
            value={settings.customCss}
            aria-label={t("Custom CSS")}
            onChange={(event) => settings.set('customCss', event.target.value)}
          />
        </Row>
        <Row
          label={t("What it can and cannot do")}
          hint={t("CSS cannot read your library or reach your server, so a bad rule can only make the app look wrong — clear the box to undo it. It can, however, load images and fonts from other sites, which tells those sites your IP address. Only paste CSS you are willing to run.")}
        >
          <button
            className="pill"
            disabled={!settings.customCss}
            onClick={() => settings.set('customCss', '')}
          >
            <Trash2 size={14} />
            {t("Clear")}</button>
        </Row>
      </Panel>

      {/* ------------------------------------------------- backup and reset */}
      <Panel
        title={t("Backup and reset")}
        icon={<Download size={16} />}
        description={t("Carry your setup to another browser or machine, or wipe it and start again. A plain export holds your preferences only — no servers, no usernames and no passwords — so it is safe to keep anywhere. Anything specific to this device, like the download folder, stays behind too.")}
      >
        <Row
          label={t("Export settings")}
          hint={t("Saves a small JSON file with everything on this page. Your servers are not in it.")}
        >
          <button
            className="pill"
            onClick={() => {
              const name = downloadSettingsFile(buildSettingsFile(settings, __KULTR_VERSION__))
              toast.show(t("Saved %@.", name), 'success')
            }}
          >
            <Download size={14} />
            {t("Export")}</button>
          <button
            className="pill"
            disabled={servers.length === 0}
            title={
              servers.length === 0
                ? t("No servers saved yet")
                : t("Include the list of servers as well")
            }
            onClick={() => setConfirmServerExport(true)}
          >
            <Server size={14} />
            {t("Export with servers")}</button>
        </Row>
        <Row
          label={t("Import settings")}
          hint={t("Replaces the preferences in the file and leaves everything else as it is. Unknown or credential-shaped entries are ignored.")}
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
            {t("Import")}</button>
        </Row>
        <Row
          label={t("Reset Kultr")}
          hint={t("Deletes the local library mirror, your settings, saved servers, music folders and offline files from this browser. Nothing on your server, and no file on your computer, is touched. Export first if you want any of it back.")}
        >
          <button className="pill" style={{ color: 'var(--danger)' }} onClick={() => setConfirmReset(true)}>
            <Trash2 size={14} />
            {t("Reset everything")}</button>
        </Row>
      </Panel>

      <Panel
        title={t("About")}
        icon={<Info size={16} />}
        description={t("Kultr was vibecoded with Claude Code — designed, written, tested and deployed by prompting Anthropic's CLI rather than by hand. The whole thing, from the tempo detection to the reverse proxy, came out of that conversation.")}
      >
        <Row label={t("Built with")} hint={t("Anthropic's agentic coding tool.")}>
          <a className="pill" href="https://claude.ai/code" target="_blank" rel="noreferrer">
            <Sparkles size={14} />
            {t("Claude Code")}</a>
        </Row>
        <Row label={t("Keyboard shortcuts")} hint={t("Space to play/pause, arrows to seek, and more.")}>
          <Switch
            checked={settings.keyboardShortcuts}
            onChange={(value) => settings.set('keyboardShortcuts', value)}
            label={t("Keyboard shortcuts")}
          />
          <button className="pill" onClick={() => setShortcuts(true)}>
            <Keyboard size={14} />
            {t("View")}</button>
        </Row>
        <Row label={t("Version")} hint={t("What changed in every version, newest first.")}>
          <span className="value" style={{ minWidth: 60 }}>{__KULTR_VERSION__}</span>
          <button className="pill" onClick={() => navigate('/updates')}>
            {t("Update log")}</button>
        </Row>
        <Row label={t("Built")}>
          <span className="value" style={{ minWidth: 160 }}>
            {new Date(__KULTR_BUILD_DATE__).toLocaleString(locale())}
          </span>
        </Row>
        <Row label={t("Source")} hint={t("Issues and pull requests welcome.")}>
          <a className="pill" href="https://github.com/evropiani/Kultr" target="_blank" rel="noreferrer">
            {t("github.com/evropiani/Kultr")}</a>
        </Row>
        <Row label={t("Get in touch")} hint={t("Questions, ideas, or something broken.")} wrap>
          <div className="row__links">
            <a className="pill" href="https://www.reddit.com/r/Kultr/" target="_blank" rel="noreferrer">
              <RedditIcon size={14} />
              {t("r/Kultr")}</a>
            <a
              className="pill"
              href="https://discord.com/users/319246364246540288"
              target="_blank"
              rel="noreferrer"
            >
              <DiscordIcon size={14} />
              {t("@evropiani")}</a>
          </div>
        </Row>
      </Panel>

      <ServerDialog id={editing} onClose={() => setEditing(null)} />

      <Modal
        open={confirmServerExport}
        onClose={() => setConfirmServerExport(false)}
        title={t("Export with servers?")}
        footer={
          <>
            <button className="pill" onClick={() => setConfirmServerExport(false)}>
              {t("Cancel")}</button>
            <button
              className="pill pill-accent"
              onClick={() => {
                const name = downloadSettingsFile(
                  buildSettingsFile(settings, __KULTR_VERSION__, servers),
                )
                setConfirmServerExport(false)
                toast.show(t("Saved %@.", name), 'success')
              }}
            >
              <Download size={14} />
              {t("Export with servers")}</button>
          </>
        }
      >
        <p className="row__hint" style={{ fontSize: 13 }}>
          {t("The file will list the name and address of %@. Usernames and passwords are", servers.length === 1 ? t("your server") : t("each of your %@ servers", servers.length))}{' '}<strong>{t("never")}</strong> {' '}{t("included, so nobody could sign in with it — but the addresses say where your music lives, and for a server reachable from the internet that is worth keeping to yourself.")}</p>
        <p className="row__hint" style={{ fontSize: 13, marginTop: 10 }}>
          <strong>{t("Do not share this file.")}</strong> {' '}{t("Use the plain export if you want something you can pass on or paste into an issue.")}</p>
      </Modal>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t("Reset Kultr?")}
        footer={
          <>
            <button className="pill" onClick={() => setConfirmReset(false)}>
              {t("Cancel")}</button>
            <button
              className="pill"
              style={{ color: 'var(--danger)' }}
              onClick={async () => {
                await destroyDatabase()
                await forgetLocalLibrary()
                localStorage.clear()
                sessionStorage.clear()
                useToast.getState().show(t("Everything cleared. Reloading…"), 'info')
                setTimeout(() => location.reload(), 600)
              }}
            >
              {t("Reset everything")}</button>
          </>
        }
      >
        <p className="row__hint">
          {t("This wipes the local library mirror, your settings, saved servers, offline downloads and InjeKt analysis from this browser, and forgets your music folders with their favourites, ratings, play counts and playlists (music imported into the browser is deleted; folders on your computer are not touched). Nothing on your Navidrome server is touched.")}</p>
      </Modal>
    </div>
  )
}

/* ---------------------------------------------------------------- home page */

/**
 * Pick and order the home-page shelves.
 *
 * The stored value is just the enabled ids in order, so "off" is simply
 * absence — there is no second list to keep in step, and an id from a future
 * version that this build does not know about is dropped on read rather than
 * breaking the page.
 */
function HomeTileEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const enabled = resolveHomeTiles(value)
  const available = availableHomeTiles(value)
  // Moving a shelf slides both rows into their new places, so you can see
  // what swapped with what.
  const listRef = useRef<HTMLOListElement>(null)
  useFlip(listRef, [enabled.map((tile) => tile.id).join(',')])

  const move = (index: number, by: number) => {
    const next = enabled.map((tile) => tile.id)
    const target = index + by
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <>
      {enabled.length === 0 ? (
        <p className="row__hint">
          {t("Every shelf is switched off. The home page will only show the greeting and its two buttons until you add one back.")}</p>
      ) : null}

      <ol className="tiles" ref={listRef}>
        {enabled.map((tile, index) => (
          <li key={tile.id} className="tile" data-flip-key={tile.id}>
            <div className="tile__order">
              <button
                className="iconbtn"
                style={{ width: 26, height: 22 }}
                aria-label={t("Move %@ up", t(tile.title))}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronUp size={15} />
              </button>
              <button
                className="iconbtn"
                style={{ width: 26, height: 22 }}
                aria-label={t("Move %@ down", t(tile.title))}
                disabled={index === enabled.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDown size={15} />
              </button>
            </div>
            <div className="tile__text">
              <span className="row__label">{t(tile.title)}</span>
              <span className="row__hint">{t(tile.note)}</span>
            </div>
            <button
              className="pill pill-icon"
              aria-label={t("Remove %@ from the home page", t(tile.title))}
              title={t("Remove from the home page")}
              onClick={() => onChange(enabled.filter((entry) => entry.id !== tile.id).map((entry) => entry.id))}
            >
              <Minus size={14} />
            </button>
          </li>
        ))}
      </ol>

      {available.length ? (
        <>
          <div className="hairline" style={{ margin: '14px 0 12px' }} />
          <span className="row__label">{t("Not shown")}</span>
          <div className="tiles__add">
            {available.map((tile) => (
              <button
                key={tile.id}
                className="pill"
                title={t(tile.note)}
                onClick={() => onChange([...value, tile.id])}
              >
                <Plus size={13} />
                {t(tile.title)}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ servers */

/**
 * Edit a saved server's connection details.
 *
 * The password box starts empty and a blank one means "leave it alone" — the
 * stored password is never rendered back into the DOM. Changing the address or
 * the username makes this a different server as far as Kultr is concerned, so
 * the dialog says so rather than letting it look like a cosmetic edit.
 */
function ServerDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const auth = useAuth()
  const toast = useToast()
  const profile = auth.profiles.find((entry) => entry.id === id) ?? null

  const [label, setLabel] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [plainAuth, setPlainAuth] = useState(false)
  const [busy, setBusy] = useState(false)

  // Reload the fields whenever a different server is opened.
  useEffect(() => {
    if (!profile) return
    setLabel(profile.label)
    setServerUrl(profile.serverUrl)
    setUsername(profile.username)
    setPassword('')
    setPlainAuth(profile.authMode === 'plain')
  }, [profile?.id])

  if (!profile) return null

  const identityChanged =
    serverUrl.trim().replace(/\/+$/, '') !== profile.serverUrl || username.trim() !== profile.username

  const save = async () => {
    setBusy(true)
    const ok = await auth.updateProfile(profile.id, {
      label,
      serverUrl,
      username,
      password,
      authMode: plainAuth ? 'plain' : 'token',
    })
    setBusy(false)
    if (ok) {
      toast.show(t("%@ saved.", label.trim() || profile.label), 'success')
      onClose()
    } else {
      toast.show(auth.error ?? t("Could not connect with those details."), 'error')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("Edit %@", profile.label)}
      footer={
        <>
          <button className="pill" onClick={onClose}>
            {t("Cancel")}</button>
          <button
            className="pill pill-accent"
            disabled={busy || !username.trim()}
            onClick={() => void save()}
          >
            {busy ? <Spinner /> : null}
            {busy ? t("Saving…") : t("Save")}
          </button>
        </>
      }
    >
      <div className="login__field">
        <label htmlFor="edit-label">{t("Name")}</label>
        <div className="field">
          <Tag size={16} opacity={0.6} />
          <input
            id="edit-label"
            value={label}
            placeholder={profile.serverUrl}
            spellCheck={false}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
      </div>

      <div className="login__field" style={{ marginTop: 12 }}>
        <label htmlFor="edit-url">{t("Server address")}</label>
        <div className="field">
          <Server size={16} opacity={0.6} />
          <input
            id="edit-url"
            value={serverUrl}
            placeholder={t("https://music.example.com")}
            autoComplete="url"
            spellCheck={false}
            onChange={(event) => setServerUrl(event.target.value)}
          />
        </div>
        <span className="login__hint">
          {t("Leave empty if Kultr is served from the same address as Navidrome.")}</span>
      </div>

      <div className="login__field" style={{ marginTop: 12 }}>
        <label htmlFor="edit-user">{t("Username")}</label>
        <div className="field">
          <User size={16} opacity={0.6} />
          <input
            id="edit-user"
            value={username}
            autoComplete="username"
            spellCheck={false}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
      </div>

      <div className="login__field" style={{ marginTop: 12 }}>
        <label htmlFor="edit-pass">
          {t("Password")}{' '}<span className="login__optional">{t("leave empty to keep the current one")}</span>
        </label>
        <div className="field">
          <ShieldCheck size={16} opacity={0.6} />
          <input
            id="edit-pass"
            type="password"
            value={password}
            autoComplete="current-password"
            placeholder={profile.password ? '••••••••' : t("Not set")}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </div>

      <div className="row" style={{ borderTop: 0, paddingBottom: 0 }}>
        <div className="row__text">
          <span className="row__label">{t("Send the password in plain form")}</span>
          <span className="row__hint">
            {t("Only needed if your server has token authentication disabled.")}</span>
        </div>
        <Switch checked={plainAuth} onChange={setPlainAuth} label={t("Plain password")} />
      </div>

      {identityChanged ? (
        <p className="row__hint" style={{ marginTop: 4 }}>
          {t("Changing the address or the username points this entry at a different account, so Kultr treats it as a different server. The local library mirror is replaced the next time you sync.")}</p>
      ) : null}
    </Modal>
  )
}
