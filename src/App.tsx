import { useEffect, useState } from 'react'
import { MapView } from './map/MapView'
import { Timeline } from './ui/Timeline'
import { InfoCard } from './ui/InfoCard'
import { ChapterBar, ChapterIndex, Reader, StoryClock } from './ui/Story'
import { Legend, MapToggles } from './ui/Legend'
import { NowCaption } from './ui/NowCaption'
import { Toasts } from './ui/Toasts'
import { useStore } from './store'
import { readUrl, syncUrl } from './lib/url'
import type { Content } from './types'

export default function App() {
  const [ready, setReady] = useState(false)
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
    <div className={`app ${story ? 'is-story' : 'is-explore'}${story && chapter === null ? ' is-index' : ''}`}>
      {ready && <MapView />}
      <header className="topbar">
        <button className="brand" onClick={() => openChapter(null)}>
          <span className="brand-name">{content?.title ?? 'India Atlas'}</span>
          <span className="brand-sub">{content?.subtitle}</span>
        </button>
        <div className="topbar-actions">
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
      {ready && <InfoCard />}
      {!ready && <div className="loading">Unrolling the map…</div>}
    </div>
  )
}
