import type { ReactNode } from 'react'
import { useStore } from '../store'
import { controlAt, keyframeIndexAt, personAt, polityName, visitsToPlace } from '../lib/derive'
import { kindDef } from './icons'
import { formatT } from '../lib/time'
import type { CDate, Content, Figure, Selection } from '../types'

const rgb = (c: [number, number, number]) => `rgb(${c.join(',')})`
const KIND_LABEL: Record<string, string> = {
  province: 'British India · province',
  state: 'Princely state',
  power: 'European power',
  polity: 'Polity',
  tribal: 'Tribal territory',
  foreign: 'Outside British India',
  dominion: 'Independent dominion',
}
const fmt = (n: number) => n.toLocaleString('en-IN')

function Link({ to, t, children }: { to: Selection; t?: number; children: ReactNode }) {
  const { select, setT } = useStore.getState()
  return (
    <button
      className="link"
      onClick={() => {
        if (t !== undefined) setT(t)
        select(to)
      }}
    >
      {children}
    </button>
  )
}

function Sources({ ids, content }: { ids: string[]; content: Content }) {
  return (
    <section className="sources">
      <h4>Sources</h4>
      <ol>
        {ids.map((id) => {
          const s = content.sources[id]
          return (
            <li key={id}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Figures({ figures }: { figures: Figure[] }) {
  if (!figures.length) return null
  return (
    <section>
      <h4>Disputed figures</h4>
      {figures.map((f) => (
        <div key={f.label} className="figure">
          <div className="figure-label">{f.label}</div>
          <div className="figure-range">
            {fmt(f.min)}–{fmt(f.max)}
          </div>
          {f.note && <div className="figure-note">{f.note}</div>}
        </div>
      ))}
    </section>
  )
}

const span = (a?: CDate, b?: CDate) => [a?.label, b?.label].filter(Boolean).join(' – ')

function Card({ kicker, title, sub, children }: { kicker: string; title: string; sub?: ReactNode; children: ReactNode }) {
  const select = useStore((s) => s.select)
  return (
    <aside className="card">
      <button className="card-close" onClick={() => select(null)} aria-label="Close">
        ×
      </button>
      <div className="kicker">
        {kicker} <span className="draft" title="Agent-drafted, awaiting human review (D6)">Draft</span>
      </div>
      <h2>{title}</h2>
      {sub && <div className="card-sub">{sub}</div>}
      <div className="card-body">{children}</div>
    </aside>
  )
}

export function InfoCard() {
  const content = useStore((s) => s.content)
  const sel = useStore((s) => s.selection)
  const t = useStore((s) => s.t)
  if (!content || !sel) return null

  if (sel.kind === 'event') {
    const e = content.events.find((x) => x.id === sel.id)
    if (!e) return null
    const place = content.places.find((p) => p.id === e.place)
    const people = e.participants.map((id) => content.people.find((p) => p.id === id)!).filter(Boolean)
    return (
      <Card kicker={kindDef(e.kind).label} title={e.name} sub={<>{span(e.date, e.end)} · <Link to={{ kind: 'place', id: e.place }}>{place?.name}</Link></>}>
        {e.altNames.length > 0 && <p className="alt">Also called {e.altNames.join(', ')}</p>}
        <p>{e.summary}</p>
        {e.why && (
          <section>
            <h4>Why it matters</h4>
            <p>{e.why}</p>
          </section>
        )}
        <Figures figures={e.figures} />
        {people.length > 0 && (
          <section>
            <h4>People</h4>
            <ul className="plain">
              {people.map((p) => (
                <li key={p.id}>
                  <Link to={{ kind: 'person', id: p.id }}>{p.name}</Link> <span className="muted">{p.role}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Sources ids={e.sources} content={content} />
      </Card>
    )
  }

  if (sel.kind === 'place') {
    const p = content.places.find((x) => x.id === sel.id)
    if (!p) return null
    const events = content.events.filter((e) => e.place === p.id)
    const visits = visitsToPlace(content, p.id)
    const now = controlAt(p, t)
    return (
      <Card kicker={p.tags.join(' · ')} title={p.name} sub={p.modern && p.modern !== p.name ? `today ${p.modern}` : undefined}>
        {p.approx && <p className="muted">Location approximate.</p>}
        {p.why && (
          <section>
            <h4>Why it matters</h4>
            <p>{p.why}</p>
          </section>
        )}
        {p.control.length > 0 && (
          <section>
            <h4>Held by</h4>
            <ul className="plain control">
              {p.control.map((c) => (
                <li key={c.date.t} className={c === now ? 'current' : ''}>
                  <span className="swatch" style={{ background: rgb(content.polities[c.power].color) }} />
                  <button className="link" onClick={() => useStore.getState().setT(c.date.t + 0.001)}>
                    {c.date.label}
                  </button>{' '}
                  {polityName(content.polities[c.power], t)}
                  {c.note && <div className="muted">{c.note}</div>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {(events.length > 0 || visits.length > 0) && (
          <section>
            <h4>Timeline</h4>
            <ul className="plain timeline-list">
              {[
                ...events.map((e) => ({ t: e.date.t, label: e.date.label, node: <Link to={{ kind: 'event', id: e.id }} t={e.date.t}>{e.name}</Link> })),
                ...visits.map((v) => ({
                  t: v.date.t,
                  label: v.date.label,
                  node: (
                    <>
                      <Link to={{ kind: 'person', id: v.person.id }} t={v.date.t}>{v.person.name}</Link>
                      {v.note && <span className="muted">: {v.note}</span>}
                    </>
                  ),
                })),
              ]
                .sort((a, b) => a.t - b.t)
                .map((row, i) => (
                  <li key={i}>
                    <span className="date">{row.label}</span> {row.node}
                  </li>
                ))}
            </ul>
          </section>
        )}
        <Sources ids={p.sources} content={content} />
      </Card>
    )
  }

  if (sel.kind === 'person') {
    const p = content.people.find((x) => x.id === sel.id)
    if (!p) return null
    const state = personAt(p, t)
    const events = content.events.filter((e) => e.participants.includes(p.id))
    const last = state ? p.itinerary[state.lastStop] : undefined
    const lastPlace = last?.place ? content.places.find((x) => x.id === last.place) : undefined
    return (
      <Card kicker={`${p.role}`} title={p.name} sub={span(p.born, p.died)}>
        {p.itinerary.length > 0 && (
          <p className="whereabouts">
            {state && state.opacity >= 0.99
              ? <>In {formatT(t, 'month')}: {lastPlace?.name ?? 'travelling'}{state.moving ? ' (travelling)' : ''}</>
              : last
                ? <>Location unknown. Last recorded at {lastPlace?.name ?? 'an unmapped place'}, {last.date.label}.</>
                : <>Not on the map at this date.</>}
          </p>
        )}
        <p>{p.summary}</p>
        {p.perspectives.length > 0 && (
          <section>
            <h4>Perspectives</h4>
            {p.perspectives.map((v) => (
              <div key={v.view} className="perspective">
                <div className="perspective-view">{v.view}</div>
                <p>{v.text}</p>
              </div>
            ))}
          </section>
        )}
        {p.itinerary.length > 0 && (
          <section>
            <h4>Itinerary</h4>
            <ul className="plain timeline-list">
              {p.itinerary.map((s, i) => {
                const pl = s.place ? content.places.find((x) => x.id === s.place) : undefined
                return (
                  <li key={i}>
                    <button className="link date" onClick={() => useStore.getState().setT(s.date.t + 0.001)}>
                      {s.date.label}
                    </button>{' '}
                    {s.away ? <span className="muted">off the map</span> : pl ? <Link to={{ kind: 'place', id: pl.id }}>{pl.name}</Link> : null}
                    {s.note && <span className="muted">: {s.note}</span>}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        {events.length > 0 && (
          <section>
            <h4>Events</h4>
            <ul className="plain timeline-list">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="date">{e.date.label}</span> <Link to={{ kind: 'event', id: e.id }} t={e.date.t}>{e.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Sources ids={p.sources} content={content} />
      </Card>
    )
  }

  // unit or polity
  const ki = keyframeIndexAt(content.keyframes, t)
  const kf = ki >= 0 ? content.keyframes[ki] : undefined
  const polityId = sel.kind === 'polity' ? sel.id : kf?.units[sel.id]
  const polity = polityId ? content.polities[polityId] : undefined
  const unitName = sel.kind === 'unit' ? content.unitNames?.[sel.id] ?? sel.id.split('--')[1]?.replace(/-/g, ' ') : undefined
  const changes = content.keyframes.filter((k, i) => {
    const prev = content.keyframes[i - 1]?.units ?? {}
    return Object.entries(k.units).some(([u, p]) => p === polityId && prev[u] !== p) ||
      Object.entries(prev).some(([u, p]) => p === polityId && k.units[u] !== p)
  })
  if (!polity) {
    return (
      <Card kicker="Territory" title="Not yet mapped" sub={unitName && <span>{unitName} (1941 unit)</span>}>
        <p>Who controlled this area in {formatT(t, 'year')} is not yet in the dataset. It is left blank rather than guessed.</p>
      </Card>
    )
  }
  return (
    <Card
      kicker={KIND_LABEL[polity.kind]}
      title={polityName(polity, t)}
      sub={unitName && <span>{unitName} (1941 unit) in {formatT(t, 'year')}</span>}
    >
      <div className="swatch-bar" style={{ background: rgb(polity.color) }} />
      {polity.altNames.length > 0 && <p className="alt">Also called {polity.altNames.join(', ')}</p>}
      <p>{polity.summary}</p>
      {polity.names.length > 1 && (
        <section>
          <h4>Names</h4>
          <ul className="plain timeline-list">
            {polity.names.map((n) => (
              <li key={n.date.t}>
                <span className="date">{n.date.label}</span> {n.name}
              </li>
            ))}
          </ul>
        </section>
      )}
      {kf && sel.kind === 'unit' && (
        <p className="muted">
          Border certainty: {kf.certainty}. Borders are drawn from 1941 district units, so 18th-century frontiers are
          approximate.
        </p>
      )}
      {changes.length > 0 && (
        <section>
          <h4>Territorial changes</h4>
          <ul className="plain timeline-list">
            {changes.map((k) => (
              <li key={k.date.t}>
                <button className="link date" onClick={() => useStore.getState().setT(k.date.t + 0.001)}>
                  {k.date.label}
                </button>{' '}
                {k.note}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Sources ids={[...new Set([...polity.sources, ...(kf && sel.kind === 'unit' ? kf.sources : [])])]} content={content} />
    </Card>
  )
}
