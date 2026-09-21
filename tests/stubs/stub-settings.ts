// Stands in for the zustand settings store so a suite can flip options
// directly. Imported by relative path: `@/store/settings` is aliased to *this*
// file, so going through the alias would be circular.
import { DEFAULT_SETTINGS } from '../../src/store/settings'

export type { CrossfadeCurve } from '../../src/store/settings'

export const CURRENT: Record<string, unknown> = { ...DEFAULT_SETTINGS }

export const settings = () => CURRENT as never
