/**
 * Playing to a speaker in another room.
 *
 * Two standards, neither universal:
 *
 *  - **Remote Playback API** (`media.remote`) in Chromium, which surfaces
 *    Chromecast and other discovered receivers.
 *  - **AirPlay** in Safari, via `webkitShowPlaybackTargetPicker`.
 *
 * Both hand the *URL* to the receiver rather than streaming audio from this
 * tab, so the device has to be able to reach your Navidrome itself. On a home
 * network that is normally true; behind a VPN or a tunnel that only this
 * browser can use, it will not be, and the receiver simply plays nothing.
 *
 * Web Audio is bypassed entirely while casting, so the equaliser, crossfade
 * and InjeKt shaping do not apply — the receiver gets the plain file. That is
 * a limit of the platform, not something Kultr can work around.
 */

export type CastKind = 'remote' | 'airplay' | 'none'

/**
 * `remote` is in the DOM types but not in every engine, and the AirPlay hooks
 * are in no types at all, so both are reached through this shape rather than
 * asserted to exist.
 */
type CastableElement = HTMLMediaElement & {
  webkitShowPlaybackTargetPicker?: () => void
  webkitCurrentPlaybackTargetIsWireless?: boolean
}

function remoteOf(element: HTMLMediaElement): RemotePlayback | null {
  return 'remote' in element ? (element as HTMLMediaElement).remote : null
}

export function castKind(): CastKind {
  if (typeof window === 'undefined') return 'none'
  if ('remote' in HTMLMediaElement.prototype) return 'remote'
  if ('WebKitPlaybackTargetAvailabilityEvent' in window) return 'airplay'
  return 'none'
}

/** Open the browser's device picker for `element`. */
export async function promptCast(element: HTMLMediaElement): Promise<void> {
  const el = element as CastableElement
  const remote = remoteOf(element)
  if (remote) {
    await remote.prompt()
    return
  }
  el.webkitShowPlaybackTargetPicker?.()
}

/**
 * Report whether any receiver is reachable, and whether we are on one.
 *
 * Returns a teardown function. Availability watching is a real cost in
 * Chromium — it keeps device discovery running — so callers should only watch
 * while the control is actually on screen.
 */
export function watchCast(
  element: HTMLMediaElement,
  onChange: (state: { available: boolean; connected: boolean }) => void,
): () => void {
  const el = element as CastableElement
  let available = false
  let connected = false
  const emit = () => onChange({ available, connected })

  const remote = remoteOf(element)
  if (remote) {
    let watchId: number | undefined
    let cancelled = false

    const onConnect = () => {
      connected = remote.state === 'connected'
      emit()
    }
    remote.addEventListener('connect', onConnect)
    remote.addEventListener('connecting', onConnect)
    remote.addEventListener('disconnect', onConnect)
    connected = remote.state === 'connected'

    void remote
      .watchAvailability((value) => {
        available = value
        emit()
      })
      .then((id) => {
        if (cancelled) void remote.cancelWatchAvailability(id)
        else watchId = id
      })
      // Chromium rejects this when the page is not allowed to discover
      // devices; there is nothing to do about it but stay quiet.
      .catch(() => {})

    emit()
    return () => {
      cancelled = true
      remote.removeEventListener('connect', onConnect)
      remote.removeEventListener('connecting', onConnect)
      remote.removeEventListener('disconnect', onConnect)
      if (watchId !== undefined) void remote.cancelWatchAvailability(watchId)
    }
  }

  if ('WebKitPlaybackTargetAvailabilityEvent' in window) {
    const onAvailability = (event: Event) => {
      available = (event as Event & { availability?: string }).availability === 'available'
      emit()
    }
    const onActive = () => {
      connected = Boolean(el.webkitCurrentPlaybackTargetIsWireless)
      emit()
    }
    el.addEventListener('webkitplaybacktargetavailabilitychanged', onAvailability)
    el.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', onActive)
    emit()
    return () => {
      el.removeEventListener('webkitplaybacktargetavailabilitychanged', onAvailability)
      el.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', onActive)
    }
  }

  emit()
  return () => {}
}
