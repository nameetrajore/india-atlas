import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { currentScene, useStore } from '../store'
import { useToday, whereToday } from './today'
import { keyframeIndexAt, polityName } from '../lib/derive'
import { formatT } from '../lib/time'
import { BLOC_NAMES } from './layers'
import { baseStyle } from './style'
import { buildLayers, PULSE_MS, tradeDots, visibleTrade } from './layers'
import type { Layer } from '@deck.gl/core'
import type { Content, Scene } from '../types'
import { NowMap } from './NowMap'
import { loadUnits, type UnitIndex } from './units'

export function MapView() {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [main, setMain] = useState<maplibregl.Map | null>(null)
  const overlay = useRef<MapboxOverlay | null>(null)
  const [units, setUnits] = useState<UnitIndex | null>(null)
  const [zoom, setZoom] = useState(useStore.getState().camera.zoom)

  const content = useStore((s) => s.content)
  const t = useStore((s) => s.t)
  const storyScene = useStore((s) => currentScene(s))
  const econ = useStore((s) => s.econ)
  const journey = useStore((s) => s.journey?.person ?? null)
  const scene = useMemo(() => (journey && content ? journeyScene(content, journey, t) : storyScene), [journey, content, t, storyScene])
  const base = useRef<Layer[]>([])
  const dotsLayer = useRef<Layer | null>(null)
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
    setMain(m)
    overlay.current = o
    return () => m.remove()
  }, [])

  useEffect(() => {
    if (!flyTo || !map.current) return
    const c = flyTo.camera
    // Frame the scene in the part of the map the reader can see, not behind the panels.
    const phone = window.innerWidth <= 760
    const story = useStore.getState().mode === 'story'
    const journeying = !!useStore.getState().journey
    const padding = journeying
      ? phone
        ? { top: 40, bottom: Math.round(window.innerHeight * 0.5), left: 0, right: 0 }
        : { top: 40, bottom: 200, left: window.innerWidth <= 1280 ? 350 : 380, right: 0 }
      : !story
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
      else if (layer.id === 'railways') html = `<div class="tt-title">${esc(object.line)}</div><div class="tt-sub">Opened ${esc(object.opened.label)}${object.note ? ` · ${esc(object.note)}` : ''}</div>`
      else if (layer.id === 'trade') html = `<div class="tt-title">${esc(object.name)}</div><div class="tt-sub">${esc(object.goods)} · ${esc(object.from.label)}–${esc(object.to.label)}</div>${object.beyond ? `<div class="tt-sub">${esc(object.beyond)}</div>` : ''}`
      else if (layer.id === 'place-labels') html = `<div class="tt-title">${esc(object.name)}</div>${object.modern && object.modern !== object.name ? `<div class="tt-sub">now ${esc(object.modern)}</div>` : ''}`
      else return null
      return { html, className: 'map-tooltip', style: { background: 'none', padding: '0' } }
    }
    base.current = buildLayers({
        content,
        units,
        t,
        scene,
        detail,
        econ,
        journey,
        selection,
        zoom,
        pulses: crossed.map((c) => ({ id: c.id, age: now - c.at })).filter((p) => p.age >= 0 && p.age < PULSE_MS),
        project: (p) => {
          const pt = map.current!.project(p)
          return [pt.x, pt.y]
        },
        onPick: (s) => useStore.getState().select(s),
      })
    const dl = dotsLayer.current
    overlay.current.setProps({ getTooltip: getTooltip as never, layers: dl ? base.current.map((l) => (l.id === 'trade-dots' ? dl : l)) : base.current })
  }, [content, units, t, scene, detail, econ, journey, todayIdx, selection, zoom, camera, crossed, now])

  // Cargo dots move continuously along the visible trade routes; only that one layer is rebuilt per frame.
  const routes = useMemo(() => (content ? visibleTrade(content, t, scene, econ) : []), [content, t, scene, econ])
  useEffect(() => {
    dotsLayer.current = null
    if (!routes.length || !overlay.current) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const tick = (clock: number) => {
      const dots = tradeDots(routes, reduce ? 0 : clock)
      dotsLayer.current = dots
      overlay.current?.setProps({ layers: base.current.map((l) => (l.id === 'trade-dots' ? dots : l)) })
      if (!reduce) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [routes])

  return (
    <div className="map">
      <div ref={el} className="map-canvas" />
      {showToday && main && <NowMap main={main} />}
    </div>
  )
}

/** Follow-a-person as a scene: only that person, the places they have reached by t, and their events so far. */
function journeyScene(content: Content, id: string, t: number): Scene | null {
  const p = content.people.find((x) => x.id === id)
  if (!p) return null
  const places = [...new Set(p.itinerary.filter((s) => s.place && s.date.t <= t + 0.001).map((s) => s.place!))]
  const events = content.events.filter((e) => e.participants.includes(id) && e.date.t <= t + 0.001).map((e) => e.id)
  return {
    id: `journey-${id}`,
    date: p.itinerary[0].date,
    camera: { center: [0, 0], zoom: 0 },
    title: p.name,
    text: '',
    show: { events, people: [id], places, polities: [], trade: [], railways: false },
  }
}
