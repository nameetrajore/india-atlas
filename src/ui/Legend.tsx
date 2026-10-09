import { currentScene, useStore } from '../store'
import { keyframeIndexAt, polityName } from '../lib/derive'
import { BLOC_COLORS, BLOC_NAMES } from '../map/layers'
import type { Bloc } from '../types'

const rgb = (c: number[]) => `rgb(${c.join(',')})`

/** The key: a handful of blocs by default, polity detail only when asked for (D25). */
export function Legend() {
  const content = useStore((s) => s.content)
  const t = useStore((s) => s.t)
  const detail = useStore((s) => s.detail)
  const today = useStore((s) => s.today)
  const scene = useStore((s) => currentScene(s))
  const select = useStore((s) => s.select)
  if (!content) return null
  const kf = content.keyframes[keyframeIndexAt(content.keyframes, t)]
  const present = [...new Set(kf ? Object.values(kf.units) : [])].map((id) => content.polities[id])
  const blocs = [...new Set<Bloc>(['indian', ...present.map((p) => p.bloc)])]
  const highlighted = (scene?.show.polities ?? []).map((id) => content.polities[id])
  const items = detail
    ? present.sort((a, b) => a.bloc.localeCompare(b.bloc) || polityName(a, t).localeCompare(polityName(b, t)))
    : highlighted.filter((p) => p.bloc !== 'india' && p.bloc !== 'pakistan')
  return (
    <div className="legend">
      {!detail &&
        blocs.map((b) => (
          <div key={b} className="legend-row">
            <span className="legend-swatch" style={{ background: rgb(BLOC_COLORS[b]) }} />
            {BLOC_NAMES[b]}
          </div>
        ))}
      {items.length > 0 && (
        <div className="legend-detail">
          {items.map((p) => (
            <button key={p.id} className="legend-row legend-item" onClick={() => select({ kind: 'polity', id: p.id })}>
              <span className="legend-swatch" style={{ background: rgb(p.color) }} />
              {polityName(p, t)}
            </button>
          ))}
        </div>
      )}
      {today && (
        <div className="legend-row">
          <span className="legend-line" /> Present-day borders
        </div>
      )}
    </div>
  )
}

/** Map toggles shared by story and explore modes. */
export function MapToggles() {
  const detail = useStore((s) => s.detail)
  const today = useStore((s) => s.today)
  const { setDetail, setToday } = useStore.getState()
  return (
    <div className="toggles">
      <label>
        <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} /> Provinces & states
      </label>
      <label>
        <input type="checkbox" checked={today} onChange={(e) => setToday(e.target.checked)} /> Compare with today
      </label>
    </div>
  )
}
