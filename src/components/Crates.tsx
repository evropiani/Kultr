import { useMemo, useState } from 'react'
import { create } from 'zustand'
import { Check, Package, Plus, StickyNote, Tag, X } from 'lucide-react'
import { addTag, albumKey, artistKey, crateContents, newId, removeTag, tagCounts, type Annotation } from '@/lib/collection'
import { annotationFor, crateContains, itemTitle, saveCrate, setAnnotation, toggleInCrate, type CrateItem } from '@/lib/crates'
import { useSettings } from '@/store/settings'
import { StationIcon } from './StationIcon'
import { Modal } from './ui'

/* ------------------------------------------------------------ crate picker */

interface CratePickerState {
  item: CrateItem | null
  show: (item: CrateItem) => void
  close: () => void
}

export const useCratePicker = create<CratePickerState>((set) => ({
  item: null,
  show: (item) => set({ item }),
  close: () => set({ item: null }),
}))

/** "Add to a crate": every crate filled by hand, ticked where the item is in it. Rendered once in the shell. */
export function CratePickerModal() {
  const { item, close } = useCratePicker()
  const crates = useSettings((state) => state.crates)
  const [name, setName] = useState('')
  const byHand = crates.filter((crate) => !crate.rules)

  const make = () => {
    const clean = name.trim()
    if (!clean || !item) return
    const crate = { id: newId('c'), name: clean, icon: 'shippingbox.fill', albums: [], artists: [], songs: [] }
    saveCrate(crate)
    toggleInCrate(item, crate.id)
    setName('')
  }

  return (
    <Modal open={Boolean(item)} onClose={close} title={item ? `Crates for “${itemTitle(item)}”` : 'Crates'}>
      <div className="crate-picker">
        {byHand.length === 0 ? <p className="row__hint">No crates yet. Name one below to make it and put this in.</p> : null}
        {byHand.map((crate) => {
          const inIt = item ? crateContains(crate, item) : false
          return (
            <button key={crate.id} className="crate-picker__row" data-on={inIt || undefined} onClick={() => item && toggleInCrate(item, crate.id)}>
              <span className="station-card__icon">
                <StationIcon symbol={crate.icon} size={16} />
              </span>
              <span className="crate-picker__text">
                <strong>{crate.name}</strong>
                <small>{crateContents(crate)}</small>
              </span>
              {inIt ? <Check size={16} /> : <Plus size={16} />}
            </button>
          )
        })}
        <form
          className="crate-picker__new"
          onSubmit={(event) => {
            event.preventDefault()
            make()
          }}
        >
          <input className="field-input" placeholder="New crate…" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          <button className="pill pill-accent" type="submit" disabled={!name.trim()}>
            <Package size={14} />
            Make
          </button>
        </form>
      </div>
    </Modal>
  )
}

/* ----------------------------------------------------------- notes, tags */

/**
 * Your note and tags on an album or an artist. Private: kept with your
 * settings (and in a settings backup), never sent to the server.
 */
export function NotesAndTags({ kind, id }: { kind: 'album' | 'artist'; id: string }) {
  const key = kind === 'album' ? albumKey(id) : artistKey(id)
  const stored = useSettings((state) => state.annotations[key])
  const all = useSettings((state) => state.annotations)
  const annotation: Annotation = stored ?? { note: '', tags: [] }
  const [note, setNote] = useState(annotation.note)
  const [tag, setTag] = useState('')
  const [editing, setEditing] = useState(false)
  const suggestions = useMemo(
    () =>
      tagCounts(all)
        .map((entry) => entry.tag)
        .filter((t) => !annotation.tags.some((mine) => mine.toLowerCase() === t.toLowerCase()))
        .slice(0, 8),
    [all, annotation.tags],
  )

  const save = (next: Annotation) => setAnnotation(key, next)
  const [shown, setShown] = useState(Boolean(annotation.note || annotation.tags.length))

  if (!shown) {
    return (
      <button className="pill notes__open" onClick={() => setShown(true)}>
        <StickyNote size={14} />
        Add a note or tags
      </button>
    )
  }

  return (
    <section className="notes glass">
      <div className="notes__head">
        <StickyNote size={15} />
        <h3>Your notes</h3>
        <span className="row__hint" style={{ marginLeft: 'auto' }}>
          Only you see these; they stay in this browser and in a settings backup.
        </span>
      </div>
      {editing ? (
        <textarea
          className="codebox notes__text"
          rows={3}
          autoFocus
          value={note}
          placeholder={kind === 'album' ? 'What you think of it, where it came from, which edition…' : 'Anything you want to remember…'}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            save({ ...annotationFor(key), note })
            setEditing(false)
          }}
        />
      ) : (
        <button className="notes__note" onClick={() => setEditing(true)}>
          {annotation.note ? annotation.note : <span className="row__hint">Add a note…</span>}
        </button>
      )}
      <div className="chip-row notes__tags">
        <Tag size={14} style={{ color: 'var(--ink-3)', alignSelf: 'center' }} />
        {annotation.tags.map((t) => (
          <span key={t} className="chip" data-on>
            {t}
            <button aria-label={`Remove the tag ${t}`} onClick={() => save(removeTag(annotationFor(key), t))}>
              <X size={11} />
            </button>
          </span>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!tag.trim()) return
            save(addTag(annotationFor(key), tag))
            setTag('')
          }}
        >
          <input className="notes__tag-input" placeholder="Add a tag" value={tag} maxLength={40} onChange={(event) => setTag(event.target.value)} list={`tags-${key}`} />
          <datalist id={`tags-${key}`}>
            {suggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </form>
      </div>
    </section>
  )
}
