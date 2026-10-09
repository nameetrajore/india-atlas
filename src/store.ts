import { create } from 'zustand'
import type { Camera, Content, Scene, Selection } from './types'

export type Mode = 'story' | 'explore'

interface State {
  content: Content | null
  t: number
  mode: Mode
  /** Story position; chapter null = the chapter index. */
  chapter: number | null
  scene: number
  /** Province and state detail instead of simple blocs (D25). */
  detail: boolean
  /** Then-vs-now split view. */
  today: boolean
  /** Split position, as a fraction of the window width; the present day is drawn to its right. */
  split: number
  selection: Selection | null
  playing: boolean
  camera: Camera
  /** Fly-to request for the map; nonce makes repeated requests distinct. */
  flyTo: { camera: Camera; nonce: number } | null
  /** Events the playhead just crossed (explore mode): ripple + toast. */
  crossed: { id: string; at: number }[]
  /** Phone: reader sheet collapsed to show the map. */
  sheetDown: boolean
  /** Documentary mode: scenes advance by themselves. */
  autoplay: boolean
  /** The Sources & methods page is open. */
  methods: boolean

  setContent: (c: Content) => void
  setT: (t: number, opts?: { announce?: boolean }) => void
  setMode: (m: Mode) => void
  openChapter: (chapter: number | null, scene?: number) => void
  goScene: (delta: number) => void
  setDetail: (d: boolean) => void
  setToday: (d: boolean) => void
  setSplit: (x: number) => void
  select: (s: Selection | null) => void
  setPlaying: (p: boolean) => void
  setCamera: (c: Camera) => void
  requestFly: (c: Camera) => void
  dismiss: (id: string) => void
  setSheetDown: (d: boolean) => void
  setAutoplay: (a: boolean) => void
  setMethods: (m: boolean) => void
}

export const INITIAL_CAMERA: Camera = { center: [80.5, 22.5], zoom: 4.2, pitch: 0, bearing: 0 }

export const useStore = create<State>((set, get) => ({
  content: null,
  t: 1600,
  mode: 'story',
  chapter: null,
  scene: 0,
  detail: false,
  today: false,
  split: 0.5,
  selection: null,
  playing: false,
  camera: INITIAL_CAMERA,
  flyTo: null,
  crossed: [],
  sheetDown: false,
  methods: false,
  autoplay: false,

  setContent: (content) => set({ content, t: content.range[0] }),
  setT: (t, opts) => {
    const { content: c, t: prev, crossed, mode } = get()
    const [a, b] = c ? c.range : [-Infinity, Infinity]
    const next = Math.min(b, Math.max(a, t))
    // Only continuous forward motion in explore mode announces events; jumps and stories do not.
    let fresh: { id: string; at: number }[] = []
    if (c && (opts?.announce ?? mode === 'explore') && next > prev && next - prev < 1.5) {
      const now = performance.now()
      fresh = c.events.filter((e) => e.date.t > prev && e.date.t <= next && e.significance >= 3).map((e) => ({ id: e.id, at: now }))
    }
    set({ t: next, ...(fresh.length ? { crossed: [...crossed, ...fresh].slice(-3) } : {}) })
  },
  setMode: (mode) => set({ mode, playing: false, crossed: [], ...(mode === 'story' ? {} : { selection: null }) }),
  openChapter: (chapter, scene = 0) => {
    set({ chapter, scene, mode: 'story', playing: false, crossed: [], ...(chapter === null ? { autoplay: false } : {}) })
    if (chapter !== null) enterScene(get, set)
    else set({ selection: null })
  },
  goScene: (delta) => {
    const { content, chapter, scene } = get()
    if (!content || chapter === null) return
    const ch = content.chapters[chapter]
    const from = get().t
    const next = scene + delta
    if (next >= 0 && next < ch.scenes.length) set({ scene: next })
    else if (next >= ch.scenes.length && chapter + 1 < content.chapters.length) set({ chapter: chapter + 1, scene: 0 })
    else if (next < 0 && chapter > 0) set({ chapter: chapter - 1, scene: content.chapters[chapter - 1].scenes.length - 1 })
    else return
    // Moving forward plays time from the last scene to this one, so the map visibly changes (D25).
    enterScene(get, set, delta > 0 ? from : undefined)
  },
  setDetail: (detail) => set({ detail }),
  setToday: (today) => {
    // Start the divider in the middle of the visible map, not behind the story panel.
    const w = window.innerWidth
    const panel = get().mode === 'story' && w > 760 ? (w <= 1280 ? 380 : 440) : 0
    set(today ? { today, split: (panel + (w - panel) / 2) / w } : { today })
  },
  setSplit: (split) => set({ split: Math.min(0.97, Math.max(0.03, split)) }),
  select: (selection) => set({ selection }),
  setPlaying: (playing) => set({ playing }),
  setCamera: (camera) => set({ camera }),
  requestFly: (camera) => set({ flyTo: { camera, nonce: Math.random() } }),
  dismiss: (id) => set((s) => ({ crossed: s.crossed.filter((c) => c.id !== id) })),
  setSheetDown: (sheetDown) => set({ sheetDown }),
  setAutoplay: (autoplay) => set({ autoplay }),
  setMethods: (methods) => set({ methods }),
}))

export function currentScene(s: Pick<State, 'content' | 'chapter' | 'scene' | 'mode'>): Scene | null {
  if (s.mode !== 'story' || s.chapter === null || !s.content) return null
  return s.content.chapters[s.chapter]?.scenes[s.scene] ?? null
}

/** Ease in and out, so time accelerates away from one scene and settles on the next. */
const ease = (f: number) => (f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2)

/** Animate t between two dates, starting after `delay` ms; aborts if the scene changes. */
function tween(get: () => State, sc: Scene, from: number, to: number, delay: number, dur: number, then?: () => void) {
  const start = performance.now() + delay
  const step = (now: number) => {
    if (currentScene(get()) !== sc) return
    const f = Math.min(1, Math.max(0, (now - start) / dur))
    get().setT(from + (to - from) * ease(f), { announce: false })
    if (f < 1) sceneAnim = requestAnimationFrame(step)
    else then?.()
  }
  sceneAnim = requestAnimationFrame(step)
}

/** Move the map to a scene: camera, selection, and time (played forward from `fromT` when given). */
let sceneAnim = 0
function enterScene(get: () => State, set: (p: Partial<State>) => void, fromT?: number) {
  const sc = currentScene(get())
  cancelAnimationFrame(sceneAnim)
  if (!sc) return
  // On phones a card covers the screen, so scenes don't open one by themselves.
  const phone = typeof window !== 'undefined' && window.innerWidth <= 760
  set({ selection: phone ? null : (sc.select ?? null) })
  get().requestFly(sc.camera)
  const playScene = () => sc.playTo && tween(get, sc, sc.date.t, sc.playTo.t, 600, 9000)
  if (fromT !== undefined && sc.date.t > fromT) {
    // Longer gaps take longer, within limits: a decade ≈ 2.5 s.
    const dur = Math.min(4500, Math.max(1200, (sc.date.t - fromT) * 250))
    tween(get, sc, fromT, sc.date.t, 0, dur, playScene)
  } else {
    get().setT(sc.date.t, { announce: false })
    if (sc.playTo) tween(get, sc, sc.date.t, sc.playTo.t, 1800, 9000)
  }
}
