#!/usr/bin/env node
/**
 * Tiny test runner.
 *
 * Kultr's testable core is pure TypeScript with no DOM in sight (signal
 * analysis and the InjeKt planner), so rather than pulling in a whole test
 * framework we bundle each suite with the esbuild that ships inside Vite and
 * run it on Node.
 *
 * The planner reaches for IndexedDB, the settings store and the Subsonic
 * client; those three modules are aliased to the stubs in tests/stubs so a
 * suite can drive the planner with exact, hand-written analysis data.
 */
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const out = mkdtempSync(join(tmpdir(), 'kultr-tests-'))

const SUITES = ['dsp.test.ts', 'injekt.test.ts']

const alias = {
  '@/db': join(here, 'stubs/stub-db.ts'),
  '@/store/settings': join(here, 'stubs/stub-settings.ts'),
  '@/api/subsonic': join(here, 'stubs/stub-subsonic.ts'),
}

/** Resolve `@/x` to src/x, except where a stub takes over. */
const aliasPlugin = {
  name: 'kultr-alias',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@\// }, (args) => {
      if (alias[args.path]) return { path: alias[args.path] }
      return { path: join(root, 'src', args.path.slice(2)) + '.ts' }
    })
  },
}

let failed = 0

for (const suite of SUITES) {
  const bundle = join(out, suite.replace(/\.ts$/, '.cjs'))
  await build({
    entryPoints: [join(here, suite)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundle,
    logLevel: 'error',
    plugins: [aliasPlugin],
  })

  console.log(`\n── ${suite} ${'─'.repeat(Math.max(0, 56 - suite.length))}`)
  const result = spawnSync(process.execPath, [bundle], { stdio: 'inherit' })
  if (result.status !== 0) failed++
}

rmSync(out, { recursive: true, force: true })

if (failed > 0) {
  console.error(`\n${failed} suite(s) failed.\n`)
  process.exit(1)
}
console.log('\nAll suites passed.\n')
