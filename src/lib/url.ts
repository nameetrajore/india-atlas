// Every view is a URL (D8): mode, chapter/scene or time, camera, selection, toggles.
import { useStore } from '../store'
import type { Camera, SelectionKind } from '../types'

export function readUrl() {
  const q = new URLSearchParams(location.search)
  const s = useStore.getState()
  if (q.get('detail') === '1') s.setDetail(true)
  if (q.get('today') === '1') s.setToday(true)
  if (q.get('mode') === 'explore') {
    s.setMode('explore')
    const t = Number(q.get('t'))
    if (q.has('t') && Number.isFinite(t)) s.setT(t, { announce: false })
    const cam = q.get('cam')?.split(',').map(Number)
    if (cam && cam.length >= 3 && cam.every(Number.isFinite)) {
      const c: Camera = { center: [cam[0], cam[1]], zoom: cam[2], pitch: cam[3] ?? 0, bearing: cam[4] ?? 0 }
      s.setCamera(c)
    }
  } else if (q.has('ch')) {
    const ch = Number(q.get('ch'))
    const sc = Number(q.get('sc') ?? 0)
    if (s.content?.chapters[ch]) s.openChapter(ch, Math.min(sc, s.content.chapters[ch].scenes.length - 1))
  }
  const sel = q.get('sel')?.split(':')
  if (sel?.length === 2) s.select({ kind: sel[0] as SelectionKind, id: sel[1] })
}

let timer: number | undefined
export function syncUrl() {
  return useStore.subscribe((s) => {
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      const q = new URLSearchParams()
      if (s.mode === 'explore') {
        q.set('mode', 'explore')
        q.set('t', s.t.toFixed(4))
        const c = s.camera
        q.set('cam', [c.center[0].toFixed(3), c.center[1].toFixed(3), c.zoom.toFixed(2), (c.pitch ?? 0).toFixed(0), (c.bearing ?? 0).toFixed(0)].join(','))
      } else if (s.chapter !== null) {
        q.set('ch', String(s.chapter))
        q.set('sc', String(s.scene))
      }
      if (s.detail) q.set('detail', '1')
      if (s.today) q.set('today', '1')
      if (s.selection) q.set('sel', `${s.selection.kind}:${s.selection.id}`)
      const qs = q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')
      history.replaceState(null, '', qs ? `?${qs}` : location.pathname)
    }, 250)
  })
}
