import { useEffect, useState } from 'react'
import { Cast } from 'lucide-react'
import { engine } from '@/audio/engine'
import { castKind, promptCast, watchCast } from '@/audio/cast'
import { useToast } from '@/store/ui'

/**
 * Send playback to a Chromecast, an AirPlay device or anything else the
 * browser has discovered.
 *
 * Renders nothing at all where the platform has no such concept — Firefox,
 * for one — rather than showing a button that could never do anything.
 */
export function CastButton({ size = 17 }: { size?: number }) {
  const kind = castKind()
  const [state, setState] = useState({ available: false, connected: false })

  useEffect(() => {
    if (kind === 'none') return
    // Watching keeps device discovery running, so it only happens while the
    // button is mounted.
    return watchCast(engine.activeElement, setState)
  }, [kind])

  if (kind === 'none') return null

  const label = state.connected
    ? 'Playing on another device'
    : state.available
      ? 'Play on another device'
      : 'No devices found yet'

  return (
    <button
      className="iconbtn"
      data-active={state.connected}
      aria-label={label}
      title={
        state.available || state.connected
          ? label
          : `${label}. The receiver streams from your Navidrome directly, so it has to be able to reach the server itself.`
      }
      onClick={async () => {
        try {
          await promptCast(engine.activeElement)
        } catch (err) {
          // A dismissed picker rejects too, and that is not worth a toast.
          if ((err as Error)?.name === 'NotAllowedError' || (err as Error)?.name === 'AbortError') return
          useToast.getState().show('Could not open the device picker.', 'error')
        }
      }}
    >
      <Cast size={size} />
    </button>
  )
}
