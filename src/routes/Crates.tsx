import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ListMusic, Package, Pencil, Play, Plus, Shuffle, Trash2 } from 'lucide-react'
import type { Album, Artist, Song } from '@/api/types'
import { readStation, summary, type Station } from '@/audio/stations'
import { allAlbums, allArtists } from '@/db'
import { crateContents, newId, type Crate } from '@/lib/collection'
import { crateSongs, deleteCrate, saveCrate, syncCrateNow } from '@/lib/crates'
import { useAsync } from '@/lib/hooks'
import { useAuth, isLocalProfile } from '@/store/auth'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { AlbumCard, ArtistCard, Grid } from '@/components/Cards'
import { STATION_ICONS, StationIcon } from '@/components/StationIcon'
import { TrackList } from '@/components/TrackList'
import { Empty, Modal, Switch } from '@/components/ui'

/**
 * Crates: folders of albums, artists and tracks, filled by hand, or by rules
 * like "4 stars and up, added this year", each kept as a playlist on your
 * server if you like. As in Kultr for iOS and Android.
 */
export function Crates() {
  const crates = useSettings((state) => state.crates)
  const [editing, setEditing] = useState<Crate | null>(null)
  const navigate = useNavigate()
  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Crates</h1>
          <span className="page-head__sub">
            Folders of albums, artists and tracks, filled by hand or by rules. Put something in one from its ••• menu or its page.
          </span>
        </div>
        <div className="page-actions">
          <button className="pill" onClick={() => setEditing({ id: newId('c'), name: 'New crate', icon: 'shippingbox.fill', albums: [], artists: [], songs: [], rules: { id: 'rules', name: 'rules', icon: '', minRating: 4 } })}>
            <Plus size={14} />
            Crate by rules
          </button>
          <button className="pill pill-accent" onClick={() => setEditing({ id: newId('c'), name: 'New crate', icon: 'shippingbox.fill', albums: [], artists: [], songs: [] })}>
            <Plus size={14} />
            New crate
          </button>
        </div>
      </div>

      {crates.length === 0 ? (
        <Empty icon={<Package size={24} />} title="No crates yet">
          Make one, then put albums, artists and tracks in it from their ••• menus and pages — or let rules fill it, like
          “4 stars and up, added this year”.
        </Empty>
      ) : (
        <div className="station-grid">
          {crates.map((crate) => (
            <div key={crate.id} className="station-card glass">
              <Link className="station-card__main" to={`/crate/${encodeURIComponent(crate.id)}`}>
                <span className="station-card__icon">
                  <StationIcon symbol={crate.icon} size={20} />
                </span>
                <span className="station-card__text">
                  <strong>{crate.name}</strong>
                  <span>{crate.rules ? summary(crate.rules) : crateContents(crate)}</span>
                  {crate.syncPlaylist ? <small>Kept as a playlist</small> : null}
                </span>
              </Link>
              <div className="station-card__actions">
                <button
                  className="pill pill-icon"
                  aria-label={`Play ${crate.name}`}
                  onClick={async () => {
                    const songs = await crateSongs(crate)
                    if (songs.length) void usePlayer.getState().playNow(songs, 0, crate.name)
                  }}
                >
                  <Play size={14} />
                </button>
                <button className="pill pill-icon" aria-label={`Edit ${crate.name}`} onClick={() => setEditing(crate)}>
                  <Pencil size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CrateEditor
        crate={editing}
        onClose={() => setEditing(null)}
        onSaved={(crate, isNew) => {
          setEditing(null)
          if (isNew) navigate(`/crate/${encodeURIComponent(crate.id)}`)
        }}
      />
    </>
  )
}

/** One crate: what is in it, to play, edit or keep as a playlist. */
export function CratePage() {
  const { id = '' } = useParams()
  const crate = useSettings((state) => state.crates.find((entry) => entry.id === id))
  const [editing, setEditing] = useState(false)
  const navigate = useNavigate()
  const { data } = useAsync(
    async () => {
      if (!crate) return { songs: [] as Song[], albums: [] as Album[], artists: [] as Artist[] }
      const [songs, albums, artists] = await Promise.all([crateSongs(crate), allAlbums(), allArtists()])
      return {
        songs,
        albums: crate.rules ? [] : albums.filter((album) => crate.albums.includes(album.id)),
        artists: crate.rules ? [] : artists.filter((artist) => crate.artists.includes(artist.id)),
      }
    },
    [crate],
    { songs: [] as Song[], albums: [] as Album[], artists: [] as Artist[] },
  )
  if (!crate) return <Empty icon={<Package size={24} />} title="That crate is gone" />
  const own = crate.rules ? data.songs : data.songs.filter((song) => crate.songs.includes(song.id))
  return (
    <>
      <div className="page-head">
        <div className="page-head__title">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="station-card__icon">
              <StationIcon symbol={crate.icon} size={20} />
            </span>
            {crate.name}
          </h1>
          <span className="page-head__sub">
            {crate.rules ? `By rules: ${summary(crate.rules)}` : crateContents(crate)} · {data.songs.length.toLocaleString()} tracks
            {crate.syncPlaylist ? ' · kept as a playlist on your server' : ''}
          </span>
        </div>
        <div className="page-actions">
          <button className="pill pill-accent" disabled={!data.songs.length} onClick={() => void usePlayer.getState().playNow(data.songs, 0, crate.name)}>
            <Play size={14} />
            Play
          </button>
          <button className="pill" disabled={!data.songs.length} onClick={() => void usePlayer.getState().playNow([...data.songs].sort(() => Math.random() - 0.5), 0, crate.name)}>
            <Shuffle size={14} />
            Shuffle
          </button>
          <button className="pill" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            Edit
          </button>
          <button
            className="pill pill-icon"
            aria-label="Delete this crate"
            title="Delete this crate (the music stays)"
            onClick={() => {
              if (!window.confirm(`Delete the crate “${crate.name}”? The music in it stays where it is.`)) return
              deleteCrate(crate.id)
              navigate('/crates')
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {data.albums.length ? (
        <section style={{ marginBottom: 26 }}>
          <h2 style={{ marginBottom: 12 }}>Albums</h2>
          <Grid>
            {data.albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </Grid>
        </section>
      ) : null}
      {data.artists.length ? (
        <section style={{ marginBottom: 26 }}>
          <h2 style={{ marginBottom: 12 }}>Artists</h2>
          <Grid>
            {data.artists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </Grid>
        </section>
      ) : null}
      {own.length ? (
        <section>
          <h2 style={{ marginBottom: 12 }}>{crate.rules ? 'Tracks that fit' : 'Tracks'}</h2>
          <TrackList songs={own} source={crate.name} numbering="index" />
        </section>
      ) : null}
      {!data.songs.length ? (
        <Empty icon={<Package size={24} />} title={crate.rules ? 'Nothing fits yet' : 'Nothing in it yet'}>
          {crate.rules
            ? 'Change the rules, or analyse more of your library on the Sync page if they use energy or key.'
            : 'Open an album or artist and press Crate, or use a track’s ••• menu.'}
        </Empty>
      ) : null}

      <CrateEditor crate={editing ? crate : null} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
    </>
  )
}

/** Name, icon, rules, and whether the crate is kept as a playlist. */
function CrateEditor({ crate, onClose, onSaved }: { crate: Crate | null; onClose: () => void; onSaved: (crate: Crate, isNew: boolean) => void }) {
  const [draft, setDraft] = useState<Crate | null>(crate)
  const crates = useSettings((state) => state.crates)
  const local = useAuth((state) => isLocalProfile(state.activeProfile()))
  useEffect(() => setDraft(crate), [crate])
  if (!draft) return <Modal open={false} onClose={onClose} title="Crate">{null}</Modal>
  const isNew = !crates.some((entry) => entry.id === draft.id)
  const rules = draft.rules ?? null
  const patchRules = (change: Partial<Station>) => setDraft({ ...draft, rules: { ...(rules ?? { id: 'rules', name: 'rules', icon: '' }), ...change } })
  const num = (value: string) => (value.trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value))

  return (
    <Modal
      open={Boolean(crate)}
      onClose={onClose}
      title={isNew ? 'New crate' : `Edit ${crate?.name ?? 'crate'}`}
      footer={
        <>
          <button className="pill" onClick={onClose}>
            Cancel
          </button>
          <button
            className="pill pill-accent"
            onClick={() => {
              const clean: Crate = {
                ...draft,
                name: draft.name.trim() || 'Crate',
                rules: draft.rules ? readStation({ ...draft.rules, id: 'rules', name: draft.name }) : null,
              }
              saveCrate(clean)
              if (clean.syncPlaylist) void syncCrateNow(clean.id)
              onSaved(clean, isNew)
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="station-editor">
        <label className="station-editor__field">
          <span>Name</span>
          <input className="field-input" value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <div className="station-editor__field">
          <span>Icon</span>
          <div className="icon-picker">
            {STATION_ICONS.map((entry) => (
              <button
                key={entry.symbol}
                type="button"
                className="icon-picker__item"
                data-on={draft.icon === entry.symbol || undefined}
                aria-label={entry.label}
                onClick={() => setDraft({ ...draft, icon: entry.symbol })}
              >
                <entry.icon size={16} />
              </button>
            ))}
          </div>
        </div>
        <div className="station-editor__toggles">
          <label>
            <Switch checked={Boolean(rules)} onChange={(value) => setDraft({ ...draft, rules: value ? { id: 'rules', name: 'rules', icon: '', minRating: 4 } : null })} label="Fill by rules" />
            Fill it by rules instead of by hand
          </label>
        </div>
        {rules ? (
          <>
            <div className="station-editor__pair">
              <label className="station-editor__field">
                <span>Rating</span>
                <select className="field-input" value={rules.minRating ?? 0} onChange={(event) => patchRules({ minRating: Number(event.target.value) || null })}>
                  <option value={0}>Any</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}★ and up
                    </option>
                  ))}
                </select>
              </label>
              <label className="station-editor__field">
                <span>Added</span>
                <select className="field-input" value={rules.addedDays ?? 0} onChange={(event) => patchRules({ addedDays: Number(event.target.value) || null })}>
                  <option value={0}>Any time</option>
                  <option value={30}>In the last 30 days</option>
                  <option value={90}>In the last 90 days</option>
                  <option value={365}>This year</option>
                </select>
              </label>
            </div>
            <div className="station-editor__pair">
              <label className="station-editor__field">
                <span>Years from</span>
                <input className="field-input" inputMode="numeric" placeholder="any" value={rules.years?.min ?? ''} onChange={(event) => patchRules({ years: { min: num(event.target.value), max: rules.years?.max ?? null } })} />
              </label>
              <label className="station-editor__field">
                <span>to</span>
                <input className="field-input" inputMode="numeric" placeholder="any" value={rules.years?.max ?? ''} onChange={(event) => patchRules({ years: { min: rules.years?.min ?? null, max: num(event.target.value) } })} />
              </label>
            </div>
            <label className="station-editor__field">
              <span>Genres (comma between)</span>
              <input className="field-input" placeholder="any" value={(rules.genres ?? []).join(', ')} onChange={(event) => patchRules({ genres: event.target.value.split(',').map((g) => g.trim()).filter(Boolean) })} />
            </label>
            <label className="station-editor__field">
              <span>Tags (comma between)</span>
              <input className="field-input" placeholder="any" value={(rules.tags ?? []).join(', ')} onChange={(event) => patchRules({ tags: event.target.value.split(',').map((g) => g.trim()).filter(Boolean) })} />
            </label>
            <div className="station-editor__toggles">
              <label>
                <Switch checked={Boolean(rules.favourites)} onChange={(value) => patchRules({ favourites: value })} label="Favourites only" />
                Favourites only
              </label>
              <label>
                <Switch checked={Boolean(rules.unplayed)} onChange={(value) => patchRules({ unplayed: value })} label="Never played" />
                Never played
              </label>
            </div>
            <p className="row__hint">{summary(rules)}</p>
          </>
        ) : null}
        <div className="station-editor__toggles">
          <label>
            <Switch checked={Boolean(draft.syncPlaylist)} onChange={(value) => setDraft({ ...draft, syncPlaylist: value })} label="Keep as a playlist" />
            <span>
              <ListMusic size={13} style={{ verticalAlign: -2 }} /> Keep it as a playlist {local ? 'too' : 'on your server'}, in step whenever it changes
            </span>
          </label>
        </div>
      </div>
    </Modal>
  )
}
