import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Moon } from 'lucide-react'
import { usePlayer } from '@/store/player'
import { Menu, useMenu, type MenuItem } from './ui'
import { t } from '@/i18n'

const PRESETS = [15, 30, 45, 60, 90]

/** Sleep-timer button; shows the remaining time once one is armed. */
export function SleepTimerMenu({ children }: { children: ReactNode }) {
  const menu = useMenu()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { sleepTimerEndsAt, sleepTimerAfterTrack, setSleepTimer } = usePlayer()
  const [, forceTick] = useState(0)

  useEffect(() => {
    if (!sleepTimerEndsAt) return
    const timer = window.setInterval(() => forceTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [sleepTimerEndsAt])

  const remaining = sleepTimerEndsAt ? Math.max(0, sleepTimerEndsAt - Date.now()) : 0
  const minutesLeft = Math.ceil(remaining / 60_000)
  const armed = Boolean(sleepTimerEndsAt) || sleepTimerAfterTrack

  const items: MenuItem[] = [
    ...PRESETS.map((minutes) => ({
      label: t("Stop in %@ minutes", minutes),
      icon: <Moon size={15} />,
      onSelect: () => setSleepTimer(minutes),
    })),
    {
      label: t("Stop at the end of this track"),
      icon: <Moon size={15} />,
      separatorBefore: true,
      onSelect: () => setSleepTimer(null, true),
    },
  ]

  if (armed) {
    items.push({
      label: t("Cancel sleep timer"),
      danger: true,
      separatorBefore: true,
      onSelect: () => setSleepTimer(null, false),
    })
  }

  return (
    <>
      <button
        ref={buttonRef}
        className="iconbtn"
        data-active={armed}
        aria-label={t("Sleep timer")}
        title={
          sleepTimerEndsAt
            ? t("Sleep timer: %@ min left", minutesLeft)
            : sleepTimerAfterTrack
              ? t("Sleep timer: stops after this track")
              : t("Sleep timer")
        }
        onClick={() => menu.openFrom(buttonRef.current)}
      >
        {children}
      </button>
      <Menu anchor={menu.anchor} items={items} onClose={menu.close} />
    </>
  )
}
