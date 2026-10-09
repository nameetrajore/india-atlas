import { useEffect, useMemo, useRef, useState } from 'react'
import { journeySteps, useStore } from '../store'
import { followable } from './Journey'
import { personAt, polityName } from '../lib/derive'
import type { Content, LngLat } from '../types'
import { badgeUrl } from './icons'

type Kind = 'scene' | 'event' | 'person' | 'place' | 'polity' | 'term' | 'trade' | 'journey'
interface Entry {
  kind: Kind
  id: string
  title: string
  sub: string
  /** Lower-cased, accent-free haystacks: names weigh more than body text. */
  names: string[]
  body: string
  icon?: string
  run: () => void
}

const KIND_LABEL: Record<Kind, string> = { scene: 'Story', event: 'Event', person: 'Person', place: 'Place', polity: 'Polity', term: 'Term', trade: 'Trade', journey: 'Journey' }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Jump the map to explore mode at a date and place. */
function explore(t: number | undefined, at: LngLat | undefined, zoom: number) {
  const s = useStore.getState()
  if (s.mode !== 'explore') s.setMode('explore')
  if (t !== undefined) s.setT(t, { announce: false })
  if (at) s.requestFly({ center: at, zoom, pitch: 0, bearing: 0 })
}

function buildIndex(c: Content): Entry[] {
  const s = () => useStore.getState()
  const out: Entry[] = []
  c.chapters.forEach((ch, ci) =>
    ch.scenes.forEach((sc, si) =>
      out.push({
        kind: 'scene',
        id: sc.id,
        title: sc.title,
        sub: `Chapter ${ch.number} · ${ch.title} · ${sc.date.label}`,
        names: [norm(sc.title), norm(ch.title)],
        body: norm(sc.text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')),
        run: () => s().openChapter(ci, si),
      }),
    ),
  )
  for (const e of c.events)
    out.push({
      kind: 'event',
      id: e.id,
      title: e.name,
      sub: `${e.date.label}${e.place ? ` · ${c.places.find((p) => p.id === e.place)?.name ?? ''}` : ''}`,
      names: [e.name, ...e.altNames].map(norm),
      body: norm(`${e.summary} ${e.context ?? ''}`),
      icon: badgeUrl(e.kind),
      run: () => {
        explore(e.date.t + 0.001, e.coords, 6.5)
        s().select({ kind: 'event', id: e.id })
      },
    })
  for (const p of c.people)
    out.push({
      kind: 'person',
      id: p.id,
      title: p.name,
      sub: p.role,
      names: [norm(p.name)],
      body: norm(p.summary),
      run: () => {
        const first = p.itinerary.find((x) => !x.away && x.coords)
        const now = personAt(p, s().t)
        if (p.itinerary.length) explore(now ? undefined : first?.date.t, now?.position ?? first?.coords, 6)
        s().select({ kind: 'person', id: p.id })
      },
    })
  for (const p of c.places)
    out.push({
      kind: 'place',
      id: p.id,
      title: p.name,
      sub: p.modern && p.modern !== p.name ? `now ${p.modern}` : p.tags.join(' · '),
      names: [p.name, p.modern ?? ''].map(norm),
      body: norm(p.why ?? ''),
      run: () => {
        explore(undefined, p.coords, 7.2)
        s().select({ kind: 'place', id: p.id })
      },
    })
  for (const p of Object.values(c.polities))
    out.push({
      kind: 'polity',
      id: p.id,
      title: p.name,
      sub: p.names.length > 1 ? `also ${p.names.map((n) => n.name).filter((n) => n !== p.name).join(', ')}` : p.altNames.join(', '),
      names: [p.name, ...p.altNames, ...p.names.map((n) => n.name)].map(norm),
      body: norm(p.summary),
      run: () => {
        // If the polity isn't on the map at the current date, jump to when it first appears.
        const now = [...c.keyframes].reverse().find((k) => k.date.t <= s().t)
        const onMap = now && Object.values(now.units).includes(p.id)
        const first = c.keyframes.find((k) => Object.values(k.units).includes(p.id))
        if (!onMap && first) explore(first.date.t + 0.001, undefined, 0)
        s().select({ kind: 'polity', id: p.id })
      },
    })
  for (const r of c.trade)
    out.push({
      kind: 'trade',
      id: r.id,
      title: r.name,
      sub: `${r.goods} · ${r.from.label}–${r.to.label}`,
      names: [r.name, r.goods].map(norm),
      body: norm(`${r.summary} ${r.context ?? ''}`),
      run: () => {
        s().setEcon(true)
        explore(r.from.t + Math.min(20, (r.to.t - r.from.t) / 2), undefined, 0)
        s().select({ kind: 'trade', id: r.id })
      },
    })
  for (const p of followable(c))
    out.push({
      kind: 'journey',
      id: p.id,
      title: `Follow ${p.name}`,
      sub: `${journeySteps(p).length} stops`,
      names: [norm(p.name)],
      body: '',
      run: () => s().startJourney(p.id),
    })
  for (const g of c.glossary)
    out.push({ kind: 'term', id: g.id, title: g.term, sub: g.definition, names: [g.term, ...g.aliases].map(norm), body: '', run: () => {} })
  return out
}

function score(e: Entry, q: string, words: string[]) {
  let best = 0
  for (const n of e.names) {
    if (!n) continue
    if (n === q) best = Math.max(best, 100)
    else if (n.startsWith(q)) best = Math.max(best, 80)
    else if (n.split(/[\s(),-]+/).some((w) => w.startsWith(q))) best = Math.max(best, 65)
    else if (n.includes(q)) best = Math.max(best, 50)
  }
  if (!best && words.every((w) => e.names.some((n) => n.includes(w)))) best = 45
  if (!best && e.body && words.every((w) => e.body.includes(w))) best = 20
  // Story scenes first among equals: they explain, the rest describe.
  return best ? best + (e.kind === 'scene' ? 3 : 0) : 0
}

export function Search({ onClose }: { onClose: () => void }) {
  const content = useStore((s) => s.content)
  const t = useStore((s) => s.t)
  const index = useMemo(() => (content ? buildIndex(content) : []), [content])
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const results = useMemo(() => {
    const nq = norm(q.trim())
    if (nq.length < 2) return []
    const words = nq.split(/\s+/)
    return index
      .map((e) => ({ e, s: score(e, nq, words) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title))
      .slice(0, 24)
      .map((x) => x.e)
  }, [q, index])

  const choose = (e: Entry | undefined) => {
    if (!e) return
    if (e.kind === 'term') return
    e.run()
    onClose()
  }

  return (
    <div className="search-backdrop" onClick={onClose}>
      <div className="search" role="dialog" aria-label="Search" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="search-input"
          placeholder="Search people, places, events, story…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(results.length - 1, a + 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            }
            if (e.key === 'Enter') choose(results[active])
            if (e.key === 'Escape') onClose()
          }}
        />
        <ul className="search-results">
          {results.map((r, i) => (
            <li key={`${r.kind}:${r.id}`}>
              <button
                className={`search-result${i === active ? ' on' : ''}${r.kind === 'term' ? ' term-result' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r)}
              >
                <span className="sr-kind">{r.icon ? <img src={r.icon} width={14} height={14} alt="" /> : null}{KIND_LABEL[r.kind]}</span>
                <span className="sr-main">
                  <span className="sr-title">{r.kind === 'polity' ? polityName(content!.polities[r.id], t) : r.title}</span>
                  <span className="sr-sub">{r.sub}</span>
                </span>
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && !results.length && <li className="search-empty">Nothing found for “{q}”.</li>}
          {q.trim().length < 2 && (
            <li className="search-empty">Try “Plassey”, “Kolkata”, “Tipu”, “diwani”, “salt”.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
