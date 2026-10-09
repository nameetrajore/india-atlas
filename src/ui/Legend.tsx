import { useStore, activeLenses } from '../store'
import { keyframeIndexAt, polityName } from '../lib/derive'
import { EVENT_KINDS, badgeUrl } from './icons'
import type { Polity } from '../types'

const GROUPS: { title: string; kinds: Polity['kind'][] }[] = [
  { title: 'British India', kinds: ['province', 'polity'] },
  { title: 'Princely states', kinds: ['state'] },
  { title: 'Independent', kinds: ['dominion'] },
  { title: 'Other European', kinds: ['power'] },
  { title: 'Frontier & beyond', kinds: ['tribal', 'foreign'] },
]

/** What the colours and symbols on the map mean right now. */
export function Legend() {
  const content = useStore((s) => s.content)
  const t = useStore((s) => s.t)
  const view = useStore((s) => s.view)
  const hidden = useStore((s) => s.hidden)
  const advanced = useStore((s) => s.advanced)
  const select = useStore((s) => s.select)
  if (!content) return null
  const lenses = activeLenses({ view, hidden, advanced })
  const kf = content.keyframes[keyframeIndexAt(content.keyframes, t)]
  const present = new Set(kf ? Object.values(kf.units) : [])
  const kinds = new Set(content.events.map((e) => e.kind))
  const rgb = (c: number[]) => `rgb(${c.join(',')})`

  return (
    <div className="legend">
      {lenses.has('polities') &&
        GROUPS.map((g) => {
          const items = [...present].map((id) => content.polities[id]).filter((p) => g.kinds.includes(p.kind))
          if (!items.length) return null
          // Enclaves of other European powers are listed with "Other".
          return (
            <div key={g.title} className="legend-group">
              <div className="legend-title">{g.title}</div>
              <ul>
                {items
                  .sort((a, b) => polityName(a, t).localeCompare(polityName(b, t)))
                  .map((p) => (
                    <li key={p.id}>
                      <button className="legend-item" onClick={() => select({ kind: 'polity', id: p.id })}>
                        <span className="legend-swatch" style={{ background: rgb(p.color) }} />
                        {polityName(p, t)}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )
        })}
      {lenses.has('events') && (
        <div className="legend-group">
          <div className="legend-title">Events</div>
          <ul className="legend-kinds">
            {EVENT_KINDS.filter((k) => kinds.has(k.kind)).map((k) => (
              <li key={k.kind}>
                <img src={badgeUrl(k.kind)} width={16} height={16} alt="" /> {k.label}
              </li>
            ))}
          </ul>
          <div className="legend-note">Bigger badge = more significant. Events fade over the years after they happen.</div>
        </div>
      )}
      {lenses.has('people') && (
        <div className="legend-group">
          <div className="legend-title">People</div>
          <div className="legend-note">Dots move along known itineraries. A faded dot means the location is unknown.</div>
        </div>
      )}
      <div className="legend-note credits">
        Units: India State Story 1941 (CC0); outside present-day India, present-day districts from geoBoundaries as
        proxies. Base: Natural Earth. Relief: AWS Terrain Tiles. Scroll to zoom, right-drag to tilt.
      </div>
    </div>
  )
}
