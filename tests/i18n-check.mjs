#!/usr/bin/env node
/**
 * Every line Kultr shows has German, as on Android (L10nTest).
 *
 * Reads the source with the TypeScript parser and collects:
 *   - every t('…') called with a literal, and
 *   - the labels in module-level lists that are passed to t() where they
 *     are shown (home shelves, Welcome slides, station presets, …).
 * Each must have a German line in src/i18n (de-shared.json from Android, or
 * de-web.json), and each German line must keep its %@ placeholders.
 *
 * Exits non-zero and prints what is missing.
 */
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src')
const normal = (text) => text.replace(/%(?:lld|ld|d|i)/g, '%@')
const read = (name) => JSON.parse(readFileSync(join(src, 'i18n', name), 'utf8'))
const german = new Map()
for (const [english, line] of Object.entries({ ...read('de-shared.json'), ...read('de-web.json') })) german.set(normal(english), normal(line))

const parse = (file) =>
  ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) files.push(path)
  }
}
walk(src)

/** English line → the file it is first used in. */
const used = new Map()
for (const file of files) {
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      const first = node.arguments[0]
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) && !used.has(first.text)) used.set(first.text, relative(src, file))
    }
    ts.forEachChild(node, visit)
  }
  visit(parse(file))
}

// Module-level lists whose labels go through t() where they are shown.
const LISTS = [
  'lib/homeTiles.ts',
  'components/Welcome.tsx',
  'lib/widgets.ts',
  'store/settings.ts',
  'components/DropZone.tsx',
  'components/StationIcon.tsx',
  'audio/energyPlan.ts',
  'audio/stations.ts',
  'routes/Studio.tsx',
  'components/LocalMusic.tsx',
  'components/HomeWidgets.tsx',
  'lib/commands.ts',
  'components/KarouselHeading.tsx',
  'components/Shell.tsx',
  'lib/studio.ts',
  'routes/Sync.tsx',
  'components/ModeButtons.tsx',
  'components/Shortcuts.tsx',
]
const LABEL_KEYS = new Set(['label', 'title', 'note', 'text', 'name', 'hint'])
for (const rel of LISTS) {
  const file = join(src, rel)
  const sourceFile = parse(file)
  const visit = (node, inFunction) => {
    if (ts.isFunctionLike(node)) inFunction = true
    if (!inFunction && ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer) && /[A-Za-z]{2,}/.test(node.initializer.text)) {
      const text = node.initializer.text
      const holder = node.parent.parent
      const inLabelRecord = ts.isObjectLiteralExpression(node.parent) && ts.isVariableDeclaration(holder) && /LABEL|WORDS/.test(holder.name.getText(sourceFile))
      if ((LABEL_KEYS.has(node.name.getText(sourceFile)) && !/^kultr\./.test(text)) || inLabelRecord) {
        if (!used.has(text)) used.set(text, rel)
      }
    }
    if (!inFunction && ts.isVariableDeclaration(node) && /^KAROUSEL_/.test(node.name.getText(sourceFile)) && node.initializer && ts.isStringLiteral(node.initializer)) {
      if (!used.has(node.initializer.text)) used.set(node.initializer.text, rel)
    }
    // Equaliser presets are named by their keys.
    if (!inFunction && ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'EQ_PRESETS' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        const name = property.name && (ts.isStringLiteral(property.name) || ts.isIdentifier(property.name)) ? property.name.text : null
        if (name && !used.has(name)) used.set(name, rel)
      }
    }
    // [keys, what they do] pairs: the second of each is shown through t().
    if (!inFunction && ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'SHORTCUTS' && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      for (const pair of node.initializer.elements) {
        const what = ts.isArrayLiteralExpression(pair) ? pair.elements[1] : null
        if (what && ts.isStringLiteral(what) && !used.has(what.text)) used.set(what.text, rel)
      }
    }
    ts.forEachChild(node, (child) => visit(child, inFunction))
  }
  visit(sourceFile, false)
}

const holes = (text) => (text.match(/%@/g) ?? []).length
const missing = []
const mismatched = []
for (const [english, file] of used) {
  if (!/[A-Za-z]{2,}/.test(english)) continue
  const line = german.get(normal(english))
  if (line === undefined) missing.push(`${file}: ${JSON.stringify(english)}`)
  else if (holes(line) !== holes(normal(english))) mismatched.push(`${file}: ${JSON.stringify(english)} → ${JSON.stringify(line)}`)
}
for (const [english, line] of german) {
  if (holes(line) !== holes(english) && !mismatched.some((entry) => entry.includes(JSON.stringify(english)))) mismatched.push(`i18n: ${JSON.stringify(english)} → ${JSON.stringify(line)}`)
}

if (missing.length || mismatched.length) {
  if (missing.length) console.error(`${missing.length} line(s) without German:\n  ${missing.join('\n  ')}`)
  if (mismatched.length) console.error(`${mismatched.length} German line(s) with the wrong number of %@:\n  ${mismatched.join('\n  ')}`)
  console.error('FAIL i18n')
  process.exit(1)
}
console.log(`ok  every one of ${used.size} lines has German, placeholders intact`)
