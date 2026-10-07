import { Infinity as InfinityIcon } from 'lucide-react'

/** Text for the heading, for the queue as it stands. */
export const KAROUSEL_ADDED = "Music like what's playing, so it never stops."
export const KAROUSEL_WAITING = 'On: when the queue runs out, music like it keeps playing.'

/** Heads the songs Karousel added in Up next, or says it is waiting to. */
export function KarouselHeading({ text }: { text: string }) {
  return (
    <div className="karousel-head">
      <span className="karousel-head__disc" aria-hidden="true">
        <InfinityIcon size={16} />
      </span>
      <div className="karousel-head__text">
        <strong>Karousel</strong>
        <span>{text}</span>
      </div>
    </div>
  )
}
