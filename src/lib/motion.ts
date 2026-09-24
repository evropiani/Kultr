import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Motion helpers.
 *
 * React removes an element the moment its state says so, which is why things
 * used to animate in and then simply vanish. These keep an element around for
 * the length of its exit, move one highlight between items instead of
 * swapping two, and slide reordered rows to their new places.
 *
 * All of them step aside when motion is reduced, whether by the system
 * setting or by Kultr's own switch.
 */

export function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return true
  if (document.documentElement.dataset.motion === 'reduced') return true
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Keep something mounted while it animates out.
 *
 * `present` says whether to render at all; `leaving` is true for the
 * `exitMs` between `open` going false and the element being removed, which is
 * when the stylesheet plays the exit (`[data-leaving='true']`).
 */
export function usePresence(open: boolean, exitMs: number): { present: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) return
    if (prefersReducedMotion()) {
      setMounted(false)
      return
    }
    const timer = window.setTimeout(() => setMounted(false), exitMs)
    return () => window.clearTimeout(timer)
  }, [open, mounted, exitMs])

  return { present: open || mounted, leaving: !open && mounted }
}

/**
 * The last value seen while `live` was true.
 *
 * Whatever an overlay shows usually comes from the same state that closes it
 * — a menu's anchor, a dialog's subject — so without this it would empty
 * itself out halfway through leaving.
 */
export function useLastWhile<T>(value: T, live: boolean): T {
  const ref = useRef(value)
  if (live) ref.current = value
  return ref.current
}

/**
 * Slide one highlight to whichever child matches `selector`.
 *
 * The indicator is absolutely positioned inside `container`; this writes its
 * transform and size. It moves with a transition when it was already showing,
 * and appears in place (no slide in from wherever it was last) when it was
 * hidden, so arriving from a page with no active item does not sweep across
 * the list.
 *
 * Returns `slideTo(element)`, to call from a click handler: it starts the
 * slide before React renders whatever the click causes. A transform
 * transition runs off the main thread once started, so it stays smooth while
 * a heavy page renders — started from the effect instead, it would wait for
 * that render to finish.
 */
export function useSlidingIndicator(
  container: React.RefObject<HTMLElement>,
  indicator: React.RefObject<HTMLElement>,
  selector: string,
  deps: unknown[],
): (target: HTMLElement | null) => void {
  const shown = useRef(false)

  const moveTo = (target: HTMLElement | null, animate: boolean) => {
    const box = container.current
    const mark = indicator.current
    if (!box || !mark) return
    if (!target) {
      mark.style.opacity = '0'
      shown.current = false
      return
    }
    // Layout offsets rather than screen rectangles: they ignore transforms,
    // so a container that is itself mid-animation (the full player scales
    // in) still gets exact positions, and they already account for scroll.
    let x: number, y: number, width: number, height: number
    if (target.offsetParent === box) {
      x = target.offsetLeft
      y = target.offsetTop
      width = target.offsetWidth
      height = target.offsetHeight
    } else {
      const outer = box.getBoundingClientRect()
      const inner = target.getBoundingClientRect()
      x = inner.left - outer.left + box.scrollLeft - box.clientLeft
      y = inner.top - outer.top + box.scrollTop - box.clientTop
      width = inner.width
      height = inner.height
    }
    const slide = animate && shown.current && !prefersReducedMotion()
    mark.style.transition = slide ? '' : 'none'
    mark.style.transform = `translate(${x}px, ${y}px)`
    mark.style.width = `${width}px`
    mark.style.height = `${height}px`
    mark.style.opacity = '1'
    if (!slide) {
      // Commit the jump before transitions come back on.
      void mark.offsetWidth
      mark.style.transition = ''
    }
    shown.current = true
  }

  useLayoutEffect(() => {
    const box = container.current
    if (!box) return
    const place = (animate: boolean) => moveTo(box.querySelector<HTMLElement>(selector), animate)

    // Usually already there, from the click that caused this render; setting
    // the same values again changes nothing and does not restart the slide.
    place(true)
    // Sizes shift with fonts, counts and window width; follow them without
    // turning a resize into a slide. An observer reports once as soon as it
    // starts watching, which is not a resize, and acting on it would cut
    // short the slide that just began.
    let size = `${box.offsetWidth}x${box.offsetHeight}`
    const observer = new ResizeObserver(() => {
      const now = `${box.offsetWidth}x${box.offsetHeight}`
      if (now === size) return
      size = now
      place(false)
    })
    observer.observe(box)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return (target) => moveTo(target, true)
}

/**
 * Run `task` once the browser has painted twice.
 *
 * A transition only starts on the next frame. If a click also triggers a
 * heavy render (a new page, a theme change), that render takes the main
 * thread first and the slide starts late, or not visibly at all. Waiting two
 * frames hands the slide to the compositor, where it keeps running however
 * long the render takes. Thirty-odd milliseconds is not something anyone
 * notices as a delay.
 */
export function afterNextPaint(task: () => void): void {
  if (prefersReducedMotion()) {
    task()
    return
  }
  requestAnimationFrame(() => requestAnimationFrame(task))
}

/**
 * Animate children of `container` from their old positions to their new ones
 * after a reorder (the FLIP technique). Children opt in with `data-flip-key`;
 * one that was not there before fades in where it lands.
 */
export function useFlip(container: React.RefObject<HTMLElement>, deps: unknown[]): void {
  const positions = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const box = container.current
    if (!box) return
    const items = Array.from(box.querySelectorAll<HTMLElement>('[data-flip-key]'))
    const next = new Map<string, number>()
    for (const item of items) next.set(item.dataset.flipKey!, item.getBoundingClientRect().top)

    if (!prefersReducedMotion() && positions.current.size) {
      for (const item of items) {
        const before = positions.current.get(item.dataset.flipKey!)
        const after = next.get(item.dataset.flipKey!)
        if (after === undefined) continue
        if (before === undefined) {
          item.animate(
            [
              { opacity: 0, transform: 'translateY(-6px)' },
              { opacity: 1, transform: 'none' },
            ],
            { duration: 240, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
          )
          continue
        }
        const delta = before - after
        if (Math.abs(delta) < 1) continue
        item.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
          duration: 280,
          easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        })
      }
    }
    positions.current = next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
