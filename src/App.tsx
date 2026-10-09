import { useEffect, useState } from 'react'
import { MapView } from './map/MapView'
import { Timeline } from './ui/Timeline'
import { InfoCard } from './ui/InfoCard'
import { LensDock } from './ui/LensDock'
import { StoryMenu, StoryPlayer } from './ui/StoryPlayer'
import { Toasts } from './ui/Toasts'
import { useStore } from './store'
import { readUrl, syncUrl } from './lib/url'
import type { Content } from './types'

export default function App() {
  const [ready, setReady] = useState(false)
  const [menu, setMenu] = useState(false)
  const story = useStore((s) => s.story)
  const content = useStore((s) => s.content)

  useEffect(() => {
    // deck.gl builds its glyph atlas on first use, so fonts must be loaded first.
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/content.json`).then((r) => r.json() as Promise<Content>),
      document.fonts.load('700 16px "Cormorant Garamond"'),
      document.fonts.load('600 16px "Cormorant Garamond"'),
      document.fonts.load('600 13px "Inter"'),
      document.fonts.load('600 16px "Source Serif 4"'),
    ]).then(([content]) => {
      useStore.getState().setContent(content)
      readUrl()
      setReady(true)
    })
    return syncUrl()
  }, [])

  return (
    <div className="app">
      {ready && <MapView />}
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">{content?.title ?? 'India Atlas'}</span>
          <span className="brand-sub">{content?.subtitle} · preview</span>
        </div>
        <div className="topbar-actions">
          <button className="btn" disabled title="Grounded Q&A arrives once cards are reviewed (D12)">
            Ask
          </button>
          <button className={`btn${menu || story ? ' on' : ''}`} onClick={() => setMenu(!menu)}>
            Stories
          </button>
        </div>
        {menu && <StoryMenu onClose={() => setMenu(false)} />}
      </header>
      {ready && (
        <>
          <LensDock />
          <InfoCard />
          <StoryPlayer />
          <Toasts />
          <Timeline />
        </>
      )}
      {!ready && <div className="loading">Unrolling the map…</div>}
    </div>
  )
}
