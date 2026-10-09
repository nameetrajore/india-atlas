// Then vs now (D25): a second map of present-day states, clipped to the right of a draggable divider and
// locked to the main map's camera. The main map keeps all interaction; this one only draws.
import { useEffect, useRef, useState } from 'react'
import maplibregl, { type ExpressionSpecification, type StyleSpecification } from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { useStore } from '../store'
import { formatT } from '../lib/time'
import type { LngLat } from '../types'
import { baseStyle } from './style'
import { BLOC_COLORS, haloText, INK, LABEL_FONT, TEXT_BASE } from './layers'
import { declutter, type LabelCandidate } from './declutter'
import { loadToday, type TodayIndex } from './today'

const COUNTRY_COLORS: Record<string, number[]> = {
  India: BLOC_COLORS.india,
  Pakistan: BLOC_COLORS.pakistan,
  Bangladesh: [128, 172, 160],
  Myanmar: BLOC_COLORS.other,
}
const byCountry = (alpha: number, f = 1) => [
  'match',
  ['get', 'country'],
  ...Object.entries(COUNTRY_COLORS).flatMap(([k, c]) => [k, `rgba(${c.map((v) => Math.round(v * f)).join(',')},${alpha})`]),
  `rgba(${BLOC_COLORS.other.join(',')},${alpha})`,
] as unknown as ExpressionSpecification

function nowStyle(): StyleSpecification {
  const layers = [...baseStyle.layers]
  const at = layers.findIndex((l) => l.id === 'hillshade')
  // State fills go under the relief, as polity fills do on the main map, so both halves read alike.
  layers.splice(
    at,
    0,
    { id: 'today-fill', type: 'fill', source: 'today', paint: { 'fill-color': byCountry(0.62) } },
    { id: 'today-line', type: 'line', source: 'today', paint: { 'line-color': byCountry(0.75, 0.5), 'line-width': 0.9 } },
  )
  return {
    ...baseStyle,
    sources: { ...baseStyle.sources, today: { type: 'geojson', data: `${import.meta.env.BASE_URL}data/base/today.geojson` } },
    layers,
  }
}

interface Label {
  key: string
  text: string
  position: LngLat
  size: number
  caps: boolean
}

/** Country names, placed at the area-weighted centre of their states, then state names. */
function labelsOf(idx: TodayIndex): Label[] {
  const countries = new Map<string, { x: number; y: number; a: number }>()
  for (const an of idx.anchors) {
    const c = countries.get(an.country) ?? { x: 0, y: 0, a: 0 }
    countries.set(an.country, { x: c.x + an.position[0] * an.area, y: c.y + an.position[1] * an.area, a: c.a + an.area })
  }
  return [
    ...[...countries].map(([name, c]) => ({ key: `c:${name}`, text: name.toUpperCase(), position: [c.x / c.a, c.y / c.a] as LngLat, size: 16, caps: true })),
    ...idx.anchors.map((an) => ({ key: `s:${an.name}`, text: an.name, position: an.position, size: 11.5, caps: false })),
  ]
}

export function NowMap({ main }: { main: maplibregl.Map }) {
  const el = useRef<HTMLDivElement>(null)
  const split = useStore((s) => s.split)
  const t = useStore((s) => s.t)
  const setSplit = useStore((s) => s.setSplit)
  const [drag, setDrag] = useState(false)

  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!,
      style: nowStyle(),
      interactive: false,
      attributionControl: false,
      maxPitch: 60,
      minZoom: 0,
      center: main.getCenter(),
      zoom: main.getZoom(),
      pitch: main.getPitch(),
      bearing: main.getBearing(),
    })
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] })
    m.addControl(overlay)
    const sync = () => m.jumpTo({ center: main.getCenter(), zoom: main.getZoom(), pitch: main.getPitch(), bearing: main.getBearing(), padding: main.getPadding() })
    main.on('move', sync)
    sync()

    let labels: Label[] = []
    const place = () => {
      const project = (p: LngLat): [number, number] => {
        const q = m.project(p)
        return [q.x, q.y]
      }
      const cands: LabelCandidate[] = labels.map((l) => ({
        key: l.key,
        position: l.position,
        text: l.text,
        size: l.size,
        priority: l.caps ? 1e9 : 0,
        offset: [0, 0],
        anchor: 'middle',
        baseline: 'center',
      }))
      const shown = declutter(cands, project, [])
      overlay.setProps({
        layers: haloText({
          ...TEXT_BASE,
          id: 'now-labels',
          data: labels.filter((l) => shown.has(l.key)),
          getPosition: (d: Label) => d.position,
          getText: (d: Label) => d.text,
          getSize: (d: Label) => d.size,
          getColor: (d: Label) => (d.caps ? [...INK, 200] : [...INK, 255]),
          fontFamily: LABEL_FONT,
          fontWeight: 600,
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
        }),
      })
    }
    loadToday().then((idx) => {
      labels = labelsOf(idx)
      place()
    })
    m.on('moveend', place)
    return () => {
      main.off('move', sync)
      m.remove()
    }
  }, [main])

  const move = (e: React.PointerEvent) => drag && setSplit(e.clientX / window.innerWidth)
  const pct = `${(split * 100).toFixed(2)}%`
  return (
    <>
      <div className="now-map" style={{ clipPath: `inset(0 0 0 ${pct})` }}>
        <div ref={el} className="map-canvas" />
      </div>
      <div
        className={`split${drag ? ' dragging' : ''}`}
        style={{ left: pct }}
        role="slider"
        aria-label="Then and now divider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split * 100)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setSplit(split - 0.03)
          if (e.key === 'ArrowRight') setSplit(split + 0.03)
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDrag(true)
        }}
        onPointerMove={move}
        onPointerUp={() => setDrag(false)}
        onPointerCancel={() => setDrag(false)}
      >
        <span className="split-tag tag-then">{formatT(t, 'year')}</span>
        <span className="split-knob" aria-hidden>
          ‹›
        </span>
        <span className="split-tag tag-now">Today</span>
      </div>
    </>
  )
}
