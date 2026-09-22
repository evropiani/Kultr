import clsx from 'clsx'

/**
 * The Kultr mark.
 *
 * Two cut-out artworks with no background of their own — a chrome K for light
 * themes and a neon one for dark. Both are rendered and CSS picks which is
 * visible, so switching theme never shows a missing or half-loaded image.
 */
export function Logo({
  size = 34,
  className,
  title,
}: {
  size?: number
  className?: string
  title?: string
}) {
  const base = import.meta.env.BASE_URL
  return (
    <span className={clsx('logo', className)} style={{ width: size, height: size }} title={title}>
      <img className="logo__art logo__art--dark" src={`${base}logo-dark.png`} alt="" aria-hidden="true" />
      <img className="logo__art logo__art--light" src={`${base}logo-light.png`} alt="" aria-hidden="true" />
    </span>
  )
}
