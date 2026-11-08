import shared from './de-shared.json'
import web from './de-web.json'

/**
 * Kultr in German. Lines are looked up by their English text, as in Kultr
 * for iOS and Android: `de-shared.json` is the file the apps translate from
 * (Android's assets/l10n/de.json), and `de-web.json` holds the lines only the
 * web has. A line with no German shows in English. `%@` stands for a value,
 * filled in order.
 */

export type Language = 'system' | 'en' | 'de'

/** The apps write values as %@ or, from Swift, %lld: here they are all %@. */
const normal = (text: string) => text.replace(/%(?:lld|ld|d|i)/g, '%@')
const GERMAN: Record<string, string> = {}
for (const [key, value] of Object.entries({ ...(shared as Record<string, string>), ...(web as Record<string, string>) })) {
  GERMAN[normal(key)] = normal(value)
}

let active: Record<string, string> | null = null
let activeCode: 'en' | 'de' = 'en'

/** The language a setting means here: "system" follows the browser. */
export function resolveLanguage(setting: Language): 'en' | 'de' {
  if (setting === 'en' || setting === 'de') return setting
  const preferred = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []
  for (const tag of preferred) {
    const code = (tag ?? '').toLowerCase().slice(0, 2)
    if (code === 'de') return 'de'
    if (code === 'en') return 'en'
  }
  return 'en'
}

export function setLanguage(setting: Language): 'en' | 'de' {
  activeCode = resolveLanguage(setting)
  active = activeCode === 'de' ? GERMAN : null
  if (typeof document !== 'undefined') document.documentElement.lang = activeCode
  return activeCode
}

/** The language in use, for dates and numbers. */
export const language = (): 'en' | 'de' => activeCode
export const locale = (): string => (activeCode === 'de' ? 'de-DE' : 'en-GB')

/** Values formatted for the language: numbers with its separators. */
function show(value: unknown): string {
  if (typeof value === 'number') return value.toLocaleString(locale())
  return String(value ?? '')
}

/** `text` in the language in use, with each `%@` replaced by the next value. */
export function t(text: string, ...values: unknown[]): string {
  const line = (active && active[text]) || text
  if (!values.length) return line
  let i = 0
  return line.replace(/%@/g, () => show(values[i++]))
}

/** Whether `text` has a German line (for tests and the coverage check). */
export const hasGerman = (text: string): boolean => Boolean(GERMAN[text])
export const germanLines = (): Record<string, string> => GERMAN
