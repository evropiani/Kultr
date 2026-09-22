import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Info, Server, ShieldCheck, User } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/store/auth'
import { hostLabel } from '@/store/auth'
import { Spinner, Switch } from '@/components/ui'

/**
 * Connection screen.
 *
 * The server field accepts anything sensible — "music.example.com",
 * "http://192.168.1.10:4533", or blank when Kultr is served from the same
 * origin as Navidrome behind a reverse proxy.
 */
export function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Reached from Settings → Add a server, so do not bounce back just because
  // another server is already connected.
  const adding = params.get('add') === '1'
  const auth = useAuth()
  const lockedServer = import.meta.env.VITE_LOCK_SERVER === '1'
  const presetServer = import.meta.env.VITE_NAVIDROME_URL ?? ''

  const [serverUrl, setServerUrl] = useState(presetServer)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [plainAuth, setPlainAuth] = useState(false)

  useEffect(() => {
    if (!adding && auth.status === 'connected') navigate('/', { replace: true })
  }, [adding, auth.status, navigate])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const ok = await auth.login({
      serverUrl: lockedServer ? presetServer : serverUrl,
      username,
      password,
      authMode: plainAuth ? 'plain' : 'token',
      remember,
    })
    if (ok) navigate('/', { replace: true })
  }

  const busy = auth.status === 'connecting'

  return (
    <div className="login">
      <form className="login__card glass glass-strong" onSubmit={submit}>
        <div className="login__brand">
          <Logo size={78} />
          <div>
            <h1 style={{ textAlign: 'center', fontSize: 26 }}>Kultr</h1>
            <p className="login__tagline">
              {adding ? 'Add another Navidrome server.' : 'A modern, minimalist client for your Navidrome server.'}
              <br />
              Crossfade, InjeKt, and your whole library mirrored locally.
            </p>
          </div>
        </div>

        {auth.profiles.length > 0 ? (
          <div className="login__profiles">
            <span className="login__hint">Saved servers</span>
            {auth.profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className="login__profile"
                onClick={async () => {
                  const ok = await auth.switchProfile(profile.id)
                  if (ok) navigate('/', { replace: true })
                  else {
                    setServerUrl(profile.serverUrl)
                    setUsername(profile.username)
                  }
                }}
              >
                <Server size={16} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  {profile.label}
                  <small>{profile.username}</small>
                </span>
              </button>
            ))}
            <div className="hairline" style={{ margin: '8px 0' }} />
          </div>
        ) : null}

        {!lockedServer ? (
          <div className="login__field">
            <label htmlFor="server">Server address</label>
            <div className="field">
              <Server size={16} opacity={0.6} />
              <input
                id="server"
                name="url"
                value={serverUrl}
                placeholder="https://music.example.com"
                autoComplete="url"
                spellCheck={false}
                onChange={(event) => setServerUrl(event.target.value)}
              />
            </div>
            <span className="login__hint">
              Leave this empty if Kultr is served from the same address as Navidrome.
            </span>
          </div>
        ) : null}

        <div className="login__field">
          <label htmlFor="username">Username</label>
          <div className="field">
            <User size={16} opacity={0.6} />
            <input
              id="username"
              name="username"
              value={username}
              autoComplete="username"
              spellCheck={false}
              required
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
        </div>

        <div className="login__field">
          <label htmlFor="password">Password</label>
          <div className="field">
            <ShieldCheck size={16} opacity={0.6} />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              autoComplete="current-password"
              required
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="iconbtn"
              style={{ width: 28, height: 28 }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div className="row" style={{ borderTop: 0, padding: 0 }}>
          <div className="row__text">
            <span className="row__label">Stay signed in</span>
            <span className="row__hint">
              Subsonic authentication needs your password on every request, so it is stored in this
              browser. Turn this off to keep it only until you close the tab.
            </span>
          </div>
          <Switch checked={remember} onChange={setRemember} label="Stay signed in" />
        </div>

        {auth.error ? <div className="login__error">{auth.error}</div> : null}

        <button className="pill pill-accent pill-lg" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>
          {busy ? <Spinner /> : null}
          {busy ? 'Connecting…' : 'Connect'}
        </button>

        <button
          type="button"
          className="login__hint"
          style={{ textAlign: 'left', textDecoration: 'underline' }}
          onClick={() => setAdvanced((value) => !value)}
        >
          {advanced ? 'Hide advanced options' : 'Advanced options'}
        </button>

        {advanced ? (
          <div className="row" style={{ borderTop: 0, paddingTop: 0 }}>
            <div className="row__text">
              <span className="row__label">Send the password in plain form</span>
              <span className="row__hint">
                Only needed if your server has token authentication disabled. Use HTTPS if you turn
                this on.
              </span>
            </div>
            <Switch checked={plainAuth} onChange={setPlainAuth} label="Plain password" />
          </div>
        ) : null}

        <p className="login__hint" style={{ display: 'flex', gap: 8 }}>
          <Info size={14} style={{ flex: 'none', marginTop: 2 }} />
          <span>
            Getting a connection error? Your browser blocks cross-origin requests unless Navidrome
            allows them. The install guide shows a one-file reverse proxy that puts Kultr and
            Navidrome on the same address and removes the problem entirely.
            {serverUrl ? (
              <>
                {' '}
                Connecting to <strong>{hostLabel(serverUrl)}</strong>.
              </>
            ) : null}
          </span>
        </p>
      </form>
    </div>
  )
}
