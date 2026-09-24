import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'
import { initials } from '@/lib/format'
import { useDismiss } from '@/lib/hooks'
import { prefersReducedMotion, useLastWhile, usePresence, useSlidingIndicator } from '@/lib/motion'

/** Artwork with a graceful fallback when the image is missing or blocked. */
export function Art({
  src,
  alt,
  round,
  className,
}: {
  src: string
  alt: string
  round?: boolean
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  if (!src || failed) {
    return (
      <div className={clsx('artfallback', className)} style={round ? { borderRadius: '50%' } : undefined}>
        {initials(alt)}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      data-on={checked}
      onClick={() => onChange(!checked)}
    />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const mark = useRef<HTMLSpanElement>(null)
  const slideTo = useSlidingIndicator(box, mark, "button[data-active='true']", [value, options.length])
  return (
    <div className="seg" role="tablist" ref={box}>
      <span className="seg__mark" ref={mark} aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          data-active={value === option.value}
          onClick={(event) => {
            // Started here rather than after the re-render the change causes.
            // The change itself is not delayed: a setting must never depend
            // on how quickly frames arrive.
            slideTo(event.currentTarget)
            onChange(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** A labelled slider that shows its current value. */
export function SliderRow({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  label,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: (value: number) => string
  label: string
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <>
      <input
        className="slider"
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="value">{format ? format(value) : value}</span>
    </>
  )
}

export function Row({
  label,
  hint,
  children,
  stack,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  stack?: boolean
}) {
  return (
    <div className={clsx('row', stack && 'row--stack')}>
      <div className="row__text">
        <span className="row__label">{label}</span>
        {hint ? <span className="row__hint">{hint}</span> : null}
      </div>
      <div className="row__control">{children}</div>
    </div>
  )
}

/**
 * A titled panel.
 *
 * With `collapsible`, the heading becomes the toggle and only the title,
 * description and actions stay visible when it is shut. The body is left out
 * of the DOM entirely rather than hidden, so a long settings page costs
 * nothing to render while its sections are closed.
 */
export function Section({
  title,
  icon,
  description,
  actions,
  collapsible,
  open = true,
  onToggle,
  children,
}: {
  title: string
  icon?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  collapsible?: boolean
  open?: boolean
  onToggle?: (open: boolean) => void
  children: ReactNode
}) {
  if (!collapsible) {
    return (
      <section className="section glass">
        <div className="section__head">
          {icon}
          <h3>{title}</h3>
          {actions}
        </div>
        {description ? <p className="section__desc">{description}</p> : null}
        {children}
      </section>
    )
  }

  return (
    <section className="section glass" data-open={open}>
      <div className="section__head">
        <button
          type="button"
          className="section__toggle"
          aria-expanded={open}
          onClick={() => onToggle?.(!open)}
        >
          {icon}
          <h3>{title}</h3>
          <ChevronDown className="section__chevron" size={18} aria-hidden="true" />
        </button>
        {/* Outside the toggle: a button inside a button is invalid, and these
            are their own actions rather than ways to open the section. */}
        {open && actions ? <span className="section__actions">{actions}</span> : null}
      </div>
      {description ? <p className="section__desc">{description}</p> : null}
      <Collapse open={open}>{children}</Collapse>
    </section>
  )
}

const COLLAPSE_MS = 300

/**
 * Height-animated disclosure.
 *
 * The body is still not in the DOM while shut; it is mounted at zero height,
 * grown to its natural height, and removed again once it has shrunk away.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [phase, setPhase] = useState<'closed' | 'entering' | 'opening' | 'open' | 'closing'>(
    open ? 'open' : 'closed',
  )

  useEffect(() => {
    if (open) {
      if (phase === 'open' || phase === 'opening' || phase === 'entering') return
      setPhase(prefersReducedMotion() ? 'open' : 'entering')
    } else {
      if (phase === 'closed' || phase === 'closing') return
      setPhase(prefersReducedMotion() ? 'closed' : 'closing')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (phase === 'entering') {
      // Paint it at zero height first, or there is nothing to grow from.
      let second = 0
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setPhase('opening'))
      })
      return () => {
        cancelAnimationFrame(first)
        cancelAnimationFrame(second)
      }
    }
    if (phase === 'opening' || phase === 'closing') {
      const timer = window.setTimeout(() => setPhase(phase === 'opening' ? 'open' : 'closed'), COLLAPSE_MS)
      return () => window.clearTimeout(timer)
    }
  }, [phase])

  if (phase === 'closed') return null
  return (
    <div className="collapse" data-phase={phase}>
      <div className="collapse__inner">{children}</div>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useDismiss<HTMLDivElement>(open, onClose)
  const { present, leaving } = usePresence(open, 200)
  // What a dialog shows usually comes from the state that closes it, so hold
  // on to the last of it for the exit rather than animating an empty sheet.
  const shown = useLastWhile({ title, children, footer }, open)
  if (!present) return null
  return createPortal(
    <div className="scrim" role="dialog" aria-modal="true" aria-label={shown.title} data-leaving={leaving}>
      <div className="sheet glass glass-strong" ref={ref}>
        <div className="sheet__head">
          <h2>{shown.title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {shown.children}
        {shown.footer ? (
          <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>{shown.footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  separatorBefore?: boolean
  disabled?: boolean
}

/** Floating menu anchored to a point, kept inside the viewport. */
export function Menu({
  anchor,
  items,
  onClose,
}: {
  anchor: { x: number; y: number } | null
  items: MenuItem[]
  onClose: () => void
}) {
  const ref = useDismiss<HTMLDivElement>(Boolean(anchor), onClose)
  const [position, setPosition] = useState({ left: -9999, top: -9999 })
  const { present, leaving } = usePresence(Boolean(anchor), 130)
  const shownItems = useLastWhile(items, Boolean(anchor))

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const left = Math.min(anchor.x, window.innerWidth - rect.width - 12)
    const top = Math.min(anchor.y, window.innerHeight - rect.height - 12)
    setPosition({ left: Math.max(12, left), top: Math.max(12, top) })
    // Grow out of the corner nearest the pointer, not out of the middle.
    const originX = anchor.x - Math.max(12, left)
    const originY = anchor.y - Math.max(12, top)
    ref.current.style.transformOrigin = `${originX}px ${originY}px`
  }, [anchor, ref])

  if (!present) return null

  return createPortal(
    <div className="menu glass glass-strong" ref={ref} style={position} role="menu" data-leaving={leaving}>
      {shownItems.map((item, index) => (
        <div key={`${item.label}-${index}`}>
          {item.separatorBefore ? <div className="menu__sep" /> : null}
          <button
            type="button"
            role="menuitem"
            className="menu__item"
            data-danger={item.danger}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
          >
            {item.icon}
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}

/** Open a Menu from any click/contextmenu event. */
export function useMenu() {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const open = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setAnchor({ x: event.clientX, y: event.clientY })
  }
  const openFrom = (element: HTMLElement | null) => {
    if (!element) return
    const rect = element.getBoundingClientRect()
    setAnchor({ x: rect.left, y: rect.bottom + 6 })
  }
  return { anchor, open, openFrom, close: () => setAnchor(null) }
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  )
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card">
          <div className="card__art skeleton" />
          <div className="skeleton" style={{ height: 12, width: '80%' }} />
          <div className="skeleton" style={{ height: 10, width: '55%' }} />
        </div>
      ))}
    </div>
  )
}

export function Badge({
  children,
  tone,
}: {
  children: ReactNode
  tone?: 'accent' | 'warning' | 'danger' | 'success'
}) {
  return (
    <span className="badge" data-tone={tone}>
      {children}
    </span>
  )
}
