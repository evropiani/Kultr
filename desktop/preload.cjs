// The small bridge the desktop app adds to the page: choosing music folders
// and reading them, through the main process. Nothing else of Node or
// Electron is reachable from the page.

const { contextBridge, ipcRenderer } = require('electron')

const info = ipcRenderer.sendSync('kultr:info')
const base = `http://127.0.0.1:${info.port}`

contextBridge.exposeInMainWorld('kultrDesktop', {
  version: info.version,
  platform: info.platform,
  pickFolder: () => ipcRenderer.invoke('kultr:pick-folder'),
  forgetFolder: (root) => ipcRenderer.invoke('kultr:forget-folder', root),
  listFiles: (root, extensions) => ipcRenderer.invoke('kultr:list-files', root, extensions),
  fileUrl: (root, rel) =>
    `${base}/__kultr/file?token=${info.token}&root=${encodeURIComponent(root)}&rel=${encodeURIComponent(rel)}`,
  openExternal: (url) => ipcRenderer.invoke('kultr:open-external', url),
})
