import { useCallback, useEffect, useRef, useState } from 'react'

/** Run an async loader and keep loading/error state, with cancellation. */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  initial: T,
): { data: T; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    loader(controller.signal)
      .then((result) => {
        if (!active) return
        setData(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!active || (err as Error)?.name === 'AbortError') return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  return { data, loading, error, reload }
}

export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/** Close on Escape and on clicks outside the element. */
export function useDismiss<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
): React.RefObject<T> {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    // Defer so the click that opened the panel does not immediately close it.
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onPointer), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
      window.clearTimeout(timer)
    }
  }, [open, onClose])
  return ref
}

/** Render only what is near the viewport — the library can be enormous. */
export function useVirtualWindow(
  count: number,
  rowHeight: number,
  containerRef: React.RefObject<HTMLElement>,
  overscan = 12,
): { start: number; end: number; offsetTop: number; totalHeight: number } {
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 60) })

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = () => {
      const scrollTop = element.scrollTop
      const height = element.clientHeight
      const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
      const end = Math.min(count, Math.ceil((scrollTop + height) / rowHeight) + overscan)
      setRange((previous) =>
        previous.start === start && previous.end === end ? previous : { start, end },
      )
    }
    update()
    element.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      element.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [count, rowHeight, overscan, containerRef])

  return {
    start: range.start,
    end: range.end,
    offsetTop: range.start * rowHeight,
    totalHeight: count * rowHeight,
  }
}
