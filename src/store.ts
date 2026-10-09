import { create } from 'zustand'
import type { Camera, Content, LensId, Selection, ViewId } from './types'
import { viewById } from './views'

interface StoryState {
  id: string
  step: number
}

interface State {
  content: Content | null
  t: number
  view: ViewId
  /** Lenses switched off by the user inside the current view. */
  hidden: Set<LensId>
  /** "Advanced" free mixing: every lens is available regardless of view (D18). */
  advanced: boolean
  selection: Selection | null
  story: StoryState | null
  playing: boolean
  camera: Camera
  /** Fly-to request for the map; nonce makes repeated requests distinct. */
  flyTo: { camera: Camera; nonce: number } | null
  /** Events the playhead just crossed: they ripple on the map and pop a toast. */
  crossed: { id: string; at: number }[]
  dockOpen: boolean

  setContent: (c: Content) => void
  setT: (t: number) => void
  setView: (v: ViewId) => void
  toggleLens: (l: LensId) => void
  setAdvanced: (a: boolean) => void
  select: (s: Selection | null) => void
  setPlaying: (p: boolean) => void
  setCamera: (c: Camera) => void
  requestFly: (c: Camera) => void
  startStory: (id: string, step?: number) => void
  goStep: (step: number) => void
  stopStory: () => void
  dismiss: (id: string) => void
  setDockOpen: (o: boolean) => void
}

export const INITIAL_CAMERA: Camera = { center: [82.5, 22.5], zoom: 4.3, pitch: 0, bearing: 0 }

export const useStore = create<State>((set, get) => ({
  content: null,
  t: 1740.5,
  view: 'geopolitics',
  hidden: new Set(),
  advanced: false,
  selection: null,
  story: null,
  playing: false,
  camera: INITIAL_CAMERA,
  flyTo: null,
  crossed: [],
  dockOpen: true,

  setContent: (content) => set({ content, t: content.range[0] + 0.35 }),
  setT: (t) => {
    const { content: c, t: prev, crossed } = get()
    const [a, b] = c ? c.range : [-Infinity, Infinity]
    const next = Math.min(b, Math.max(a, t))
    // Only forward, continuous motion (playing or a short drag) announces events; jumps do not.
    let fresh: { id: string; at: number }[] = []
    if (c && next > prev && next - prev < 1.5) {
      const now = performance.now()
      fresh = c.events.filter((e) => e.date.t > prev && e.date.t <= next && e.significance >= 2).map((e) => ({ id: e.id, at: now }))
    }
    set({ t: next, ...(fresh.length ? { crossed: [...crossed, ...fresh].slice(-4) } : {}) })
  },
  setView: (view) => set({ view, hidden: new Set() }),
  toggleLens: (l) =>
    set((s) => {
      const hidden = new Set(s.hidden)
      if (hidden.has(l)) hidden.delete(l)
      else hidden.add(l)
      return { hidden }
    }),
  setAdvanced: (advanced) => set({ advanced }),
  select: (selection) => set({ selection }),
  setPlaying: (playing) => set({ playing }),
  setCamera: (camera) => set({ camera }),
  requestFly: (camera) => set({ flyTo: { camera, nonce: Math.random() } }),
  startStory: (id, step = 0) => {
    const story = get().content?.stories.find((s) => s.id === id)
    if (!story) return
    set({ view: story.view, hidden: new Set(), playing: false, story: { id, step } })
    get().goStep(step)
  },
  goStep: (step) => {
    const { content, story } = get()
    const s = content?.stories.find((x) => x.id === story?.id)
    if (!s || step < 0 || step >= s.steps.length) return
    const st = s.steps[step]
    set({ story: { id: s.id, step }, selection: st.select ?? null })
    get().setT(st.date.t)
    get().requestFly(st.camera)
  },
  stopStory: () => set({ story: null }),
  dismiss: (id) => set((s) => ({ crossed: s.crossed.filter((c) => c.id !== id) })),
  setDockOpen: (dockOpen) => set({ dockOpen }),
}))

/** Lenses currently drawn. */
export function activeLenses(s: Pick<State, 'view' | 'hidden' | 'advanced'>): Set<LensId> {
  const base = s.advanced
    ? (['polities', 'footholds', 'events', 'people', 'places', 'trade', 'movements', 'infrastructure', 'economy', 'society', 'partition'] as LensId[])
    : viewById(s.view).lenses
  return new Set(base.filter((l) => !s.hidden.has(l)))
}
