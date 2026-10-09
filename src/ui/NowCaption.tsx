import { useStore } from '../store'
import { personAt } from '../lib/derive'

/** One line of "what is happening now" for explore mode (D25). */
export function NowCaption() {
  const content = useStore((s) => s.content)
  const t = useStore((s) => s.t)
  const select = useStore((s) => s.select)
  if (!content) return null
  const ruler = content.eras.find((e) => e.kind === 'viceroy' && e.from.t <= t && t < e.to.t)
  const recent = content.events
    .filter((e) => e.date.t <= t && t - (e.end?.t ?? e.date.t) < 1.5)
    .sort((a, b) => b.significance - a.significance || b.date.t - a.date.t)
    .slice(0, 2)
  const people = content.people
    .filter((p) => p.itinerary.length)
    .flatMap((p) => {
      const s = personAt(p, t)
      const stop = s && s.opacity >= 0.99 ? p.itinerary[s.lastStop] : undefined
      const place = stop?.place && content.places.find((x) => x.id === stop.place)
      return place ? [{ p, place }] : []
    })
  return (
    <div className="now">
      {ruler && (
        <span>
          {t < 1858.83 ? 'Governor-General' : 'Viceroy'}: {ruler.name}
        </span>
      )}
      {recent.map((e) => (
        <button key={e.id} className="now-item" onClick={() => select({ kind: 'event', id: e.id })}>
          {e.name}
        </button>
      ))}
      {people.map(({ p, place }) => (
        <button key={p.id} className="now-item" onClick={() => select({ kind: 'person', id: p.id })}>
          {p.name} at {place.name}
        </button>
      ))}
    </div>
  )
}
