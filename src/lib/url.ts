// Every view is a URL (D8): time, view, camera, selection, story step.
import { useStore } from '../store'
import type { Camera, SelectionKind, ViewId } from '../types'
import { VIEWS } from '../views'

export function readUrl() {
  const q = new URLSearchParams(location.search)
  const s = useStore.getState()
  const t = Number(q.get('t'))
  if (q.has('t') && Number.isFinite(t)) s.setT(t)
  const v = q.get('v') as ViewId | null
  if (v && VIEWS.some((x) => x.id === v)) s.setView(v)
  const cam = q.get('cam')?.split(',').map(Number)
  if (cam && cam.length >= 3 && cam.every(Number.isFinite)) {
    const c: Camera = { center: [cam[0], cam[1]], zoom: cam[2], pitch: cam[3] ?? 0, bearing: cam[4] ?? 0 }
    s.setCamera(c)
  }
  const sel = q.get('sel')?.split(':')
  if (sel?.length === 2) s.select({ kind: sel[0] as SelectionKind, id: sel[1] })
  const story = q.get('story')?.split(':')
  if (story?.length === 2) s.startStory(story[0], Number(story[1]) || 0)
}

let timer: number | undefined
export function syncUrl() {
  return useStore.subscribe((s) => {
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      const q = new URLSearchParams()
      q.set('t', s.t.toFixed(4))
      q.set('v', s.view)
      const c = s.camera
      q.set('cam', [c.center[0].toFixed(3), c.center[1].toFixed(3), c.zoom.toFixed(2), (c.pitch ?? 0).toFixed(0), (c.bearing ?? 0).toFixed(0)].join(','))
      if (s.selection) q.set('sel', `${s.selection.kind}:${s.selection.id}`)
      if (s.story) q.set('story', `${s.story.id}:${s.story.step}`)
      history.replaceState(null, '', `?${q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')}`)
    }, 250)
  })
}
