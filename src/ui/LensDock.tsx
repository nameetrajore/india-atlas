import { useStore } from '../store'
import { LENSES_WITH_DATA, LENS_NAMES, VIEWS, viewById } from '../views'
import type { LensId } from '../types'

const ALL_LENSES = Object.keys(LENS_NAMES) as LensId[]

export function LensDock() {
  const view = useStore((s) => s.view)
  const hidden = useStore((s) => s.hidden)
  const advanced = useStore((s) => s.advanced)
  const { setView, toggleLens, setAdvanced } = useStore.getState()
  const lenses = advanced ? ALL_LENSES : viewById(view).lenses

  return (
    <nav className="dock">
      <div className="dock-title">View</div>
      <div className="views">
        {VIEWS.map((v) => (
          <button key={v.id} className={`view-btn${v.id === view && !advanced ? ' on' : ''}`} onClick={() => (setAdvanced(false), setView(v.id))}>
            {v.name}
          </button>
        ))}
      </div>
      <div className="dock-title">Lenses</div>
      <ul className="lenses">
        {lenses.map((l) => {
          const has = LENSES_WITH_DATA.has(l)
          return (
            <li key={l}>
              <label className={has ? '' : 'disabled'}>
                <input type="checkbox" checked={has && !hidden.has(l)} disabled={!has} onChange={() => toggleLens(l)} />
                {LENS_NAMES[l]}
                {!has && <span className="soon">coming</span>}
              </label>
            </li>
          )
        })}
      </ul>
      <label className="advanced">
        <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> Mix all lenses
      </label>
    </nav>
  )
}
