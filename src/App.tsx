import { useEffect, useState } from 'react'
import { MapView } from './map/MapView'
import { Timeline } from './ui/Timeline'
import { InfoCard } from './ui/InfoCard'
import { ChapterBar, ChapterIndex, Reader, StoryClock } from './ui/Story'
import { Legend, MapToggles } from './ui/Legend'
import { NowCaption } from './ui/NowCaption'
import { Toasts } from './ui/Toasts'
import { Methods } from './ui/Methods'
import { Journey } from './ui/Journey'
import { Search } from './ui/Search'
import { useStore } from './store'
import { readUrl, syncUrl } from './lib/url'
import type { Content } from './types'

export default function App() {
  const [ready, setReady] = useState(false)
  const [searching, setSearching] = useState(false)
  const methods = useStore((s) => s.methods)
  const journey = useStore((s) => s.journey)

  // ⌘K / Ctrl+K or / opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const content = useStore((s) => s.content)
  const mode = useStore((s) => s.mode)
  const chapter = useStore((s) => s.chapter)
  const { setMode, openChapter } = useStore.getState()

  useEffect(() => {
    // deck.gl builds its glyph atlas on first use, so fonts must be loaded first.
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/content.json`).then((r) => r.json() as Promise<Content>),
      document.fonts.load('600 13px "Inter"'),
      document.fonts.load('600 16px "Source Serif 4"'),
    ]).then(([c]) => {
      useStore.getState().setContent(c)
      readUrl()
      setReady(true)
    })
    return syncUrl()
  }, [])

  const story = mode === 'story'
  return (
    <div className={`app ${story ? 'is-story' : 'is-explore'}${story && chapter === null ? ' is-index' : ''}${journey ? ' is-journey' : ''}`}>
      {ready && <MapView />}
      <header className="topbar">
        <button className="brand" onClick={() => openChapter(null)}>
          <span className="brand-name">{content?.title ?? 'India Atlas'}</span>
          <span className="brand-sub">{content?.subtitle}</span>
        </button>
        <div className="topbar-actions">
          <button className="btn search-btn" onClick={() => setSearching(true)} aria-label="Search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="M15.5 15.5L21 21" />
            </svg>
            <span className="search-btn-label">Search</span>
            <kbd>⌘K</kbd>
          </button>
          <button className="btn methods-btn" onClick={() => useStore.getState().setMethods(true)}>
            Sources
          </button>
          <div className="segmented">
            <button className={story ? 'on' : ''} onClick={() => (story ? openChapter(null) : setMode('story'))}>
              Story
            </button>
            <button className={!story ? 'on' : ''} onClick={() => setMode('explore')}>
              Explore
            </button>
          </div>
        </div>
      </header>
      {ready && story && chapter === null && <ChapterIndex />}
      {ready && story && chapter !== null && (
        <>
          <Reader />
          <StoryClock />
          <ChapterBar />
        </>
      )}
      {ready && !(story && chapter === null) && (
        <div className="map-key">
          <MapToggles />
          <Legend />
        </div>
      )}
      {ready && !story && (
        <>
          <NowCaption />
          <Toasts />
          <Timeline />
        </>
      )}
      {ready && journey && <Journey />}
      {ready && <InfoCard />}
      {ready && methods && <Methods />}
      {ready && searching && <Search onClose={() => setSearching(false)} />}
      {!ready && <div className="loading">Unrolling the map…</div>}
    </div>
  )
}
