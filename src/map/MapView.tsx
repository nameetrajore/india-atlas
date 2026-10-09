import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { currentScene, useStore } from '../store'
import { useToday, whereToday } from './today'
import { keyframeIndexAt, polityName } from '../lib/derive'
import { formatT } from '../lib/time'
import { BLOC_NAMES } from './layers'
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
    // Frame the scene in the part of the map the reader can see, not behind the panels.
    const phone = window.innerWidth <= 760
    const story = useStore.getState().mode === 'story'
    const padding = !story
      ? { top: 0, bottom: 0, left: 0, right: 0 }
      : phone
        ? { top: 40, bottom: Math.round(window.innerHeight * 0.42), left: 0, right: 0 }
        : { top: 40, bottom: 60, left: window.innerWidth <= 1280 ? 380 : 440, right: 0 }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.current.flyTo({
      center: c.center,
      zoom: c.zoom - (phone ? 0.6 : 0),
      pitch: c.pitch ?? 0,
      bearing: c.bearing ?? 0,
      padding,
      duration: reduce ? 0 : 2200,
      essential: true,
    })
  }, [flyTo])

  useEffect(() => {
    if (!content || !units || !overlay.current) return
    const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    // Hover: who ruled here at this date, and what it is today. Touch screens skip hover (tap opens cards).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- picked objects differ per layer
    const getTooltip = ({ object, layer }: { object?: any; layer?: { id: string } | null }) => {
      if (!object || !layer || matchMedia('(hover: none)').matches) return null
      let html = ''
      if (layer.id === 'polities') {
        const kf = content.keyframes[keyframeIndexAt(content.keyframes, t)]
        const pid = kf?.units[object.properties.id]
        const p = pid ? content.polities[pid] : undefined
        const who = p ? polityName(p, t) : BLOC_NAMES.indian
        const c = units.centroid.get(object.properties.id)?.c
        const now = todayIdx && c ? whereToday(todayIdx, c) : undefined
        html = `<div class="tt-title">${esc(who)}</div><div class="tt-sub">${esc(content.unitNames[object.properties.id] ?? '')} · ${formatT(t, 'year')}</div>${now ? `<div class="tt-today">Today: ${esc(now)}</div>` : ''}`
      } else if (layer.id === 'events') html = `<div class="tt-title">${esc(object.e.name)}</div><div class="tt-sub">${esc(object.e.date.label)}</div>`
      else if (layer.id === 'people') html = `<div class="tt-title">${esc(object.p.name)}</div><div class="tt-sub">${esc(object.p.role)}</div>`
      else if (layer.id === 'footholds') html = `<div class="tt-title">${esc(object.p.name)}</div><div class="tt-sub">${esc(polityName(content.polities[object.c.power], t))}</div>`
      else if (layer.id === 'place-labels') html = `<div class="tt-title">${esc(object.name)}</div>${object.modern && object.modern !== object.name ? `<div class="tt-sub">now ${esc(object.modern)}</div>` : ''}`
      else return null
      return { html, className: 'map-tooltip', style: { background: 'none', padding: '0' } }
    }
    overlay.current.setProps({
      getTooltip: getTooltip as never,
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
