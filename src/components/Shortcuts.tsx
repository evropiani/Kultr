import { useEffect } from 'react'
import { engine } from '@/audio/engine'
import { toggleStarSong } from '@/lib/actions'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { useSelection } from '@/store/selection'
import { useUi } from '@/store/ui'
import { Modal } from './ui'

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play or pause'],
  ['← / →', 'Seek 5 seconds'],
  ['Shift + ← / →', 'Previous / next track'],
  ['↑ / ↓', 'Volume up / down'],
  ['M', 'Mute'],
  ['S', 'Shuffle'],
  ['R', 'Cycle repeat'],
  ['L', 'Favourite the current track'],
  ['Q', 'Toggle the queue'],
  ['F', 'Toggle the full player'],
  ['/', 'Focus search'],
  ['?', 'This list'],
  ['D', 'Toggle InjeKt'],
  ['Esc', 'Close what is open, or clear the selection'],
]

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
}

/** Global keyboard handling. Mounted once by the app shell. */
export function useKeyboardShortcuts(): void {
  const enabled = useSettings((state) => state.keyboardShortcuts)

  useEffect(() => {
    if (!enabled) return

    const onKey = (event: KeyboardEvent) => {
      const ui = useUi.getState()

      if (event.key === 'Escape') {
        if (ui.shortcutsOpen) ui.setShortcuts(false)
        else if (ui.nowPlayingOpen) ui.setNowPlaying(false)
        else if (ui.queueOpen) ui.setQueue(false)
        else if (ui.sidebarOpen) ui.setSidebar(false)
        else if (useSelection.getState().selected.length) useSelection.getState().clear()
        return
      }

      if (isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const player = usePlayer.getState()
      const settings = useSettings.getState()

      switch (event.key) {
        case ' ':
          event.preventDefault()
          void player.toggle()
          break
        case 'ArrowLeft':
          event.preventDefault()
          if (event.shiftKey) void player.previous()
          else player.seek(Math.max(0, engine.currentTime - 5))
          break
        case 'ArrowRight':
          event.preventDefault()
          if (event.shiftKey) void player.next(true)
          else player.seek(engine.currentTime + 5)
          break
        case 'ArrowUp':
          event.preventDefault()
          player.setVolume(Math.min(1, settings.volume + 0.05))
          break
        case 'ArrowDown':
          event.preventDefault()
          player.setVolume(Math.max(0, settings.volume - 0.05))
          break
        case 'm':
        case 'M':
          player.toggleMute()
          break
        case 's':
        case 'S':
          player.setShuffle(!player.shuffle)
          break
        case 'r':
        case 'R':
          player.cycleRepeat()
          break
        case 'l':
        case 'L': {
          const song = player.current()
          if (song) void toggleStarSong(song)
          break
        }
        case 'q':
        case 'Q':
          ui.setQueue(!ui.queueOpen)
          break
        case 'f':
        case 'F':
          ui.setNowPlaying(!ui.nowPlayingOpen)
          break
        case 'd':
        case 'D':
          settings.set('injektEnabled', !settings.injektEnabled)
          break
        case '?':
          ui.setShortcuts(true)
          break
        case '/': {
          event.preventDefault()
          const input = document.querySelector<HTMLInputElement>('[data-search-input="true"]')
          input?.focus()
          input?.select()
          break
        }
        default:
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

export function ShortcutsModal() {
  const open = useUi((state) => state.shortcutsOpen)
  const setShortcuts = useUi((state) => state.setShortcuts)

  return (
    <Modal open={open} onClose={() => setShortcuts(false)} title="Keyboard shortcuts">
      <div style={{ display: 'grid', gap: 2 }}>
        {SHORTCUTS.map(([keys, description]) => (
          <div
            key={keys}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              padding: '9px 2px',
              borderTop: '1px solid var(--line)',
            }}
          >
            <span style={{ fontSize: 13.5 }}>{description}</span>
            <kbd
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                padding: '3px 9px',
                borderRadius: 'var(--r-xs)',
                background: 'var(--glass-tint)',
                border: '1px solid var(--glass-edge)',
                whiteSpace: 'nowrap',
              }}
            >
              {keys}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  )
}
