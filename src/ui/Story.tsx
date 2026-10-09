import { useEffect, useState } from 'react'
import { currentScene, useStore } from '../store'
import { Prose } from './Prose'
import { badgeUrl } from './icons'
import { Chart } from './Chart'

/** Landing: the story's chapters. */
export function ChapterIndex() {
  const content = useStore((s) => s.content)
  const { openChapter, setMode } = useStore.getState()
  if (!content) return null
  return (
    <div className="index">
      <div className="index-inner">
        <div className="index-kicker">A story in {content.chapters.length} chapters</div>
        <h1>How the British came to rule India, and how they left</h1>
        <p className="index-lede">
          In 1600 a group of London merchants won a charter to trade with Asia. Within two centuries their company governed
          much of the subcontinent; within another, India was free and partitioned. This is the story of how, and why, told on
          the map.
        </p>
        <ol className="chapters">
          {content.chapters.map((c, i) => (
            <li key={c.id}>
              <button className="chapter-card" onClick={() => openChapter(i)}>
                <span className="chapter-num">Chapter {c.number}</span>
                <span className="chapter-title">{c.title}</span>
                <span className="chapter-period">{c.period}</span>
                <span className="chapter-summary">{c.summary}</span>
              </button>
            </li>
          ))}
        </ol>
        <button className="link-btn" onClick={() => setMode('explore')}>
          Or explore the map freely →
        </button>
        <button className="link-btn index-methods" onClick={() => useStore.getState().setMethods(true)}>
          Sources & methods: who wrote this and how sure it is
        </button>
      </div>
    </div>
  )
}

/** How long documentary mode stays on a scene: camera, any animation, then reading time (~215 wpm). */
function sceneDwell(sc: NonNullable<ReturnType<typeof currentScene>>) {
  const words = sc.text.split(/\s+/).length
  return Math.min(45000, Math.max(9000, 2500 + (sc.playTo ? 9600 : 0) + words * 280))
}

const TIP_KEY = 'india-atlas:tip-dismissed'
const readTip = () => {
  try {
    return localStorage.getItem(TIP_KEY) === '1'
  } catch {
    return false
  }
}

/** Share this scene: native share sheet on phones, otherwise copy the link. Chapter pages carry link previews. */
function ShareButton({ chapterNumber, chapterIdx, sceneIdx, title }: { chapterNumber: number; chapterIdx: number; sceneIdx: number; title: string }) {
  const [copied, setCopied] = useState(false)
  const base = `${location.origin}${import.meta.env.BASE_URL}`
  const url = import.meta.env.DEV ? `${base}?ch=${chapterIdx}&sc=${sceneIdx}` : `${base}ch/${chapterNumber}/?sc=${sceneIdx}`
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      // The user cancelled the share sheet, or the clipboard is blocked: nothing to do.
    }
  }
  return (
    <button className="link-btn small share" onClick={share}>
      {copied ? 'Link copied' : 'Share'}
    </button>
  )
}

/** The reading panel: narrative for the current scene. */
export function Reader() {
  const content = useStore((s) => s.content)
  const chapterIdx = useStore((s) => s.chapter)
  const sceneIdx = useStore((s) => s.scene)
  const scene = useStore((s) => currentScene(s))
  const sheetDown = useStore((s) => s.sheetDown)
  const autoplay = useStore((s) => s.autoplay)
  const { goScene, openChapter, select, setSheetDown, setAutoplay } = useStore.getState()
  const dwell = scene ? sceneDwell(scene) : 0

  // Documentary mode: move on once the scene has had time to play and be read.
  useEffect(() => {
    if (!autoplay || !scene) return
    const id = window.setTimeout(() => {
      const s = useStore.getState()
      const ch = s.content!.chapters[s.chapter!]
      const last = s.chapter === s.content!.chapters.length - 1 && s.scene === ch.scenes.length - 1
      if (last) setAutoplay(false)
      else goScene(1)
    }, dwell)
    // Touching the map or the text means the reader wants to look: pause.
    const pause = (e: PointerEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('.map, .reader-body, .card')) setAutoplay(false)
    }
    window.addEventListener('pointerdown', pause)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pointerdown', pause)
    }
  }, [autoplay, scene, dwell, goScene, setAutoplay])
  const [tipGone, setTipGone] = useState(readTip)
  const dismissTip = () => {
    setTipGone(true)
    try {
      localStorage.setItem(TIP_KEY, '1')
    } catch {
      // Storage blocked (private window): the tip just returns next visit.
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goScene(1)
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') goScene(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goScene])

  if (!content || chapterIdx === null || !scene) return null
  const ch = content.chapters[chapterIdx]
  const isLast = chapterIdx === content.chapters.length - 1 && sceneIdx === ch.scenes.length - 1
  const evs = scene.show.events.map((id) => content.events.find((e) => e.id === id)!).filter(Boolean)
  const ppl = scene.show.people.map((id) => content.people.find((p) => p.id === id)!).filter(Boolean)

  return (
    <aside className={`reader${sheetDown ? ' down' : ''}`} key={`${chapterIdx}-${sceneIdx}`}>
      <button className="sheet-handle" onClick={() => setSheetDown(!sheetDown)} aria-label={sheetDown ? 'Show the story' : 'Show the map'}>
        <span className="sheet-grip" />
        <span className="sheet-label">{sheetDown ? `${scene.date.label} · ${scene.title} ▲` : 'Show map ▼'}</span>
      </button>
      <div className="reader-head">
        <button className="link-btn small" onClick={() => openChapter(null)}>
          ← All chapters
        </button>
        <span className="reader-chapter">
          Chapter {ch.number} · {ch.title}
        </span>
        <ShareButton chapterNumber={ch.number} chapterIdx={chapterIdx} sceneIdx={sceneIdx} title={`${scene.title} · India Atlas`} />
      </div>
      <div className="reader-body">
        {!tipGone && (
          <div className="tip">
            <span>
              <span className="term-sample">Dotted words</span> explain themselves. <span className="link-sample">Blue names</span> open a card. Use
              ← → or the buttons below to move through the story; the map follows.
            </span>
            <button onClick={dismissTip} aria-label="Dismiss tip">
              Got it
            </button>
          </div>
        )}
        <div className="scene-date">{scene.date.label}</div>
        <h2 className="scene-title">{scene.title}</h2>
        {scene.image && <SceneImage image={scene.image} />}
        <Prose text={scene.text} className="scene-text" />
        {scene.chart && <Chart id={scene.chart} />}
        {(evs.length > 0 || ppl.length > 0) && (
          <div className="scene-refs">
            <div className="refs-title">In this scene</div>
            <div className="chips">
              {evs.map((e) => (
                <button key={e.id} className="chip" onClick={() => select({ kind: 'event', id: e.id })}>
                  <img src={badgeUrl(e.kind)} width={16} height={16} alt="" />
                  {e.name}
                </button>
              ))}
              {ppl.map((p) => (
                <button key={p.id} className="chip" onClick={() => select({ kind: 'person', id: p.id })}>
                  <span className="chip-dot" />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="reader-nav">
        <button onClick={() => goScene(-1)} disabled={chapterIdx === 0 && sceneIdx === 0}>
          ← Back
        </button>
        <button className={`play-story${autoplay ? ' on' : ''}`} onClick={() => setAutoplay(!autoplay)} aria-label={autoplay ? 'Pause story' : 'Play story'}>
          {autoplay ? '❚❚ Pause' : '▶ Play'}
        </button>
        <span className="reader-count">
          {sceneIdx + 1} / {ch.scenes.length}
        </span>
        <button className="primary next-btn" onClick={() => (isLast ? openChapter(null) : goScene(1))}>
          {autoplay && !isLast && <span key={`${chapterIdx}-${sceneIdx}`} className="autoplay-bar" style={{ animationDuration: `${dwell}ms` }} />}
          <span className="next-label">{isLast ? 'The end' : sceneIdx === ch.scenes.length - 1 ? `Chapter ${ch.number + 1} →` : 'Next →'}</span>
        </button>
      </div>
    </aside>
  )
}

/** Bottom bar: every chapter and scene, as a progress line. */
export function ChapterBar() {
  const content = useStore((s) => s.content)
  const chapterIdx = useStore((s) => s.chapter)
  const sceneIdx = useStore((s) => s.scene)
  const { openChapter } = useStore.getState()
  if (!content || chapterIdx === null) return null
  return (
    <nav className="chapter-bar">
      {content.chapters.map((c, i) => (
        <div key={c.id} className={`cb-chapter${i === chapterIdx ? ' on' : i < chapterIdx ? ' done' : ''}`}>
          <button className="cb-title" onClick={() => openChapter(i)} title={`${c.title} (${c.period})`}>
            <span className="cb-num">{c.number}</span>
            <span className="cb-name">{c.title}</span>
          </button>
          <div className="cb-scenes">
            {c.scenes.map((s, j) => (
              <button
                key={s.id}
                className={`cb-scene${i === chapterIdx && j === sceneIdx ? ' on' : i < chapterIdx || (i === chapterIdx && j < sceneIdx) ? ' done' : ''}`}
                onClick={() => openChapter(i, j)}
                title={`${s.date.label}: ${s.title}`}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

/** Big year on the map, so time visibly runs while a scene transition plays. */
export function StoryClock() {
  const t = useStore((s) => s.t)
  const scene = useStore((s) => currentScene(s))
  if (!scene) return null
  const moving = Math.abs(t - scene.date.t) > 0.05
  return <div className={`story-clock${moving ? ' moving' : ''}`}>{Math.floor(t)}</div>
}

type SceneImg = NonNullable<ReturnType<typeof currentScene>>['image'] & {}

/** A period image with caption and credit; click to see it large. */
function SceneImage({ image }: { image: SceneImg }) {
  const [open, setOpen] = useState(false)
  const src = `${import.meta.env.BASE_URL}${image.src}`
  return (
    <figure className="scene-image">
      <button className="scene-image-btn" onClick={() => setOpen(true)} aria-label="Enlarge image">
        <img src={src} alt={image.caption} loading="lazy" />
      </button>
      <figcaption>
        {image.caption}{' '}
        <a href={image.source} target="_blank" rel="noreferrer" className="credit">
          {image.credit} · {image.license}
        </a>
      </figcaption>
      {open && (
        <div className="lightbox" onClick={() => setOpen(false)} role="dialog">
          <img src={src} alt={image.caption} />
          <div className="lightbox-cap">{image.caption}</div>
        </div>
      )}
    </figure>
  )
}
