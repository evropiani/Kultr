/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __KULTR_VERSION__: string
declare const __KULTR_BUILD_DATE__: string

interface ImportMetaEnv {
  /** Optional pre-configured server URL, baked in at build time. */
  readonly VITE_NAVIDROME_URL?: string
  /** Set to "1" to hide the server field on the login screen. */
  readonly VITE_LOCK_SERVER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
