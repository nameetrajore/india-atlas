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
  /** Present-day boundaries overlay. */
  today: boolean
  selection: Selection | null
  playing: boolean
  camera: Camera
  /** Fly-to request for the map; nonce makes repeated requests distinct. */
  flyTo: { camera: Camera; nonce: number } | null
  /** Events the playhead just crossed (explore mode): ripple + toast. */
  crossed: { id: string; at: number }[]

  setContent: (c: Content) => void
  setT: (t: number, opts?: { announce?: boolean }) => void
  setMode: (m: Mode) => void
  openChapter: (chapter: number | null, scene?: number) => void
  goScene: (delta: number) => void
  setDetail: (d: boolean) => void
  setToday: (d: boolean) => void
  select: (s: Selection | null) => void
  setPlaying: (p: boolean) => void
  setCamera: (c: Camera) => void
  requestFly: (c: Camera) => void
  dismiss: (id: string) => void
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
  selection: null,
  playing: false,
  camera: INITIAL_CAMERA,
  flyTo: null,
  crossed: [],

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
    set({ chapter, scene, mode: 'story', playing: false, crossed: [] })
    if (chapter !== null) enterScene(get, set)
    else set({ selection: null })
  },
  goScene: (delta) => {
    const { content, chapter, scene } = get()
    if (!content || chapter === null) return
    const ch = content.chapters[chapter]
    const next = scene + delta
    if (next >= 0 && next < ch.scenes.length) set({ scene: next })
    else if (next >= ch.scenes.length && chapter + 1 < content.chapters.length) set({ chapter: chapter + 1, scene: 0 })
    else if (next < 0 && chapter > 0) set({ chapter: chapter - 1, scene: content.chapters[chapter - 1].scenes.length - 1 })
    else return
    enterScene(get, set)
  },
  setDetail: (detail) => set({ detail }),
  setToday: (today) => set({ today }),
  select: (selection) => set({ selection }),
  setPlaying: (playing) => set({ playing }),
  setCamera: (camera) => set({ camera }),
  requestFly: (camera) => set({ flyTo: { camera, nonce: Math.random() } }),
  dismiss: (id) => set((s) => ({ crossed: s.crossed.filter((c) => c.id !== id) })),
}))

export function currentScene(s: Pick<State, 'content' | 'chapter' | 'scene' | 'mode'>): Scene | null {
  if (s.mode !== 'story' || s.chapter === null || !s.content) return null
  return s.content.chapters[s.chapter]?.scenes[s.scene] ?? null
}

/** Move the map to a scene: time, camera, selection; animate time if the scene plays forward. */
let sceneAnim = 0
function enterScene(get: () => State, set: (p: Partial<State>) => void) {
  const sc = currentScene(get())
  cancelAnimationFrame(sceneAnim)
  if (!sc) return
  set({ selection: sc.select ?? null })
  get().setT(sc.date.t, { announce: false })
  get().requestFly(sc.camera)
  if (sc.playTo) {
    const from = sc.date.t
    const to = sc.playTo.t
    const start = performance.now() + 1800 // after the camera settles
    const dur = 9000
    const step = (now: number) => {
      const f = Math.min(1, Math.max(0, (now - start) / dur))
      if (currentScene(get()) !== sc) return
      get().setT(from + (to - from) * f, { announce: false })
      if (f < 1) sceneAnim = requestAnimationFrame(step)
    }
    sceneAnim = requestAnimationFrame(step)
  }
}
