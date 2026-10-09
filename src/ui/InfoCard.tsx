import { useState, type ReactNode } from 'react'
import { useStore } from '../store'
import { controlAt, keyframeIndexAt, personAt, polityName, visitsToPlace } from '../lib/derive'
import { formatT } from '../lib/time'
import type { Content, Figure, HistEvent, LngLat, Selection } from '../types'
import { badgeUrl, kindDef } from './icons'
import { Prose } from './Prose'
import { useToday, whereToday } from '../map/today'

const rgb = (c: [number, number, number]) => `rgb(${c.join(',')})`
const fmt = (n: number) => n.toLocaleString('en-IN')
const KIND_LABEL: Record<string, string> = {
  province: 'British India · province',
  state: 'Princely state',
  power: 'European company',
  polity: 'Indian power',
  tribal: 'Tribal territory',
  foreign: 'Outside British India',
  dominion: 'Independent dominion',
}

function Link({ to, t, children }: { to: Selection; t?: number; children: ReactNode }) {
  const { select, setT, mode } = useStore.getState()
  return (
    <button
      className="link"
      onClick={() => {
        if (t !== undefined && mode === 'explore') setT(t, { announce: false })
        select(to)
      }}
    >
      {children}
    </button>
  )
}

function EventChip({ e }: { e: HistEvent }) {
  return (
    <Link to={{ kind: 'event', id: e.id }} t={e.date.t}>
      <span className="ev-chip">
        <img src={badgeUrl(e.kind)} width={15} height={15} alt="" />
        <span>
          {e.name} <span className="muted">· {e.date.label}</span>
        </span>
      </span>
    </Link>
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

function More({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="more">
      <button className="more-btn" onClick={() => setOpen(!open)}>
        {open ? 'Less' : 'More: figures, perspectives, sources'}
      </button>
      {open && <div className="more-body">{children}</div>}
    </div>
  )
}

function Today({ at }: { at?: LngLat }) {
  const idx = useToday()
  if (!idx || !at) return null
  const where = whereToday(idx, at)
  return where ? <div className="today-line">Today: {where}</div> : null
}

function Card({ kicker, title, sub, children }: { kicker: ReactNode; title: string; sub?: ReactNode; children: ReactNode }) {
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

const Section = ({ title, text }: { title: string; text?: string }) =>
  text ? (
    <section>
      <h4>{title}</h4>
      <Prose text={text} />
    </section>
  ) : null

export function InfoCard() {
  const content = useStore((s) => s.content)
  const sel = useStore((s) => s.selection)
  const t = useStore((s) => s.t)
  if (!content || !sel) return null
  const evById = (id: string) => content.events.find((e) => e.id === id)

  if (sel.kind === 'event') {
    const e = evById(sel.id)
    if (!e) return null
    const place = content.places.find((p) => p.id === e.place)
    const people = e.participants.map((id) => content.people.find((p) => p.id === id)!).filter(Boolean)
    const causes = e.causes.map(evById).filter(Boolean) as HistEvent[]
    const ledTo = e.ledTo.map(evById).filter(Boolean) as HistEvent[]
    const d = kindDef(e.kind)
    return (
      <Card
        kicker={<span style={{ color: d.color }}>{d.label}</span>}
        title={e.name}
        sub={
          <>
            {e.date.label}
            {e.end ? ` – ${e.end.label}` : ''}
            {place && (
              <>
                {' · '}
                <Link to={{ kind: 'place', id: place.id }}>{place.name}</Link>
              </>
            )}
          </>
        }
      >
        <Today at={place?.coords} />
        {e.altNames.length > 0 && <p className="alt">Also called {e.altNames.join(', ')}</p>}
        {e.why && <p className="why-line">{e.why}</p>}
        <Section title="Why it happened" text={e.context} />
        <Section title="What happened" text={e.summary} />
        <Section title="What it changed" text={e.consequences} />
        {(causes.length > 0 || ledTo.length > 0) && (
          <section className="chain">
            {causes.length > 0 && (
              <div>
                <h4>Because of</h4>
                {causes.map((c) => (
                  <EventChip key={c.id} e={c} />
                ))}
              </div>
            )}
            {ledTo.length > 0 && (
              <div>
                <h4>Led to</h4>
                {ledTo.map((c) => (
                  <EventChip key={c.id} e={c} />
                ))}
              </div>
            )}
          </section>
        )}
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
        <More>
          <Figures figures={e.figures} />
          {e.perspectives.length > 0 && (
            <section>
              <h4>Perspectives</h4>
              {e.perspectives.map((v) => (
                <div key={v.view} className="perspective">
                  <div className="perspective-view">{v.view}</div>
                  <p>{v.text}</p>
                </div>
              ))}
            </section>
          )}
          <Sources ids={e.sources} content={content} />
        </More>
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
      <Card kicker={p.tags.join(' · ')} title={p.name} sub={p.modern && p.modern !== p.name ? `now ${p.modern}` : undefined}>
        <Today at={p.coords} />
        {p.approx && <p className="muted">Location approximate.</p>}
        {p.why && <Prose text={p.why} />}
        {p.control.length > 0 && (
          <section>
            <h4>Held by</h4>
            <ul className="plain control">
              {p.control.map((c) => (
                <li key={c.date.t} className={c === now ? 'current' : ''}>
                  <span className="swatch" style={{ background: rgb(content.polities[c.power].color) }} />
                  <span className="date">{c.date.label}</span> {polityName(content.polities[c.power], c.date.t)}
                  {c.note && <div className="muted">{c.note}</div>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {(events.length > 0 || visits.length > 0) && (
          <section>
            <h4>What happened here</h4>
            <ul className="plain timeline-list">
              {[
                ...events.map((e) => ({ t: e.date.t, node: <EventChip e={e} /> })),
                ...visits.map((v) => ({
                  t: v.date.t,
                  node: (
                    <>
                      <span className="date">{v.date.label}</span> <Link to={{ kind: 'person', id: v.person.id }}>{v.person.name}</Link>
                      {v.note && <span className="muted">: {v.note}</span>}
                    </>
                  ),
                })),
              ]
                .sort((a, b) => a.t - b.t)
                .map((row, i) => (
                  <li key={i}>{row.node}</li>
                ))}
            </ul>
          </section>
        )}
        <More>
          <Sources ids={p.sources} content={content} />
        </More>
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
      <Card kicker={p.role} title={p.name} sub={[p.born?.label, p.died?.label].filter(Boolean).join(' – ')}>
        {p.itinerary.length > 0 && (
          <p className="whereabouts">
            {state && state.opacity >= 0.99 ? (
              <>
                {formatT(t, 'month')}: {lastPlace?.name ?? 'travelling'}
                {last?.note ? `: ${last.note}` : ''}
              </>
            ) : last ? (
              <>
                Location unknown. Last recorded at {lastPlace?.name ?? 'an unmapped place'}, {last.date.label}.
              </>
            ) : (
              <>Not on the map at this date.</>
            )}
          </p>
        )}
        <Prose text={p.summary} />
        {events.length > 0 && (
          <section>
            <h4>In the story</h4>
            {events.map((e) => (
              <EventChip key={e.id} e={e} />
            ))}
          </section>
        )}
        <More>
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
                      <span className="date">{s.date.label}</span>{' '}
                      {s.away ? <span className="muted">off the map</span> : pl ? <Link to={{ kind: 'place', id: pl.id }}>{pl.name}</Link> : null}
                      {s.note && <span className="muted">: {s.note}</span>}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          <Sources ids={p.sources} content={content} />
        </More>
      </Card>
    )
  }

  // unit or polity
  const ki = keyframeIndexAt(content.keyframes, t)
  const kf = ki >= 0 ? content.keyframes[ki] : undefined
  const polityId = sel.kind === 'polity' ? sel.id : kf?.units[sel.id]
  const polity = polityId ? content.polities[polityId] : undefined
  const unitName = sel.kind === 'unit' ? content.unitNames[sel.id] : undefined
  const changes = content.keyframes.filter((k, i) => {
    const prev = content.keyframes[i - 1]?.units ?? {}
    return (
      Object.entries(k.units).some(([u, p]) => p === polityId && prev[u] !== p) ||
      Object.entries(prev).some(([u, p]) => p === polityId && k.units[u] !== p)
    )
  })
  if (!polity) {
    return (
      <Card kicker="Indian rulers" title={unitName ?? 'Indian-ruled territory'} sub={formatT(t, 'year')}>
        <p>
          In {formatT(t, 'year')} this area was ruled by Indian powers, not the British. The atlas does not yet name the
          specific ruler here.
        </p>
      </Card>
    )
  }
  return (
    <Card kicker={KIND_LABEL[polity.kind]} title={polityName(polity, t)} sub={unitName && `${unitName} district, ${formatT(t, 'year')}`}>
      <div className="swatch-bar" style={{ background: rgb(polity.color) }} />
      {polity.altNames.length > 0 && <p className="alt">Also called {polity.altNames.join(', ')}</p>}
      <Prose text={polity.summary} />
      {changes.length > 0 && (
        <section>
          <h4>How its borders changed</h4>
          <ul className="plain timeline-list">
            {changes.slice(-6).map((k) => (
              <li key={k.date.t}>
                <span className="date">{k.date.label}</span> {k.note}
              </li>
            ))}
          </ul>
        </section>
      )}
      <More>
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
            Border certainty: {kf.certainty}. Borders are drawn from 1941 districts, so earlier frontiers are approximate.
          </p>
        )}
        <Sources ids={[...new Set([...polity.sources, ...(kf && sel.kind === 'unit' ? kf.sources : [])])]} content={content} />
      </More>
    </Card>
  )
}
