import clsx from 'clsx'

/**
 * The Kultr mark: the app icon itself.
 *
 * The same artwork as the favicon and the installed-app icons, so the app
 * looks like one thing wherever you meet it: the orange K on cream, as in
 * Kultr for iOS. On the cream theme the tile melts into the page and the K
 * stands alone; on charcoal it reads as a tile. Either way there is nothing
 * to swap when the theme changes, and nothing to flash while a second image
 * loads.
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
      src={`${import.meta.env.BASE_URL}logo.png`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      title={title}
    />
  )
}
