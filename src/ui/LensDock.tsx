import { useStore } from '../store'
import { LENSES_WITH_DATA, LENS_NAMES, VIEWS, viewById } from '../views'
import type { LensId } from '../types'
import { Legend } from './Legend'

const ALL_LENSES = Object.keys(LENS_NAMES) as LensId[]

export function LensDock() {
  const view = useStore((s) => s.view)
  const hidden = useStore((s) => s.hidden)
  const advanced = useStore((s) => s.advanced)
  const open = useStore((s) => s.dockOpen)
  const { setView, toggleLens, setAdvanced, setDockOpen } = useStore.getState()
  const lenses = (advanced ? ALL_LENSES : viewById(view).lenses).filter((l) => LENSES_WITH_DATA.has(l))
  const coming = (advanced ? ALL_LENSES : viewById(view).lenses).filter((l) => !LENSES_WITH_DATA.has(l))

  if (!open)
    return (
      <button className="dock-open btn" onClick={() => setDockOpen(true)}>
        Key & layers
      </button>
    )

  return (
    <nav className="dock">
      <div className="dock-head">
        <div className="views">
          {VIEWS.map((v) => (
            <button key={v.id} className={`view-btn${v.id === view && !advanced ? ' on' : ''}`} onClick={() => (setAdvanced(false), setView(v.id))}>
              {v.name}
            </button>
          ))}
        </div>
        <button className="dock-close" onClick={() => setDockOpen(false)} aria-label="Hide panel">
          ‹
        </button>
      </div>
      <div className="dock-body">
        <div className="dock-title">Layers</div>
        <ul className="lenses">
          {lenses.map((l) => (
            <li key={l}>
              <label>
                <input type="checkbox" checked={!hidden.has(l)} onChange={() => toggleLens(l)} />
                {LENS_NAMES[l]}
              </label>
            </li>
          ))}
        </ul>
        {coming.length > 0 && <div className="coming">Coming: {coming.map((l) => LENS_NAMES[l]).join(', ')}</div>}
        <div className="dock-title">Key</div>
        <Legend />
      </div>
    </nav>
  )
}
