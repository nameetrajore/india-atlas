import { useEffect } from 'react'
import { useStore } from '../store'

export function StoryPlayer() {
  const content = useStore((s) => s.content)
  const story = useStore((s) => s.story)
  const { goStep, stopStory } = useStore.getState()
  const s = content?.stories.find((x) => x.id === story?.id)

  useEffect(() => {
    if (!story) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PageDown' || e.key === 'Enter') goStep(story.step + 1)
      if (e.key === 'PageUp') goStep(story.step - 1)
      if (e.key === 'Escape') stopStory()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [story])

  if (!s || !story) return null
  const step = s.steps[story.step]
  const last = story.step === s.steps.length - 1
  return (
    <div className="story">
      <div className="story-head">
        <span className="story-name">{s.title}</span>
        <span className="story-count">
          {story.step + 1} / {s.steps.length}
        </span>
        <button className="story-exit" onClick={stopStory} aria-label="Exit story">
          Exit
        </button>
      </div>
      <div className="story-date">{step.date.label}</div>
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      <div className="story-nav">
        <button disabled={story.step === 0} onClick={() => goStep(story.step - 1)}>
          ← Back
        </button>
        <button className="primary" onClick={() => (last ? stopStory() : goStep(story.step + 1))}>
          {last ? 'Explore freely' : 'Next →'}
        </button>
      </div>
    </div>
  )
}

export function StoryMenu({ onClose }: { onClose: () => void }) {
  const content = useStore((s) => s.content)
  const startStory = useStore((s) => s.startStory)
  return (
    <div className="menu" role="dialog">
      <div className="dock-title">Stories</div>
      {content?.stories.map((s) => (
        <button
          key={s.id}
          className="menu-item"
          onClick={() => {
            startStory(s.id)
            onClose()
          }}
        >
          <span className="menu-title">{s.title}</span>
          <span className="muted">{s.subtitle}</span>
        </button>
      ))}

    </div>
  )
}
