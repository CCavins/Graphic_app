// Writes the user manual as a static page into dist/help/index.html after `vite build`.
// It is generated from src/help/manual.ts so the in-app Help and the docs page never drift apart.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderDocsPage } from '../src/help/docs'

const out = resolve(process.cwd(), 'dist', 'help')
mkdirSync(out, { recursive: true })
writeFileSync(resolve(out, 'index.html'), renderDocsPage('../'))
console.log('docs: dist/help/index.html')
