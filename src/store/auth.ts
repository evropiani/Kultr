import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { SubsonicClient, describeError, setClient } from '@/api/subsonic'
import type { Credentials, ServerInfo } from '@/api/types'

export interface ServerProfile extends Credentials {
  id: string
  label: string
  /**
   * A server you keep but are not using right now. Disabled servers stay in
   * the list with their credentials intact; they just cannot be connected to
   * until you switch them back on. Older saved profiles predate this field and
   * are treated as enabled.
   */
  enabled?: boolean
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
  setProfileEnabled: (id: string, enabled: boolean) => void
  renameProfile: (id: string, label: string) => void
  /**
   * Change a saved server's connection details. A blank password keeps the
   * one already stored, so the dialog never has to show it back.
   */
  updateProfile: (
    id: string,
    patch: Partial<Pick<ServerProfile, 'label' | 'serverUrl' | 'username' | 'password' | 'authMode'>>,
  ) => Promise<boolean>
  /** Add servers from a settings export. They arrive without credentials. */
  importProfiles: (servers: { label: string; serverUrl: string; authMode?: Credentials['authMode'] }[]) => number
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
          const existing = get().profiles.find((entry) => entry.id === id)
          const profile: ServerProfile = {
            ...creds,
            serverUrl: client.baseUrl,
            id,
            label: input.label?.trim() || existing?.label || hostLabel(client.baseUrl),
            enabled: true,
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
        if (profile?.enabled === false) {
          set({ status: 'idle', error: null })
          return false
        }
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
        if (profile.enabled === false) {
          set({ error: `${profile.label} is switched off. Turn it on in Settings first.` })
          return false
        }
        set({ activeId: id })
        return get().reconnect()
      },

      setProfileEnabled(id, enabled) {
        set((state) => ({
          profiles: state.profiles.map((profile) =>
            profile.id === id ? { ...profile, enabled } : profile,
          ),
        }))
        // Switching off the server you are connected to disconnects you.
        if (!enabled && get().activeId === id) {
          setClient(null)
          set({ activeId: null, status: 'idle', serverInfo: null })
        }
      },

      renameProfile(id, label) {
        set((state) => ({
          profiles: state.profiles.map((profile) =>
            profile.id === id ? { ...profile, label: label.trim() || profile.label } : profile,
          ),
        }))
      },

      async updateProfile(id, patch) {
        const existing = get().profiles.find((entry) => entry.id === id)
        if (!existing) return false

        const password = patch.password?.length ? patch.password : existing.password
        const creds: Credentials = {
          serverUrl: (patch.serverUrl ?? existing.serverUrl).trim().replace(/\/+$/, ''),
          username: (patch.username ?? existing.username).trim(),
          password,
          authMode: patch.authMode ?? existing.authMode ?? 'token',
        }
        // The id is derived from the address and the username, so editing
        // either of those makes this a different profile as far as the store
        // and the session secrets are concerned.
        const client = new SubsonicClient(creds)
        const nextId = makeId(client.baseUrl, creds.username)
        const profile: ServerProfile = {
          ...creds,
          serverUrl: client.baseUrl,
          id: nextId,
          label: (patch.label ?? existing.label).trim() || hostLabel(client.baseUrl),
          enabled: existing.enabled,
        }

        const wasActive = get().activeId === id
        if (nextId !== id) {
          clearSessionSecret(id)
          if (!get().remember && password) writeSessionSecret(nextId, password)
        } else if (!get().remember && password) {
          writeSessionSecret(nextId, password)
        }

        set((state) => ({
          // Drop both the old entry and anything already sitting on the new
          // id, so editing one server onto another's address merges them
          // rather than leaving a duplicate.
          profiles: [...state.profiles.filter((p) => p.id !== id && p.id !== nextId), profile],
          activeId: wasActive ? nextId : state.activeId,
          error: null,
        }))

        if (!wasActive) return true
        if (profile.enabled === false || !password) {
          setClient(null)
          set({ status: 'idle', serverInfo: null })
          return true
        }
        return get().reconnect()
      },

      importProfiles(servers) {
        let added = 0
        set((state) => {
          const profiles = [...state.profiles]
          for (const server of servers) {
            const url = (server.serverUrl ?? '').trim().replace(/\/+$/, '')
            // Credentials are deliberately absent from an export, so these
            // arrive as entries waiting for a username and password.
            const id = makeId(url, '')
            if (profiles.some((entry) => entry.id === id)) continue
            if (profiles.some((entry) => entry.serverUrl === url)) continue
            profiles.push({
              id,
              label: server.label?.trim() || hostLabel(url),
              serverUrl: url,
              username: '',
              password: '',
              authMode: server.authMode ?? 'token',
              enabled: true,
            })
            added++
          }
          return { profiles }
        })
        return added
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
