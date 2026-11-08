import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { newId } from '@/lib/collection'
import { WIDGET_KINDS, type HomeWidget, type WidgetKind, type WidgetSize } from '@/lib/widgets'
import { useSettings } from '@/store/settings'
import { Row, Switch } from './ui'
import { t } from '@/i18n'
import { stationName } from '@/audio/stations'

/** The widgets at the top of Home: add, size, point at a station, crate or shortcut, reorder and remove. */
export function WidgetEditor() {
  const widgets = useSettings((state) => state.homeWidgets)
  const show = useSettings((state) => state.showHomeWidgets)
  const stations = useSettings((state) => state.stations)
  const crates = useSettings((state) => state.crates)
  const set = useSettings((state) => state.set)
  const update = (next: HomeWidget[]) => set('homeWidgets', next)
  const patch = (id: string, change: Partial<HomeWidget>) => update(widgets.map((w) => (w.id === id ? { ...w, ...change } : w)))
  const move = (index: number, by: number) => {
    const next = [...widgets]
    const [item] = next.splice(index, 1)
    next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item)
    update(next)
  }

  return (
    <>
      <Row label={t("Widgets")} hint={t("Now playing, your listening this week, the next mix, a station, a crate or a shortcut, at the top of Home. Small ones sit side by side.")}>
        <Switch checked={show} onChange={(value) => set('showHomeWidgets', value)} label={t("Show widgets")} />
      </Row>
      {show
        ? widgets.map((widget, index) => (
            <div key={widget.id} className="widget-edit">
              <select className="field-input" value={widget.kind} aria-label={t("What it shows")} onChange={(event) => patch(widget.id, { kind: event.target.value as WidgetKind, ref: null })}>
                {WIDGET_KINDS.map((entry) => (
                  <option key={entry.kind} value={entry.kind}>
                    {t(entry.label)}
                  </option>
                ))}
              </select>
              <select className="field-input" value={widget.size} aria-label={t("Size")} onChange={(event) => patch(widget.id, { size: event.target.value as WidgetSize })}>
                <option value="small">{t("Small")}</option>
                <option value="medium">{t("Medium")}</option>
                <option value="large">{t("Large")}</option>
              </select>
              {widget.kind === 'station' ? (
                <select className="field-input" value={widget.ref ?? stations[0]?.id ?? ''} aria-label={t("Station")} onChange={(event) => patch(widget.id, { ref: event.target.value })}>
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {stationName(station)}
                    </option>
                  ))}
                </select>
              ) : widget.kind === 'crate' ? (
                <select className="field-input" value={widget.ref ?? crates[0]?.id ?? ''} aria-label={t("Crate")} onChange={(event) => patch(widget.id, { ref: event.target.value })}>
                  {crates.length ? null : <option value="">{t("No crates yet")}</option>}
                  {crates.map((crate) => (
                    <option key={crate.id} value={crate.id}>
                      {crate.name}
                    </option>
                  ))}
                </select>
              ) : widget.kind === 'shortcut' ? (
                <input className="field-input" placeholder={t("shuffle all, sleep in 30 minutes…")} value={widget.ref ?? ''} onChange={(event) => patch(widget.id, { ref: event.target.value })} />
              ) : (
                <span />
              )}
              <span className="widget-edit__buttons">
                <button className="pill pill-icon" aria-label={t("Up")} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp size={13} />
                </button>
                <button className="pill pill-icon" aria-label={t("Down")} disabled={index === widgets.length - 1} onClick={() => move(index, 1)}>
                  <ArrowDown size={13} />
                </button>
                <button className="pill pill-icon" aria-label={t("Remove")} onClick={() => update(widgets.filter((w) => w.id !== widget.id))}>
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))
        : null}
      {show ? (
        <button className="pill" style={{ marginTop: 8 }} onClick={() => update([...widgets, { id: newId('w'), kind: 'shortcut', size: 'small', ref: 'shuffle all' }])}>
          <Plus size={14} />
          {t("Add a widget")}</button>
      ) : null}
    </>
  )
}
