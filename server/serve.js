#!/usr/bin/env node
/**
 * Kultr's built-in server — the simplest way to self-host.
 *
 * It does two jobs:
 *
 *   1. Serves the built app from ./dist, with SPA fallback so deep links work.
 *   2. Optionally reverse-proxies /rest and /share to your Navidrome server.
 *
 * Job 2 is the important one. A browser will not let a page at one address
 * make API calls to another unless that other server explicitly allows it
 * (CORS). Proxying Navidrome through this server puts the app and the API on
 * the same address, so the browser has nothing to object to — and Web Audio
 * gets access to the audio, which is what powers the equaliser, the visualizer
 * and AutoMix's bass swap.
 *
 * Usage:
 *   node server/serve.js
 *   KULTR_NAVIDROME_URL=http://localhost:4533 node server/serve.js
 *
 * Environment:
 *   PORT                  port to listen on          (default 4180)
 *   HOST                  address to bind            (default 0.0.0.0)
 *   KULTR_NAVIDROME_URL   Navidrome to proxy         (default: no proxying)
 *   KULTR_DIST            directory to serve         (default ./dist)
 *
 * No dependencies. Node 20 or newer.
 */

import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(process.env.KULTR_DIST ?? join(here, '..', 'dist'))
const PORT = Number(process.env.PORT ?? 4180)
const HOST = process.env.HOST ?? '0.0.0.0'
const UPSTREAM = (process.env.KULTR_NAVIDROME_URL ?? '').replace(/\/+$/, '')

const MIME = {
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
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/** Paths that belong to Navidrome rather than to the app. */
function isApiPath(pathname) {
  return pathname.startsWith('/rest/') || pathname === '/rest' || pathname.startsWith('/share/')
}

function proxy(req, res) {
  let target
  try {
    target = new URL(UPSTREAM)
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(`KULTR_NAVIDROME_URL is not a valid URL: ${UPSTREAM}\n`)
    return
  }

  const isHttps = target.protocol === 'https:'
  const send = isHttps ? httpsRequest : httpRequest

  // Forward the client's headers, but rewrite Host so virtual hosts on the
  // Navidrome side resolve correctly, and drop hop-by-hop headers.
  const headers = { ...req.headers }
  delete headers.host
  delete headers.connection
  delete headers['keep-alive']
  delete headers['proxy-authenticate']
  delete headers['proxy-authorization']
  delete headers.te
  delete headers.trailer
  delete headers['transfer-encoding']
  delete headers.upgrade
  headers.host = target.host

  const upstreamReq = send(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      method: req.method,
      // Concatenated, not path-joined: req.url carries the query string and
      // path normalisation would mangle it.
      path: target.pathname.replace(/\/+$/, '') + req.url,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )

  upstreamReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(
      `Kultr could not reach Navidrome at ${UPSTREAM}\n\n${err.message}\n\n` +
        `Check that Navidrome is running and that KULTR_NAVIDROME_URL points at it.\n`,
    )
  })

  req.pipe(upstreamReq)
}

function serveFile(res, filePath, { immutable = false } = {}) {
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const headers = { 'Content-Type': type }
  if (immutable) headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  else if (filePath.endsWith('sw.js')) headers['Cache-Control'] = 'no-cache'
  else headers['Cache-Control'] = 'no-cache'

  res.writeHead(200, headers)
  createReadStream(filePath).pipe(res)
}

const server = createServer((req, res) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  } catch {
    res.writeHead(400).end('Bad request')
    return
  }

  if (isApiPath(pathname)) {
    if (!UPSTREAM) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(
        'This Kultr server is not proxying Navidrome.\n\n' +
          'Either set KULTR_NAVIDROME_URL and restart, or type your server address\n' +
          'on the Kultr login screen.\n',
      )
      return
    }
    proxy(req, res)
    return
  }

  // Resolve inside DIST only — normalize first so "../" cannot escape.
  const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  let filePath = join(DIST, relative)
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden')
    return
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html')
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    serveFile(res, filePath, { immutable: relative.startsWith('/assets/') })
    return
  }

  // Unknown path: hand it to the single-page app.
  const indexPath = join(DIST, 'index.html')
  if (!existsSync(indexPath)) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`No build found in ${DIST}.\n\nRun "npm run build" first.\n`)
    return
  }
  serveFile(res, indexPath)
})

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST
  console.log(`\n  Kultr is serving ${DIST}`)
  console.log(`  →  http://${shown}:${PORT}`)
  if (UPSTREAM) {
    console.log(`  →  proxying /rest and /share to ${UPSTREAM}`)
    console.log(`     Leave the server field blank on the login screen.`)
  } else {
    console.log(`  →  not proxying Navidrome (set KULTR_NAVIDROME_URL to enable)`)
  }
  console.log('')
})
