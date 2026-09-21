import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { SubsonicClient, describeError, setClient } from '@/api/subsonic'
import type { Credentials, ServerInfo } from '@/api/types'

export interface ServerProfile extends Credentials {
  id: string
  label: string
}

const SESSION_KEY = 'kultr.session'

/**
 * Subsonic token auth needs the plaintext password on every request (the token
 * is md5(password + per-request salt)), so it has to live somewhere on the
 * client. "Remember me" puts it in localStorage; without it, the password only
 * lives in sessionStorage and disappears when the tab closes.
 */
function readSessionSecrets(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeSessionSecret(id: string, password: string): void {
  try {
    const all = readSessionSecrets()
    all[id] = password
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(all))
  } catch {
    /* private mode; the user will have to log in again */
  }
}

function clearSessionSecret(id: string): void {
  try {
    const all = readSessionSecrets()
    delete all[id]
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export interface AuthState {
  profiles: ServerProfile[]
  activeId: string | null
  remember: boolean
  status: 'idle' | 'connecting' | 'connected' | 'error'
  error: string | null
  serverInfo: ServerInfo | null
  hydrated: boolean

  login: (input: Credentials & { label?: string; remember?: boolean }) => Promise<boolean>
  reconnect: () => Promise<boolean>
  switchProfile: (id: string) => Promise<boolean>
  removeProfile: (id: string) => void
  logout: (options?: { forget?: boolean }) => void
  activeProfile: () => ServerProfile | null
}

function makeId(url: string, username: string): string {
  return `${url.replace(/\/+$/, '')}#${username}`.toLowerCase()
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeId: null,
      remember: true,
      status: 'idle',
      error: null,
      serverInfo: null,
      hydrated: false,

      activeProfile: () => {
        const { profiles, activeId } = get()
        return profiles.find((profile) => profile.id === activeId) ?? null
      },

      async login(input) {
        set({ status: 'connecting', error: null })
        const creds: Credentials = {
          serverUrl: input.serverUrl.trim().replace(/\/+$/, ''),
          username: input.username.trim(),
          password: input.password,
          authMode: input.authMode ?? 'token',
        }
        const client = new SubsonicClient(creds)
        try {
          const info = await client.ping()
          const id = makeId(client.baseUrl, creds.username)
          const profile: ServerProfile = {
            ...creds,
            serverUrl: client.baseUrl,
            id,
            label: input.label?.trim() || hostLabel(client.baseUrl),
          }
          const remember = input.remember ?? get().remember
          if (!remember) writeSessionSecret(id, creds.password)

          setClient(client)
          set((state) => ({
            profiles: [...state.profiles.filter((p) => p.id !== id), profile],
            activeId: id,
            remember,
            status: 'connected',
            error: null,
            serverInfo: info,
          }))
          return true
        } catch (err) {
          setClient(null)
          set({ status: 'error', error: describeError(err), serverInfo: null })
          return false
        }
      },

      async reconnect() {
        const profile = get().activeProfile()
        if (!profile) {
          set({ status: 'idle' })
          return false
        }
        const password = profile.password || readSessionSecrets()[profile.id] || ''
        if (!password) {
          set({ status: 'idle', error: null })
          return false
        }
        set({ status: 'connecting', error: null })
        const client = new SubsonicClient({ ...profile, password })
        try {
          const info = await client.ping()
          setClient(client)
          set({ status: 'connected', error: null, serverInfo: info })
          return true
        } catch (err) {
          setClient(null)
          set({ status: 'error', error: describeError(err) })
          return false
        }
      },

      async switchProfile(id) {
        const profile = get().profiles.find((p) => p.id === id)
        if (!profile) return false
        set({ activeId: id })
        return get().reconnect()
      },

      removeProfile(id) {
        clearSessionSecret(id)
        set((state) => {
          const profiles = state.profiles.filter((p) => p.id !== id)
          const wasActive = state.activeId === id
          if (wasActive) setClient(null)
          return {
            profiles,
            activeId: wasActive ? null : state.activeId,
            status: wasActive ? 'idle' : state.status,
          }
        })
      },

      logout(options) {
        const { activeId } = get()
        setClient(null)
        if (activeId) clearSessionSecret(activeId)
        if (options?.forget && activeId) {
          set((state) => ({
            profiles: state.profiles.filter((p) => p.id !== activeId),
            activeId: null,
            status: 'idle',
            error: null,
            serverInfo: null,
          }))
        } else {
          set({ activeId: null, status: 'idle', error: null, serverInfo: null })
        }
      },
    }),
    {
      name: 'kultr.auth',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        profiles: state.remember
          ? state.profiles
          : state.profiles.map((profile) => ({ ...profile, password: '' })),
        activeId: state.activeId,
        remember: state.remember,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Re-attach session-only passwords after a reload in the same tab.
        const secrets = readSessionSecrets()
        if (Object.keys(secrets).length) {
          state.profiles = state.profiles.map((profile) =>
            profile.password ? profile : { ...profile, password: secrets[profile.id] ?? '' },
          )
        }
        state.hydrated = true
      },
    },
  ),
)

export function hostLabel(url: string): string {
  if (!url) return 'This device'
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
