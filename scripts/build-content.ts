/**
 * Validate content/*.yaml against schemas and cross-references, then compile to public/data/content.json.
 * Fails loudly: a record with a broken reference or a missing citation never reaches the app (D6, D10).
 *
 * Run: npm run content
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { z } from 'zod'
import { parseDate } from '../src/lib/time'
import type { Content, Keyframe, LngLat } from '../src/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = join(ROOT, 'content')
const OUT = join(ROOT, 'public', 'data')

const dateStr = z.string().regex(/^-?\d{1,4}(-\d{2}){0,2}$/, 'date must be YYYY, YYYY-MM or YYYY-MM-DD')
const id = z.string().regex(/^[a-z0-9-]+$/)
const cites = z.array(id).min(1, 'at least one source is required')
const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
const hex = z.string().regex(/^#[0-9a-f]{6}$/i)

const Source = z.object({ id, title: z.string(), url: z.string().url().optional() }).strict()
const Polity = z
  .object({
    id,
    name: z.string(),
    alt_names: z.array(z.string()).default([]),
    /** Official names over time; `name` is the fallback. */
    names: z.array(z.object({ from: dateStr, name: z.string() }).strict()).default([]),
    kind: z.enum(['polity', 'power', 'province', 'state', 'tribal', 'foreign', 'dominion']),
    /** Simple-map grouping (D25); defaults from kind. */
    bloc: z.enum(['british', 'indian', 'european', 'india', 'pakistan', 'other']).optional(),
    color: hex,
    summary: z.string(),
    sources: cites,
  })
  .strict()
const Era = z
  .object({ id, kind: z.enum(['phase', 'viceroy']), name: z.string(), from: dateStr, to: dateStr, sources: cites })
  .strict()
const Term = z
  .object({ id, term: z.string(), aliases: z.array(z.string()).default([]), definition: z.string(), sources: cites })
  .strict()
const Chart = z
  .object({
    id,
    kind: z.enum(['line', 'ranges']),
    title: z.string(),
    subtitle: z.string(),
    unit: z.string(),
    points: z.array(z.tuple([z.number(), z.number()])).optional(),
    computed: z.enum(['british-share']).optional(),
    events: z.array(id).optional(),
    figure: z.string().optional(),
    scale: z.number().default(1),
    note: z.string().optional(),
    sources: cites,
  })
  .strict()
const Meta = z.object({ title: z.string(), subtitle: z.string(), range: z.tuple([z.number(), z.number()]) }).strict()
const KeyframeRaw = z
  .object({
    date: dateStr,
    certainty: z.enum(['approximate', 'confident']),
    note: z.string(),
    sources: cites,
    assign: z.record(id, z.array(z.string())).optional(),
    changes: z.record(id, z.array(z.string())).optional(),
  })
  .strict()
const Control = z
  .object({ from: dateStr, power: id, note: z.string().optional(), approx: z.boolean().optional() })
  .strict()
const Place = z
  .object({
    id,
    name: z.string(),
    modern: z.string().optional(),
    coords: lngLat,
    approx: z.boolean().default(false),
    tags: z.array(z.enum(['port', 'fort', 'factory', 'capital', 'battle', 'pilgrimage', 'movement', 'city', 'hill-station', 'prison'])),
    why: z.string().optional(),
    control: z.array(Control).default([]),
    sources: cites,
  })
  .strict()
const Figure = z
  .object({ label: z.string(), min: z.number(), max: z.number(), note: z.string().optional(), sources: cites })
  .strict()
const Event = z
  .object({
    id,
    name: z.string(),
    alt_names: z.array(z.string()).default([]),
    date: dateStr,
    end: dateStr.optional(),
    approx: z.boolean().optional(),
    /** Omit for events outside the map (London, the Spice Islands): they appear in cards and the story only. */
    place: id.optional(),
    kind: z.enum(['battle', 'treaty', 'political', 'campaign', 'atrocity', 'movement', 'famine', 'founding', 'revolt', 'law']),
    significance: z.number().int().min(1).max(5),
    participants: z.array(id).default([]),
    /** What happened. */
    summary: z.string(),
    /** Why it happened: the background a reader needs (D25). */
    context: z.string().optional(),
    /** What it changed. */
    consequences: z.string().optional(),
    /** Why it matters, in one line. */
    why: z.string().optional(),
    /** Events that led to this one; the reverse links ("led to") are derived. */
    causes: z.array(id).default([]),
    figures: z.array(Figure).default([]),
    perspectives: z.array(z.object({ view: z.string(), text: z.string() }).strict()).default([]),
    sources: cites,
  })
  .strict()
const Stop = z
  .object({
    date: dateStr,
    place: id.optional(),
    coords: lngLat.optional(),
    away: z.boolean().default(false),
    approx: z.boolean().optional(),
    note: z.string().optional(),
  })
  .strict()
  .refine((s) => s.away || s.place || s.coords, 'stop needs place, coords or away')
const Person = z
  .object({
    id,
    name: z.string(),
    tier: z.union([z.literal(1), z.literal(2)]),
    born: dateStr.optional(),
    died: dateStr.optional(),
    role: z.string(),
    summary: z.string(),
    perspectives: z.array(z.object({ view: z.string(), text: z.string() }).strict()).default([]),
    itinerary: z.array(Stop).default([]),
    sources: cites,
  })
  .strict()
const Camera = z
  .object({ center: lngLat, zoom: z.number(), pitch: z.number().optional(), bearing: z.number().optional() })
  .strict()
const Show = z
  .object({
    events: z.array(id).default([]),
    people: z.array(id).default([]),
    places: z.array(id).default([]),
    polities: z.array(id).default([]),
    /** Trade routes from trade.yaml. */
    trade: z.array(id).default([]),
    /** Draw the railway network as it stood at the scene's date. */
    railways: z.boolean().default(false),
  })
  .strict()
const Scene = z
  .object({
    id,
    t: dateStr,
    camera: Camera,
    title: z.string(),
    /** Narrative, paragraphs separated by blank lines. Explains why, not just what. */
    text: z.string(),
    /** What the map shows in this scene; everything else is hidden (D25). */
    show: Show.default({}),
    /** Highlighted polities keep their own colour; the rest of the map shows blocs. */
    select: z.object({ kind: z.enum(['event', 'place', 'person', 'polity', 'unit', 'trade']), id }).optional(),
    /** Play time forward to this date while the scene is open (e.g. a march). */
    play_to: dateStr.optional(),
    /** A chart from charts.yaml shown under the text. */
    chart: id.optional(),
    /** A period image: public domain or CC0 only, credited (D12, D21). */
    image: z
      .object({ src: z.string(), caption: z.string(), credit: z.string(), license: z.enum(['Public domain', 'CC0']), source: z.string().url() })
      .strict()
      .optional(),
  })
  .strict()
const Chapter = z
  .object({
    id,
    number: z.number().int(),
    title: z.string(),
    period: z.string(),
    /** Why this chapter matters to the whole story. */
    summary: z.string(),
    scenes: z.array(Scene).min(1),
  })
  .strict()

const Methods = z
  .object({
    sections: z.array(z.object({ title: z.string(), text: z.string() }).strict()),
    doubts: z.array(z.string()),
    gaps: z.array(z.string()),
  })
  .strict()

/** A stretch of railway, drawn from its opening date (D27). */
const Railway = z
  .object({
    id,
    /** Company or line name, e.g. "Great Indian Peninsula Railway". */
    line: z.string(),
    opened: dateStr,
    /** Waypoints along the route, [lng, lat]. */
    path: z.array(lngLat).min(2),
    note: z.string().optional(),
    sources: cites,
  })
  .strict()
/** A flow of goods or people, animated along its path while active (D27). */
const Trade = z
  .object({
    id,
    name: z.string(),
    goods: z.string(),
    /** export: out of India; import: into India; people: migration and indenture. */
    flow: z.enum(['export', 'import', 'people']),
    from: dateStr,
    to: dateStr,
    /** Sea or land waypoints from origin to destination or the map edge, [lng, lat]. */
    path: z.array(lngLat).min(2),
    /** Destination beyond the map edge, e.g. "London". */
    beyond: z.string().optional(),
    summary: z.string(),
    context: z.string().optional(),
    consequences: z.string().optional(),
    sources: cites,
  })
  .strict()

const errors: string[] = []
const fail = (where: string, msg: string) => errors.push(`${where}: ${msg}`)

function load<T>(file: string, schema: z.ZodType<T>): T[] {
  const raw = parse(readFileSync(join(CONTENT, file), 'utf8'))
  const items = Array.isArray(raw) ? raw : [raw]
  return items.flatMap((item, i) => {
    const r = schema.safeParse(item)
    if (r.success) return [r.data]
    for (const issue of r.error.issues) fail(`${file}[${item?.id ?? i}].${issue.path.join('.')}`, issue.message)
    return []
  })
}
const loadDir = <T>(dir: string, schema: z.ZodType<T>) =>
  readdirSync(join(CONTENT, dir))
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .flatMap((f) => load(join(dir, f), schema))

function uniqueIds(kind: string, items: { id: string }[]) {
  const seen = new Set<string>()
  for (const { id } of items) {
    if (seen.has(id)) fail(kind, `duplicate id "${id}"`)
    seen.add(id)
  }
}

const BLOC_BY_KIND: Record<string, 'british' | 'indian' | 'european' | 'other'> = {
  province: 'british',
  state: 'indian',
  polity: 'indian',
  power: 'european',
  tribal: 'other',
  foreign: 'other',
  dominion: 'other',
}
const defaultBloc = (k: string) => BLOC_BY_KIND[k]
const hexToRgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as never

// ---- load
const meta = load('meta.yaml', Meta)[0]
const sources = loadDir('sources', Source)
const polities = load('polities.yaml', Polity)
const keyframesRaw = load('territory.yaml', KeyframeRaw)
const places = loadDir('places', Place)
const events = loadDir('events', Event)
const people = loadDir('people', Person)
const chapters = loadDir('chapters', Chapter).sort((a, b) => a.number - b.number)
const eras = loadDir('eras', Era)
const methods = load('methods.yaml', Methods)[0]
const railways = existsSync(join(CONTENT, 'railways.yaml')) ? load('railways.yaml', Railway) : []
const trade = existsSync(join(CONTENT, 'trade.yaml')) ? load('trade.yaml', Trade) : []
uniqueIds('railways', railways)
uniqueIds('trade', trade)
const glossary = load('glossary.yaml', Term)
const charts = load('charts.yaml', Chart)

for (const [k, v] of Object.entries({ sources, polities, places, events, people, chapters })) uniqueIds(k, v)
uniqueIds('scenes', chapters.flatMap((c) => c.scenes))

const sourceIds = new Set(sources.map((s) => s.id))
const polityIds = new Set(polities.map((p) => p.id))
const placeById = new Map(places.map((p) => [p.id, p]))
const personIds = new Set(people.map((p) => p.id))
const eventIds = new Set(events.map((e) => e.id))

const units = JSON.parse(readFileSync(join(OUT, 'base', 'units-1941.geojson'), 'utf8')).features.map(
  (f: { properties: { id: string; name: string; division: string; type: string | null } }) => f.properties,
) as { id: string; name: string; division: string; type: string | null }[]
const unitIds = new Set(units.map((u) => u.id))

function checkCites(where: string, ids: string[]) {
  for (const s of ids) if (!sourceIds.has(s)) fail(where, `unknown source "${s}"`)
}

for (const p of polities) checkCites(`polities.yaml[${p.id}]`, p.sources)
for (const p of people) checkCites(`people[${p.id}]`, p.sources)

// ---- territory: expand selectors, accumulate state
/**
 * Selector grammar, space-separated tokens:
 *   <unit-id>                    one unit
 *   division:<Division>[|filter] every unit in a division; filter is british, princely or proxy
 *   -<unit-id>                   remove a unit from the set built so far
 */
const isPrincely = (u: (typeof units)[number]) => /princely/i.test(u.type ?? '')
const isProxy = (u: (typeof units)[number]) => u.type === 'Proxy'
function expand(where: string, selector: string): string[] {
  const out = new Set<string>()
  for (const tok of selector.trim().split(/\s+/)) {
    if (tok.startsWith('-')) {
      const u = tok.slice(1)
      if (!out.delete(u)) fail(where, `cannot remove "${u}": not in "${selector}"`)
    } else if (tok.startsWith('division:')) {
      const [div, filter] = tok.slice('division:'.length).split('|')
      const divName = div.replace(/_/g, ' ')
      const hit = units.filter(
        (u) =>
          u.division === divName &&
          (!filter ||
            (filter === 'princely' && isPrincely(u)) ||
            (filter === 'proxy' && isProxy(u)) ||
            (filter === 'british' && !isPrincely(u) && !isProxy(u) && u.type === 'British districts')),
      )
      if (!hit.length) fail(where, `no units match "${tok}"`)
      hit.forEach((u) => out.add(u.id))
    } else if (unitIds.has(tok)) out.add(tok)
    else fail(where, `unknown unit "${tok}"`)
  }
  return [...out]
}

const keyframes: Keyframe[] = []
let state: Record<string, string> = {}
let lastT = -Infinity
keyframesRaw.forEach((k, i) => {
  const where = `territory.yaml[${k.date}]`
  checkCites(where, k.sources)
  // assign = full reset of the map; changes = incremental. The first keyframe must assign.
  if (!!k.assign === !!k.changes) fail(where, 'use exactly one of assign or changes')
  if (i === 0 && !k.assign) fail(where, 'first keyframe must use assign')
  const date = parseDate(k.date)
  if (date.t <= lastT) fail(where, 'keyframes must be in chronological order')
  lastT = date.t
  const next: Record<string, string> = k.assign ? {} : { ...state }
  const touched = new Set<string>()
  for (const [polity, sels] of Object.entries(k.assign ?? k.changes ?? {})) {
    if (!polityIds.has(polity)) fail(where, `unknown polity "${polity}"`)
    for (const sel of sels)
      for (const u of expand(where, sel)) {
        if (touched.has(u)) fail(where, `unit "${u}" assigned twice`)
        touched.add(u)
        next[u] = polity
      }
  }
  state = next
  keyframes.push({ date, certainty: k.certainty, note: k.note, sources: k.sources, units: next })
})

// ---- places
const compiledPlaces = places.map((p) => {
  checkCites(`places.yaml[${p.id}]`, p.sources)
  for (const c of p.control) if (!polityIds.has(c.power)) fail(`places.yaml[${p.id}]`, `unknown power "${c.power}"`)
  return {
    id: p.id,
    name: p.name,
    modern: p.modern,
    coords: p.coords as LngLat,
    approx: p.approx,
    tags: p.tags,
    why: p.why,
    control: p.control.map((c) => ({ date: parseDate(c.from, c.approx), power: c.power, note: c.note })),
    sources: p.sources,
  }
})

// ---- events
const compiledEvents = events
  .map((e) => {
    const where = `events.yaml[${e.id}]`
    checkCites(where, e.sources)
    e.figures.forEach((f) => {
      checkCites(where, f.sources)
      if (f.min > f.max) fail(where, `figure "${f.label}" min > max`)
    })
    const place = e.place ? placeById.get(e.place) : undefined
    if (e.place && !place) fail(where, `unknown place "${e.place}"`)
    for (const p of e.participants) if (!personIds.has(p)) fail(where, `unknown participant "${p}"`)
    for (const c of e.causes) if (!eventIds.has(c)) fail(where, `unknown cause "${c}"`)
    return {
      id: e.id,
      name: e.name,
      altNames: e.alt_names,
      date: parseDate(e.date, e.approx),
      end: e.end ? parseDate(e.end) : undefined,
      place: e.place,
      coords: place?.coords as LngLat | undefined,
      kind: e.kind,
      significance: e.significance,
      participants: e.participants,
      summary: e.summary,
      context: e.context,
      consequences: e.consequences,
      why: e.why,
      causes: e.causes,
      ledTo: events.filter((x) => x.causes.includes(e.id)).map((x) => x.id),
      figures: e.figures,
      perspectives: e.perspectives,
      sources: e.sources,
    }
  })
  .sort((a, b) => a.date.t - b.date.t)

// ---- people
const compiledPeople = people.map((p) => {
  const where = `people[${p.id}]`
  checkCites(where, p.sources)
  let prev = -Infinity
  const itinerary = p.itinerary.map((s) => {
    const date = parseDate(s.date, s.approx)
    if (date.t < prev) fail(where, `itinerary out of order at ${s.date}`)
    prev = date.t
    const place = s.place ? placeById.get(s.place) : undefined
    if (s.place && !place) fail(where, `unknown place "${s.place}"`)
    return { date, place: s.place, coords: (place?.coords ?? s.coords) as LngLat | undefined, away: s.away, note: s.note }
  })
  return {
    id: p.id,
    name: p.name,
    tier: p.tier,
    born: p.born ? parseDate(p.born) : undefined,
    died: p.died ? parseDate(p.died) : undefined,
    role: p.role,
    summary: p.summary,
    perspectives: p.perspectives,
    itinerary,
    sources: p.sources,
  }
})

// ---- stories
for (const r of railways) checkCites(`railways.yaml[${r.id}]`, r.sources)
for (const r of trade) checkCites(`trade.yaml[${r.id}]`, r.sources)
const selectable: Record<string, Set<string>> = {
  event: eventIds,
  person: personIds,
  place: new Set(placeById.keys()),
  polity: polityIds,
  unit: unitIds,
  trade: new Set(trade.map((r) => r.id)),
}
const compiledChapters = chapters.map((c) => {
  let prev = -Infinity
  return {
    id: c.id,
    number: c.number,
    title: c.title,
    period: c.period,
    summary: c.summary,
    scenes: c.scenes.map((sc) => {
      const where = `chapters[${c.id}].${sc.id}`
      if (sc.chart && !charts.some((c) => c.id === sc.chart)) fail(where, `unknown chart "${sc.chart}"`)
      if (sc.select && !selectable[sc.select.kind].has(sc.select.id)) fail(where, `unknown ${sc.select.kind} "${sc.select.id}"`)
      for (const [kind, ids] of [['event', sc.show.events], ['person', sc.show.people], ['place', sc.show.places], ['polity', sc.show.polities], ['trade', sc.show.trade]] as const)
        for (const x of ids) if (!selectable[kind].has(x)) fail(where, `unknown ${kind} "${x}"`)
      const date = parseDate(sc.t)
      if (date.t < prev) fail(where, 'scenes must be in chronological order')
      prev = date.t
      return {
        id: sc.id,
        date,
        camera: sc.camera as never,
        title: sc.title,
        text: sc.text,
        show: sc.show,
        select: sc.select,
        playTo: sc.play_to ? parseDate(sc.play_to) : undefined,
        chart: sc.chart,
        image: sc.image,
      }
    }),
  }
})

for (const g of glossary) checkCites(`glossary.yaml[${g.id}]`, g.sources)
// ---- charts
const geoFeatures = JSON.parse(readFileSync(join(OUT, 'base', 'units-1941.geojson'), 'utf8')).features as {
  properties: { id: string; division: string }
  geometry: { type: string; coordinates: number[][][] | number[][][][] }
}[]
/** Unit area on the sphere, roughly: planar ring area scaled by cos(latitude). */
function unitArea(g: (typeof geoFeatures)[number]['geometry']) {
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][]
  let a = 0
  for (const poly of polys)
    poly.forEach((ring, i) => {
      let r = 0
      for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) r += ring[j][0] * ring[k][1] - ring[k][0] * ring[j][1]
      const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length
      a += (i === 0 ? 1 : -1) * Math.abs(r / 2) * Math.cos((lat * Math.PI) / 180)
    })
  return a
}
const subcontinent = geoFeatures.filter((f) => !f.properties.division.startsWith('MMR:'))
const areaOf = new Map(subcontinent.map((f) => [f.properties.id, unitArea(f.geometry)]))
const totalArea = [...areaOf.values()].reduce((s, x) => s + x, 0)
const polityBloc = new Map(polities.map((p) => [p.id, p.bloc ?? defaultBloc(p.kind)]))
const compiledCharts = charts.map((c) => {
  checkCites(`charts.yaml[${c.id}]`, c.sources)
  let points = c.points
  if (c.computed === 'british-share')
    points = keyframes
      .filter((k) => k.date.t < 1947.6)
      .map((k) => {
        let a = 0
        for (const [u, p] of Object.entries(k.units)) if (polityBloc.get(p) === 'british') a += areaOf.get(u) ?? 0
        return [Math.round(k.date.t * 100) / 100, Math.round((1000 * a) / totalArea) / 10] as [number, number]
      })
  // Hold the last value to the end of British rule.
  if (c.computed === 'british-share' && points?.length) points.push([1947.6, points[points.length - 1][1]])
  const ranges = (c.events ?? []).map((eid) => {
    const e = events.find((x) => x.id === eid)
    if (!e) fail(`charts.yaml[${c.id}]`, `unknown event "${eid}"`)
    const f = e?.figures.find((x) => x.label === c.figure)
    if (e && !f) fail(`charts.yaml[${c.id}]`, `event "${eid}" has no figure "${c.figure}"`)
    return { event: eid, label: e?.name ?? eid, year: e ? parseDate(e.date).t : 0, min: (f?.min ?? 0) / c.scale, max: (f?.max ?? 0) / c.scale }
  })
  return { id: c.id, kind: c.kind, step: c.computed === 'british-share', title: c.title, subtitle: c.subtitle, unit: c.unit, points: points ?? [], ranges, note: c.note, sources: c.sources }
})

const compiledEras = eras.map((e) => {
  checkCites(`eras.yaml[${e.id}]`, e.sources)
  return { id: e.id, kind: e.kind, name: e.name, from: parseDate(e.from), to: parseDate(e.to), sources: e.sources }
})

if (errors.length) {
  console.error(`Content validation failed (${errors.length}):\n  ` + errors.join('\n  '))
  process.exit(1)
}

const content: Content = {
  status: 'draft',
  title: meta.title,
  subtitle: meta.subtitle,
  range: meta.range,
  sources: Object.fromEntries(sources.map((s) => [s.id, s])),
  polities: Object.fromEntries(
    polities.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        altNames: p.alt_names,
        names: p.names.map((n) => ({ date: parseDate(n.from), name: n.name })),
        kind: p.kind,
        bloc: p.bloc ?? defaultBloc(p.kind),
        color: hexToRgb(p.color),
        summary: p.summary,
        sources: p.sources,
      },
    ]),
  ),
  keyframes,
  places: compiledPlaces,
  events: compiledEvents,
  people: compiledPeople,
  chapters: compiledChapters,
  unitNames: Object.fromEntries(units.map((u) => [u.id, u.name])),
  eras: compiledEras,
  charts: compiledCharts,
  methods,
  railways: railways.map((r) => ({ id: r.id, line: r.line, opened: parseDate(r.opened), path: r.path, note: r.note, sources: r.sources })),
  trade: trade.map((r) => ({ ...r, from: parseDate(r.from), to: parseDate(r.to) })),
  glossary: glossary.map((g) => ({ id: g.id, term: g.term, aliases: g.aliases, definition: g.definition })),
}
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'content.json'), JSON.stringify(content))
console.log(
  `content.json: ${polities.length} polities, ${keyframes.length} keyframes, ${places.length} places, ` +
    `${events.length} events, ${people.length} people, ${chapters.length} chapters (${chapters.reduce((n, c) => n + c.scenes.length, 0)} scenes)`,
)
