import clsx from 'clsx'

/**
 * The Kultr mark.
 *
 * One cut-out artwork with no background of its own, which reads on light and
 * dark alike — so there is nothing to swap when the theme changes, and nothing
 * to flash while a second image loads.
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
  return (
    <img
      className={clsx('logo', className)}
      style={{ width: size, height: size }}
      // Pages serves the app from a sub-path, so the public base matters.
      src={`${import.meta.env.BASE_URL}logo-light.png`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      title={title}
    />
  )
}
