import { useEffect, useMemo } from 'react'
import { useStore } from '../store'
import type { Content } from '../types'
import { Prose } from './Prose'

const REPO = 'https://github.com/nameetrajore/india-atlas'

/** How many records cite each source. */
function citations(c: Content) {
  const n = new Map<string, number>()
  const add = (ids?: string[]) => ids?.forEach((id) => n.set(id, (n.get(id) ?? 0) + 1))
  const groups: { sources?: string[] }[][] = [c.events, c.people, c.places, Object.values(c.polities), c.keyframes, c.charts, c.eras]
  for (const g of groups) for (const r of g) add(r.sources)
  return n
}

/** Sources & methods: who wrote this, how the map is built, what is uncertain, and the full bibliography. */
export function Methods() {
  const content = useStore((s) => s.content)
  const setMethods = useStore((s) => s.setMethods)
  const cites = useMemo(() => (content ? citations(content) : new Map<string, number>()), [content])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMethods(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setMethods])
  if (!content) return null
  const m = content.methods
  const kf = content.keyframes
  const confident = kf.filter((k) => k.certainty === 'confident').length
  const all = Object.values(content.sources)
  const books = all.filter((s) => !s.url).sort((a, b) => a.title.localeCompare(b.title))
  const web = all.filter((s) => s.url).sort((a, b) => a.title.localeCompare(b.title))
  const cited = (id: string) => cites.get(id) ?? 0
  return (
    <div className="index methods" role="dialog" aria-label="Sources and methods">
      <div className="index-inner methods-inner">
        <button className="link-btn" onClick={() => setMethods(false)}>
          ← Back to the atlas
        </button>
        <div className="index-kicker">Sources & methods</div>
        <h1>How this atlas is made, and how sure it is</h1>
        <ul className="methods-stats">
          <li>
            <strong>{content.events.length}</strong> events
          </li>
          <li>
            <strong>{content.people.length}</strong> people
          </li>
          <li>
            <strong>{content.places.length}</strong> places
          </li>
          <li>
            <strong>{kf.length}</strong> border changes, {confident} confident
          </li>
          <li>
            <strong>{all.length}</strong> sources
          </li>
        </ul>
        {m.sections.map((s) => (
          <section key={s.title} className="methods-section">
            <h2>{s.title}</h2>
            <Prose text={s.text} />
          </section>
        ))}
        <section className="methods-section">
          <h2>Known doubts</h2>
          <p>The sources disagree on these points, or the atlas simplifies them.</p>
          <ul>
            {m.doubts.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
        <section className="methods-section">
          <h2>Known gaps in the map</h2>
          <ul>
            {m.gaps.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
        <section className="methods-section">
          <h2>Found an error?</h2>
          <p>
            Open an issue on{' '}
            <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
              GitHub
            </a>{' '}
            with the claim, what is wrong, and a source. All content is plain text in the{' '}
            <a href={`${REPO}/tree/main/content`} target="_blank" rel="noreferrer">
              content folder
            </a>
            .
          </p>
        </section>
        <section className="methods-section">
          <h2>Bibliography</h2>
          <h3>Books and articles</h3>
          <ol className="biblio">
            {books.map((s) => (
              <li key={s.id}>
                {s.title} <span className="muted">· cited by {cited(s.id)}</span>
              </li>
            ))}
          </ol>
          <h3>Online references</h3>
          <ol className="biblio">
            {web.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>{' '}
                <span className="muted">· cited by {cited(s.id)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
