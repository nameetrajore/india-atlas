import { useEffect, useRef, useState } from 'react'
import { journeySteps, useStore } from '../store'
import { personColor } from '../map/layers'
import type { Content, Person } from '../types'

const rgb = (c: number[]) => `rgb(${c.join(',')})`
const AUTO_MS = 5200

/** People whose itinerary has enough noted stops to follow. */
export function followable(content: Content): Person[] {
  return content.people.filter((p) => journeySteps(p).length >= 4)
}

/** Follow a person: one stop at a time, the map travels with them (D27). */
export function Journey() {
  const content = useStore((s) => s.content)
  const journey = useStore((s) => s.journey)
  const sheetDown = useStore((s) => s.sheetDown)
  const { journeyStep, endJourney, startJourney, setSheetDown, select } = useStore.getState()
  const [auto, setAuto] = useState(false)
  const list = useRef<HTMLOListElement>(null)
  const p = journey && content?.people.find((x) => x.id === journey.person)
  const steps = p ? journeySteps(p) : []
  const step = journey?.step ?? 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === 'ArrowRight') journeyStep(1)
      if (e.key === 'ArrowLeft') journeyStep(-1)
      if (e.key === 'Escape') endJourney()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [journeyStep, endJourney])

  useEffect(() => {
    if (!auto) return
    if (step >= steps.length - 1) return setAuto(false)
    const id = window.setTimeout(() => journeyStep(1), AUTO_MS)
    return () => clearTimeout(id)
  }, [auto, step, steps.length, journeyStep])

  useEffect(() => {
    // Scroll only the stop list, never the panel, so the current stop's text stays in view.
    const ol = list.current
    const on = ol?.querySelector<HTMLElement>('.on')
    if (ol && on) ol.scrollTo({ top: on.offsetTop - ol.clientHeight / 2, behavior: 'smooth' })
  }, [step])

  if (!content || !p || !steps.length) return null
  const stop = p.itinerary[steps[step]]
  const place = stop.place ? content.places.find((x) => x.id === stop.place) : undefined
  const where = stop.away ? 'Abroad' : (place?.name ?? 'On the road')
  const color = rgb(personColor(p.id))

  return (
    <aside className={`reader journey${sheetDown ? ' down' : ''}`} style={{ ['--person' as string]: color }}>
      <button className="sheet-handle" onClick={() => setSheetDown(!sheetDown)} aria-label={sheetDown ? 'Show the journey' : 'Show the map'}>
        <span className="sheet-grip" />
        <span className="sheet-label">{sheetDown ? `${stop.date.label} · ${where} ▲` : 'Show map ▼'}</span>
      </button>
      <div className="reader-head">
        <button className="link-btn small" onClick={endJourney}>
          ← Leave journey
        </button>
        <button className="link-btn small" onClick={() => select({ kind: 'person', id: p.id })}>
          About {p.name.split(' ').slice(-1)[0]}
        </button>
      </div>
      <div className="reader-body">
        <div className="journey-who">
          <span className="journey-dot" />
          <span>
            Following <strong>{p.name}</strong>
          </span>
        </div>
        <div className="scene-date">{stop.date.label}</div>
        <h2 className="scene-title">
          {where}
          {place?.modern && place.modern !== place.name && <span className="journey-modern"> · now {place.modern}</span>}
        </h2>
        <p className="journey-note">{stop.note}</p>
        {stop.approx && <p className="muted small">Date or place approximate.</p>}
        <ol className="journey-stops" ref={list}>
          {steps.map((si, i) => {
            const s = p.itinerary[si]
            const pl = s.place ? content.places.find((x) => x.id === s.place) : undefined
            return (
              <li key={si}>
                <button className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => startJourney(p.id, i)}>
                  <span className="date">{s.date.label}</span> {s.away ? 'Abroad' : (pl?.name ?? s.note?.split(/[,.;:]/)[0])}
                </button>
              </li>
            )
          })}
        </ol>
      </div>
      <div className="reader-nav">
        <button onClick={() => journeyStep(-1)} disabled={step === 0}>
          ← Back
        </button>
        <button className={`play-story${auto ? ' on' : ''}`} onClick={() => setAuto(!auto)} aria-label={auto ? 'Pause journey' : 'Play journey'}>
          {auto ? '❚❚ Pause' : '▶ Play'}
        </button>
        <span className="reader-count">
          {step + 1} / {steps.length}
        </span>
        <button className="primary" onClick={() => (step === steps.length - 1 ? endJourney() : journeyStep(1))}>
          {step === steps.length - 1 ? 'Finish' : 'Next →'}
        </button>
      </div>
    </aside>
  )
}

/** Index section: everyone you can follow. */
export function JourneyList() {
  const content = useStore((s) => s.content)
  const startJourney = useStore((s) => s.startJourney)
  if (!content) return null
  const people = followable(content)
  if (!people.length) return null
  return (
    <section className="journeys">
      <h2 className="index-sub">Follow a life</h2>
      <p className="index-sub-lede">Travel with one person, stop by stop. The map moves with them through time.</p>
      <ul className="journey-cards">
        {people.map((p) => (
          <li key={p.id}>
            <button className="journey-card" onClick={() => startJourney(p.id)} style={{ ['--person' as string]: rgb(personColor(p.id)) }}>
              <span className="journey-dot" />
              <span className="journey-card-name">{p.name}</span>
              <span className="journey-card-role">{p.role}</span>
              <span className="journey-card-count">
                {journeySteps(p).length} stops · {Math.floor(p.itinerary[0].date.t)}–{Math.floor(p.itinerary[p.itinerary.length - 1].date.t)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
