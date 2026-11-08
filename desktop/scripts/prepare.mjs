// Copy the built web app (../dist) into the desktop app, and keep the
// desktop version in step with the web version.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const desktop = join(here, '..')
const root = join(desktop, '..')
const dist = join(root, 'dist')

if (!existsSync(join(dist, 'index.html'))) {
  console.error('No web build found. Run `npm run build` in the repository root first.')
  process.exit(1)
}

const target = join(desktop, 'app')
rmSync(target, { recursive: true, force: true })
cpSync(dist, target, { recursive: true })
// The desktop app has no service worker (see main.cjs); leave its files behind.
for (const name of ['sw.js', 'sw.js.map']) rmSync(join(target, name), { force: true })

const web = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const pkgPath = join(desktop, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
if (pkg.version !== web.version) {
  pkg.version = web.version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`Desktop version set to ${web.version}`)
}
console.log(`Copied the web app into ${target}`)
