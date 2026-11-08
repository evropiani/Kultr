// Kultr for Windows and Linux.
//
// The web app, served from this computer and opened in its own window. It
// works with no network at all: the app is inside the installer, and music
// on this computer is read straight from disk. With a network it connects to
// Navidrome exactly as the web version does.
//
// Why a local server rather than file://: the app needs a real origin for
// its storage (IndexedDB, localStorage) and a secure context for the APIs it
// uses. http://127.0.0.1 is both, and unlike https it does not block a
// Navidrome reached over plain http on your own network. The port is fixed,
// because the origin — and with it everything Kultr keeps — depends on it.

const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, shell } = require('electron')
const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')

const PORTS = [41814, 41815, 41816, 41817]
const APP_DIR = path.join(__dirname, 'app')
const RELEASES = 'https://api.github.com/repos/evropiani/Kultr/releases/latest'
const RELEASE_PAGE = 'https://github.com/evropiani/Kultr/releases/latest'
const TOKEN = crypto.randomBytes(24).toString('hex')

let port = PORTS[0]
let mainWindow = null

/** The app's own menus and dialogs follow the system language: English or German. */
const say = (english, german) => (app.getLocale().toLowerCase().startsWith('de') ? german : english)

// ------------------------------------------------------------ one instance --

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

// ---------------------------------------------------- folders you picked --
//
// The page may read only inside folders chosen in the folder dialog, and
// only through this process. The list is kept in the user data folder so
// folders stay readable after a restart without asking again.

const foldersFile = () => path.join(app.getPath('userData'), 'music-folders.json')

function loadFolders() {
  try {
    const list = JSON.parse(fs.readFileSync(foldersFile(), 'utf8'))
    return new Set(Array.isArray(list) ? list.filter((entry) => typeof entry === 'string') : [])
  } catch {
    return new Set()
  }
}

let allowedRoots = new Set()

function saveFolders() {
  try {
    fs.mkdirSync(path.dirname(foldersFile()), { recursive: true })
    fs.writeFileSync(foldersFile(), JSON.stringify([...allowedRoots], null, 2))
  } catch (err) {
    console.warn('[kultr] could not save the folder list', err)
  }
}

/** The absolute path of `rel` inside `root`, or null if it would leave it or the root was never picked. */
function resolveInside(root, rel) {
  if (typeof root !== 'string' || typeof rel !== 'string' || !allowedRoots.has(root)) return null
  const full = path.resolve(root, rel.split('/').join(path.sep))
  const base = path.resolve(root)
  if (full !== base && !full.startsWith(base.endsWith(path.sep) ? base : base + path.sep)) return null
  return full
}

// ------------------------------------------------------------- the server --

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  // Music
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wave': 'audio/wav',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.webm': 'audio/webm',
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

/** A file from a music folder, with byte ranges so seeking and tag reading work. */
async function sendMusicFile(req, res, url) {
  if (url.searchParams.get('token') !== TOKEN) {
    res.writeHead(403).end()
    return
  }
  const full = resolveInside(url.searchParams.get('root'), url.searchParams.get('rel') ?? '')
  if (!full) {
    res.writeHead(403).end()
    return
  }
  let stat
  try {
    stat = await fsp.stat(full)
    if (!stat.isFile()) throw new Error('not a file')
  } catch {
    res.writeHead(404).end()
    return
  }
  const type = TYPES[path.extname(full).toLowerCase()] ?? 'application/octet-stream'
  const headers = { ...SECURITY_HEADERS, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]))
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1
    end = Math.min(end, stat.size - 1)
    if (start > end || start >= stat.size) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` }).end()
      return
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(full, { start, end }).on('error', () => res.destroy()).pipe(res)
    return
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(full).on('error', () => res.destroy()).pipe(res)
}

/** The app itself: a file from the bundle, or index.html for any page of it. */
async function sendAppFile(req, res, url) {
  let rel = decodeURIComponent(url.pathname)
  // No service worker on the desktop: the app is already on disk, and a
  // cached copy could outlive an update.
  if (rel === '/sw.js' || rel.startsWith('/workbox-')) {
    res.writeHead(404).end()
    return
  }
  let full = path.resolve(APP_DIR, '.' + rel)
  if (full !== APP_DIR && !full.startsWith(APP_DIR + path.sep)) {
    res.writeHead(403).end()
    return
  }
  let stat = await fsp.stat(full).catch(() => null)
  if (!stat || !stat.isFile()) {
    // A page of the app (/albums, /album/123): the router takes it from here.
    if (path.extname(rel)) {
      res.writeHead(404).end()
      return
    }
    full = path.join(APP_DIR, 'index.html')
    stat = await fsp.stat(full)
  }
  const type = TYPES[path.extname(full).toLowerCase()] ?? 'application/octet-stream'
  const immutable = full.includes(`${path.sep}assets${path.sep}`)
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(full).on('error', () => res.destroy()).pipe(res)
}

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }
    // Only this computer, and only by the address the app is opened at.
    const host = req.headers.host ?? ''
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      res.writeHead(421).end()
      return
    }
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    const handler = url.pathname === '/__kultr/file' ? sendMusicFile : sendAppFile
    handler(req, res, url).catch((err) => {
      console.warn('[kultr] request failed', url.pathname, err)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  return new Promise((resolve, reject) => {
    const tryPort = (index) => {
      if (index >= PORTS.length) return reject(new Error('No free port for Kultr'))
      port = PORTS[index]
      server.once('error', (err) => (err.code === 'EADDRINUSE' ? tryPort(index + 1) : reject(err)))
      server.listen(port, '127.0.0.1', () => resolve(server))
    }
    tryPort(0)
  })
}

// ---------------------------------------------------------------- bridge --

ipcMain.on('kultr:info', (event) => {
  event.returnValue = { token: TOKEN, port, version: app.getVersion(), platform: process.platform }
})

ipcMain.handle('kultr:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: say('Choose your music folder', 'Wähle deinen Musikordner'),
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const chosen = path.resolve(result.filePaths[0])
  allowedRoots.add(chosen)
  saveFolders()
  return { path: chosen, name: path.basename(chosen) || chosen }
})

ipcMain.handle('kultr:forget-folder', (_event, root) => {
  if (allowedRoots.delete(root)) saveFolders()
})

ipcMain.handle('kultr:list-files', async (_event, root, extensions) => {
  if (!resolveInside(root, '')) throw new Error('That folder was not chosen in Kultr')
  const wanted = new Set((Array.isArray(extensions) ? extensions : []).map((ext) => String(ext).toLowerCase()))
  const out = []
  const walk = async (dir, prefix, depth) => {
    if (depth > 24) return
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(full, rel, depth + 1)
      else if (entry.isFile() || entry.isSymbolicLink()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase()
        if (!wanted.has(ext)) continue
        try {
          const stat = await fsp.stat(full)
          if (stat.isFile()) out.push({ rel, size: stat.size, modified: Math.round(stat.mtimeMs) })
        } catch {
          /* gone since it was listed */
        }
      }
    }
  }
  await walk(path.resolve(root), '', 0)
  return out
})

ipcMain.handle('kultr:open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url)
})

// --------------------------------------------------------------- updates --
//
// Once a day, ask GitHub for the newest release. Quietly does nothing when
// offline; never downloads anything itself — it offers the release page.

const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number)
  const pb = String(b).replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  }
  return false
}

async function checkForUpdate(manual = false) {
  const stamp = path.join(app.getPath('userData'), 'update-check.json')
  let state = {}
  try {
    state = JSON.parse(fs.readFileSync(stamp, 'utf8'))
  } catch {
    /* first run */
  }
  if (!manual && state.checked && Date.now() - state.checked < 20 * 60 * 60 * 1000) return
  try {
    const response = await net.fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
    const release = await response.json()
    const latest = String(release.tag_name ?? '').replace(/^v/, '')
    fs.writeFileSync(stamp, JSON.stringify({ checked: Date.now(), latest }))
    if (latest && newer(latest, app.getVersion()) && (manual || state.skipped !== latest)) {
      const { response: choice } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Kultr',
        message: say(`Kultr ${latest} is available`, `Kultr ${latest} ist verfügbar`),
        detail: say(
          `You have ${app.getVersion()}. Download the new version from GitHub and install it over this one; your library and settings stay.`,
          `Du hast ${app.getVersion()}. Lade die neue Version von GitHub und installiere sie über diese; Mediathek und Einstellungen bleiben.`,
        ),
        buttons: [say('Download', 'Herunterladen'), say('Later', 'Später'), say('Skip this version', 'Diese Version überspringen')],
        defaultId: 0,
        cancelId: 1,
      })
      if (choice === 0) void shell.openExternal(release.html_url || RELEASE_PAGE)
      if (choice === 2) fs.writeFileSync(stamp, JSON.stringify({ checked: Date.now(), latest, skipped: latest }))
    } else if (manual) {
      void dialog.showMessageBox(mainWindow, { type: 'info', title: 'Kultr', message: say('Kultr is up to date', 'Kultr ist aktuell'), detail: say(`You have ${app.getVersion()}, the newest version.`, `Du hast ${app.getVersion()}, die neueste Version.`) })
    }
  } catch (err) {
    if (manual) {
      void dialog.showMessageBox(mainWindow, { type: 'warning', title: 'Kultr', message: say('Could not check for updates', 'Die Suche nach Updates ist fehlgeschlagen'), detail: String(err?.message ?? err) })
    }
  }
}

// ---------------------------------------------------------------- window --

function createWindow() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'))
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: 'Kultr',
    icon: icon.isEmpty() ? undefined : icon,
    backgroundColor: '#f6f0e5',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())

  const origin = `http://127.0.0.1:${port}`
  // Links to anywhere else open in the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(origin)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(origin)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
  // Folder pickers, notifications and the like are Kultr's own; nothing else is granted.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['clipboard-sanitized-write', 'media', 'fullscreen', 'notifications'].includes(permission))
  })

  void mainWindow.loadURL(origin + '/')
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'Kultr',
      submenu: [
        { label: say('Check for updates…', 'Nach Updates suchen…'), click: () => void checkForUpdate(true) },
        { type: 'separator' },
        { role: 'reload', label: say('Reload', 'Neu laden') },
        { role: 'forceReload', label: say('Force Reload', 'Neu laden erzwingen') },
        { role: 'toggleDevTools', label: say('Developer Tools', 'Entwicklerwerkzeuge') },
        { type: 'separator' },
        { role: 'quit', label: say('Quit', 'Beenden') },
      ],
    },
    {
      label: say('Edit', 'Bearbeiten'),
      submenu: [
        { role: 'undo', label: say('Undo', 'Rückgängig') },
        { role: 'redo', label: say('Redo', 'Wiederholen') },
        { type: 'separator' },
        { role: 'cut', label: say('Cut', 'Ausschneiden') },
        { role: 'copy', label: say('Copy', 'Kopieren') },
        { role: 'paste', label: say('Paste', 'Einfügen') },
        { role: 'selectAll', label: say('Select All', 'Alles auswählen') },
      ],
    },
    {
      label: say('View', 'Ansicht'),
      submenu: [
        { role: 'resetZoom', label: say('Actual Size', 'Originalgröße') },
        { role: 'zoomIn', label: say('Zoom In', 'Vergrößern') },
        { role: 'zoomOut', label: say('Zoom Out', 'Verkleinern') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: say('Full Screen', 'Vollbild') },
      ],
    },
    {
      label: say('Help', 'Hilfe'),
      submenu: [
        { label: say('Kultr on GitHub', 'Kultr auf GitHub'), click: () => void shell.openExternal('https://github.com/evropiani/Kultr') },
        { label: say('Troubleshooting', 'Fehlerbehebung'), click: () => void shell.openExternal('https://github.com/evropiani/Kultr/blob/main/docs/TROUBLESHOOTING.md') },
        { label: 'r/Kultr', click: () => void shell.openExternal('https://www.reddit.com/r/Kultr/') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('cc.kultr.desktop')
  allowedRoots = loadFolders()
  try {
    await startServer()
  } catch (err) {
    dialog.showErrorBox(say('Kultr could not start', 'Kultr konnte nicht starten'), String(err?.message ?? err))
    app.quit()
    return
  }
  buildMenu()
  createWindow()
  // A moment after starting, so it never slows the first paint.
  setTimeout(() => void checkForUpdate(false), 8000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!mainWindow && app.isReady()) createWindow()
})
