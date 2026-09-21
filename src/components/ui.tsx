import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { initials } from '@/lib/format'
import { useDismiss } from '@/lib/hooks'

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
  return (
    <div className="seg" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          data-active={value === option.value}
          onClick={() => onChange(option.value)}
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

export function Section({
  title,
  icon,
  description,
  actions,
  children,
}: {
  title: string
  icon?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
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
  if (!open) return null
  return createPortal(
    <div className="scrim" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet glass glass-strong" ref={ref}>
        <div className="sheet__head">
          <h2>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
        {footer ? <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>{footer}</div> : null}
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

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const left = Math.min(anchor.x, window.innerWidth - rect.width - 12)
    const top = Math.min(anchor.y, window.innerHeight - rect.height - 12)
    setPosition({ left: Math.max(12, left), top: Math.max(12, top) })
  }, [anchor, ref])

  if (!anchor) return null

  return createPortal(
    <div className="menu glass glass-strong" ref={ref} style={position} role="menu">
      {items.map((item, index) => (
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
