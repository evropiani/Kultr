import { useRef } from 'react'
import { SkipForward } from 'lucide-react'
import { usePlayer } from '@/store/player'
import { useToast } from '@/store/ui'
import { t } from '@/i18n'

const HOLD_MS = 450

/**
 * Next: click to skip, hold to mix into the next track the way InjeKt would
 * at the end of this one — as in Kultr for iOS and Android.
 */
export function NextButton({ size, label = t('Next track') }: { size: number; label?: string }) {
  const timer = useRef(0)
  const held = useRef(false)

  const start = () => {
    held.current = false
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      held.current = true
      const mixed = await usePlayer.getState().mixNow()
      useToast.getState().show(mixed ? t("Mixing into the next track") : t("Nothing to mix into: this is the last track"), 'info')
    }, HOLD_MS)
  }
  const cancel = () => window.clearTimeout(timer.current)

  return (
    <button
      className="iconbtn"
      aria-label={label}
      title={t("%@ (hold to mix)", label)}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        // The hold already mixed; the click that ends it is not a skip.
        if (held.current) {
          held.current = false
          return
        }
        cancel()
        void usePlayer.getState().next(true)
      }}
    >
      <SkipForward size={size} fill="currentColor" />
    </button>
  )
}
