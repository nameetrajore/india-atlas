/**
 * After `vite build`: write dist/ch/<n>/index.html for each chapter. Link-preview crawlers don't run
 * JavaScript, so each page carries its chapter's title, summary and image as Open Graph tags, then
 * forwards people to the app (keeping ?sc= for a specific scene).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Content } from '../src/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://nameetrajore.github.io'
const BASE = process.env.BASE_PATH ?? '/'
const content = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'content.json'), 'utf8')) as Content
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

content.chapters.forEach((c, i) => {
  const title = `Chapter ${c.number}: ${c.title} (${c.period}) · India Atlas`
  const url = `${SITE}${BASE}ch/${c.number}/`
  const target = `${BASE}?ch=${i}`
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(c.summary)}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(c.summary)}" />
<meta property="og:image" content="${SITE}${BASE}og/ch${c.number}.jpg" />
<meta property="og:url" content="${url}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="canonical" href="${url}" />
<meta http-equiv="refresh" content="0; url=${target}" />
<script>location.replace(${JSON.stringify(target)} + location.search.replace(/^\\?/, '&'))</script>
</head>
<body style="background:#f3ead7;font-family:Georgia,serif;padding:2rem">
<p><a href="${target}">${esc(title)}</a></p>
</body>
</html>
`
  const dir = join(ROOT, 'dist', 'ch', String(c.number))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html)
})
console.log(`share pages: ${content.chapters.length}`)
