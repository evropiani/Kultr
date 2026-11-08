import { useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, Link2, Upload } from 'lucide-react'
import { renderTemplate, readStyle, styleFrom, styleLink, styleMatches, stylePatch, studioPresets, TEMPLATE_FIELDS, type StudioStyle } from '@/lib/studio'
import { DEFAULT_SETTINGS, useSettings, type PlayheadStyle } from '@/store/settings'
import { useToast } from '@/store/ui'
import { Row, Segmented, Switch } from '@/components/ui'
import { t } from '@/i18n'

const ACCENTS = ['#ff7a3d', '#ffa733', '#f2613f', '#ff6b9a', '#ffd166', '#45d67a', '#2ec4b6', '#4cc9f0', '#7c8cff']
const PLAYHEADS: { value: PlayheadStyle; label: string }[] = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'glow', label: 'Glow' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'wave', label: 'Wave' },
  { value: 'comet', label: 'Comet' },
  { value: 'equalizer', label: 'Equaliser' },
]

/**
 * Kultr Studio: the whole look in one place. Start from Cream, Night, Ember,
 * Paper or Console, change colours, corners, the playhead and the player's
 * info line, and share the result as a link or a file — the same styles as
 * Kultr for iOS and Android, so one made there works here.
 */
export function Studio() {
  const settings = useSettings()
  const toast = useToast()
  const presets = useMemo(() => studioPresets(DEFAULT_SETTINGS), [])
  const current = styleFrom(settings, 'My style')
  const [incoming, setIncoming] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const apply = (style: StudioStyle) => {
    settings.merge(stylePatch(style))
    toast.show(t("%@ applied. Everything else stays as it was.", t(style.name)), 'success')
  }
  const open = (text: string) => {
    const style = readStyle(text, current)
    if (!style) {
      toast.show(t("That is not a Kultr style. A style is a kultr://style/… link or a .kultrstyle file."), 'error')
      return
    }
    apply(style)
    setIncoming('')
  }
  const preview = renderTemplate(settings.factsTemplate || '{year}{?genre: · {genre}}{?format: · {format}}{?bitrate: · {bitrate} kbps}', Object.fromEntries(TEMPLATE_FIELDS))

  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>{t("Kultr Studio")}</h1>
          <span className="page-head__sub">
            {t("The whole look in one place. Start from a style, change it, and share it as a link or a file — it opens in Kultr on the iPhone and Android too.")}</span>
        </div>
      </div>

      <div className="studio-presets">
        {presets.map((style) => {
          const on = styleMatches(style, settings)
          const dark = style.theme === 'dark' || (style.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
          const bg = style.nightMode && dark ? '#000' : dark ? '#1c1a17' : '#f6f0e5'
          const panel = style.nightMode && dark ? '#0e0d0b' : dark ? '#26231f' : '#fffcf6'
          const radius = style.corners === 'sharp' ? 3 : style.corners === 'round' ? 14 : 8
          return (
            <button key={style.name} className="studio-preset glass" data-on={on || undefined} onClick={() => apply(style)}>
              <span className="studio-preset__sample" style={{ background: bg, borderRadius: radius + 4 }}>
                <span style={{ background: panel, borderRadius: radius }} />
                <span style={{ background: style.accentMode === 'artwork' ? 'linear-gradient(135deg,#e85d75,#6a5cff)' : style.accent, borderRadius: 999 }} />
              </span>
              <strong>
                {t(style.name)} {on ? <Check size={13} /> : null}
              </strong>
            </button>
          )
        })}
      </div>

      <section className="section glass" style={{ marginBottom: 16 }}>
        <div className="section__head">
          <h3>{t("Colours and shape")}</h3>
        </div>
        <Row label={t("Theme")}>
          <Segmented
            value={settings.theme}
            options={[
              { value: 'system', label: t("Device") },
              { value: 'light', label: t("Light") },
              { value: 'dark', label: t("Dark") },
            ]}
            onChange={(value) => settings.set('theme', value)}
          />
        </Row>
        <Row label={t("Night mode")} hint={t("The dark theme in pure black, for OLED screens.")}>
          <Switch checked={settings.nightMode} onChange={(value) => settings.set('nightMode', value)} label={t("Night mode")} />
        </Row>
        <Row label={t("Accent")} wrap>
          <div className="chip-row">
            <button className="chip" data-on={settings.accentMode === 'artwork' || undefined} onClick={() => settings.set('accentMode', settings.accentMode === 'artwork' ? 'fixed' : 'artwork')}>
              {t("From the artwork")}</button>
            {ACCENTS.map((colour) => (
              <button
                key={colour}
                className="studio-swatch"
                aria-label={t("Accent %@", colour)}
                data-on={(settings.accentMode === 'fixed' && settings.accent.toLowerCase() === colour) || undefined}
                style={{ background: colour }}
                onClick={() => settings.merge({ accentMode: 'fixed', accent: colour })}
              />
            ))}
            <input type="color" aria-label={t("Any colour")} value={settings.accent} onChange={(event) => settings.merge({ accentMode: 'fixed', accent: event.target.value })} />
          </div>
        </Row>
        <Row label={t("Corners")}>
          <Segmented
            value={settings.corners}
            options={[
              { value: 'sharp', label: t("Sharp") },
              { value: 'soft', label: t("Soft") },
              { value: 'round', label: t("Round") },
            ]}
            onChange={(value) => settings.set('corners', value)}
          />
        </Row>
        <Row label={t("Covers")}>
          <Segmented
            value={settings.gridSize}
            options={[
              { value: 'small', label: t("Small") },
              { value: 'medium', label: t("Medium") },
              { value: 'large', label: t("Large") },
            ]}
            onChange={(value) => settings.set('gridSize', value)}
          />
        </Row>
        <Row label={t("Compact rows")}>
          <Switch checked={settings.compactRows} onChange={(value) => settings.set('compactRows', value)} label={t("Compact rows")} />
        </Row>
        <Row label={t("The cover behind every page")}>
          <Switch checked={settings.backdropArtwork} onChange={(value) => settings.set('backdropArtwork', value)} label={t("Cover behind pages")} />
        </Row>
        <Row label={t("Playhead")}>
          <select className="field-input" style={{ width: 'auto' }} value={settings.playhead} onChange={(event) => settings.set('playhead', event.target.value as PlayheadStyle)}>
            {PLAYHEADS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {t(entry.label)}
              </option>
            ))}
          </select>
        </Row>
      </section>

      <section className="section glass" style={{ marginBottom: 16 }}>
        <div className="section__head">
          <h3>{t("The player’s info line")}</h3>
        </div>
        <p className="section__desc">
          {t("Write the line under the title in the full player yourself.")}{' '}<code>{'{year}'}</code> {' '}{t("is the year;")}{' '}
          <code>{'{?genre: · {genre}}'}</code> {' '}{t("shows the genre, and its dot, only when there is one. Leave it empty for Kultr’s own.")}</p>
        <textarea
          className="codebox"
          rows={2}
          spellCheck={false}
          placeholder="{year}{?genre: · {genre}}{?format: · {format}}{?bitrate: · {bitrate} kbps}"
          value={settings.factsTemplate}
          onChange={(event) => settings.set('factsTemplate', event.target.value.slice(0, 300))}
        />
        <div className="chip-row" style={{ marginTop: 8 }}>
          {TEMPLATE_FIELDS.map(([name]) => (
            <button key={name} className="chip" onClick={() => settings.set('factsTemplate', `${settings.factsTemplate}{${name}}`)}>
              {`{${name}}`}
            </button>
          ))}
        </div>
        <p className="row__hint" style={{ marginTop: 10 }}>
          {t("Looks like:")}{' '}<strong>{preview || '—'}</strong>
        </p>
      </section>

      <section className="section glass">
        <div className="section__head">
          <h3>{t("Share your style")}</h3>
        </div>
        <Row label={t("As a link")} hint={t("Paste it into Kultr anywhere — here, on the iPhone or on Android.")} wrap>
          <button
            className="pill pill-accent"
            onClick={async () => {
              await navigator.clipboard.writeText(styleLink(current)).catch(() => {})
              toast.show(t("Style link copied."), 'success')
            }}
          >
            <Copy size={14} />
            {t("Copy link")}</button>
          <button
            className="pill"
            onClick={() => {
              const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'My style.kultrstyle'
              a.click()
              window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
            }}
          >
            <Download size={14} />
            {t("Save as a file")}</button>
        </Row>
        <Row label={t("Open a style")} hint={t("A kultr://style/… link, or a .kultrstyle file. Only the look changes.")} wrap>
          <form
            style={{ display: 'flex', gap: 8, flex: 1, minWidth: 0 }}
            onSubmit={(event) => {
              event.preventDefault()
              if (incoming.trim()) open(incoming)
            }}
          >
            <input className="field-input" placeholder={t("kultr://style/…")} value={incoming} onChange={(event) => setIncoming(event.target.value)} />
            <button className="pill" type="submit" disabled={!incoming.trim()}>
              <Link2 size={14} />
              {t("Open")}</button>
          </form>
          <button className="pill" onClick={() => fileInput.current?.click()}>
            <Upload size={14} />
            {t("File")}</button>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".kultrstyle,.json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) open(await file.text())
            }}
          />
        </Row>
      </section>
    </>
  )
}
