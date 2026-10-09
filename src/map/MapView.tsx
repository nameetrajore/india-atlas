import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { currentScene, useStore } from '../store'
import { useToday } from './today'
import { baseStyle } from './style'
import { buildLayers, PULSE_MS } from './layers'
import { loadUnits, type UnitIndex } from './units'

export function MapView() {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const overlay = useRef<MapboxOverlay | null>(null)
  const [units, setUnits] = useState<UnitIndex | null>(null)
  const [zoom, setZoom] = useState(useStore.getState().camera.zoom)

  const content = useStore((s) => s.content)
  const t = useStore((s) => s.t)
  const scene = useStore((s) => currentScene(s))
  const detail = useStore((s) => s.detail)
  const showToday = useStore((s) => s.today)
  const todayIdx = useToday()
  const selection = useStore((s) => s.selection)
  const flyTo = useStore((s) => s.flyTo)
  // Labels are decluttered in screen space, so they recompute when the camera settles.
  const camera = useStore((s) => s.camera)
  const crossed = useStore((s) => s.crossed)
  // Animation clock for ripples; runs only while a ripple is alive.
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!crossed.some((c) => performance.now() - c.at < PULSE_MS)) return
    let raf = 0
    const tick = () => {
      const n = performance.now()
      setNow(n)
      if (crossed.some((c) => n - c.at < PULSE_MS)) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [crossed])

  useEffect(() => {
    loadUnits().then(setUnits)
    const cam = useStore.getState().camera
    const m = new maplibregl.Map({
      container: el.current!,
      style: baseStyle,
      center: cam.center,
      zoom: cam.zoom,
      pitch: cam.pitch ?? 0,
      bearing: cam.bearing ?? 0,
      maxPitch: 60,
      minZoom: 3.4,
      maxZoom: 11,
      maxBounds: [
        [45, -8],
        [118, 46],
      ],
      attributionControl: false,
    })
    const o = new MapboxOverlay({
      interleaved: true,
      layers: [],
      getCursor: ({ isHovering }) => (isHovering ? 'pointer' : 'grab'),
      onClick: (info) => {
        if (!info.picked) useStore.getState().select(null)
      },
    })
    m.addControl(o)
    m.on('moveend', () => {
      const c = m.getCenter()
      useStore.getState().setCamera({ center: [c.lng, c.lat], zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() })
    })
    m.on('zoomend', () => setZoom(m.getZoom()))
    map.current = m
    overlay.current = o
    return () => m.remove()
  }, [])

  useEffect(() => {
    if (!flyTo || !map.current) return
    const c = flyTo.camera
    map.current.flyTo({ center: c.center, zoom: c.zoom, pitch: c.pitch ?? 0, bearing: c.bearing ?? 0, duration: 2200, essential: true })
  }, [flyTo])

  useEffect(() => {
    if (!content || !units || !overlay.current) return
    overlay.current.setProps({
      layers: buildLayers({
        content,
        units,
        t,
        scene,
        detail,
        today: showToday ? todayIdx : null,
        selection,
        zoom,
        pulses: crossed.map((c) => ({ id: c.id, age: now - c.at })).filter((p) => p.age >= 0 && p.age < PULSE_MS),
        project: (p) => {
          const pt = map.current!.project(p)
          return [pt.x, pt.y]
        },
        onPick: (s) => useStore.getState().select(s),
      }),
    })
  }, [content, units, t, scene, detail, showToday, todayIdx, selection, zoom, camera, crossed, now])

  return (
    <div className="map">
      <div ref={el} className="map-canvas" />
    </div>
  )
}
