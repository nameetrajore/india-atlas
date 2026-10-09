import { GeoJsonLayer, IconLayer, ScatterplotLayer, TextLayer, PathLayer } from '@deck.gl/layers'
import { TripsLayer } from '@deck.gl/geo-layers'
import { PathStyleExtension } from '@deck.gl/extensions'
import type { Layer } from '@deck.gl/core'
import type { Content, HistEvent, LensId, LngLat, Person, Place, Selection } from '../types'
import {
  controlAt,
  eventOpacity,
  keyframeIndexAt,
  personAt,
  personSegments,
  placeSignificance,
  polityName,
  type PersonState,
  type Segment,
} from '../lib/derive'
import { badgeUrl, hexToRgb, kindDef } from '../ui/icons'
import { polityAnchors, type UnitFeature, type UnitIndex } from './units'
import { declutter, type LabelCandidate } from './declutter'

type RGB = [number, number, number]
const INK: RGB = [36, 27, 20]
const PAPER: RGB = [246, 239, 222]
const UNMAPPED: RGB = [214, 203, 178]
/** Trail timestamps are stored relative to this, to keep float32 precision on the GPU. */
export const T0 = 1800
/** Ripple duration for events the playhead just crossed (ms). */
export const PULSE_MS = 1800

const PERSON_COLORS: Record<string, RGB> = {
  gandhi: [150, 60, 20],
  lakshmibai: [140, 30, 60],
  'subhas-bose': [40, 80, 60],
  'bhagat-singh': [170, 110, 20],
}
export const personColor = (id: string): RGB => PERSON_COLORS[id] ?? [60, 60, 90]

export interface LayerArgs {
  content: Content
  units: UnitIndex
  t: number
  lenses: Set<LensId>
  polityOpacity: number
  selection: Selection | null
  zoom: number
  project: (p: LngLat) => [number, number]
  pulses: { id: string; age: number }[]
  onPick: (s: Selection) => void
}

const isSel = (sel: Selection | null, kind: Selection['kind'], id: string) => sel?.kind === kind && sel.id === id
const darken = (c: RGB, f: number, a: number) => [c[0] * f, c[1] * f, c[2] * f, a] as [number, number, number, number]
/** Badge diameter in px by significance. */
const badgeSize = (sig: number) => 16 + sig * 4

/** Overlays draw in order, never depth-tested against each other (interleaved mode z-fights otherwise). */
const FLAT = { parameters: { depthCompare: 'always', depthWriteEnabled: false } } as const

const TEXT_BASE = {
  ...FLAT,
  sizeUnits: 'pixels',
  fontSettings: { sdf: true, fontSize: 96, buffer: 12, radius: 18, cutoff: 0.2, smoothing: 0.1 },
  characterSet: 'auto',
  outlineColor: [...PAPER, 255],
} as const
const LABEL_FONT = '"Source Serif 4"'

export function buildLayers(a: LayerArgs): Layer[] {
  const { content, units, t, lenses, selection } = a
  const layers: Layer[] = []
  const ki = keyframeIndexAt(content.keyframes, t)
  const assignment = ki >= 0 ? content.keyframes[ki].units : {}
  const selectedPolity =
    selection?.kind === 'polity' ? selection.id : selection?.kind === 'unit' ? assignment[selection.id] : undefined

  // ---- derived state at t
  const footholds = lenses.has('footholds')
    ? content.places.flatMap((p) => {
        const c = controlAt(p, t)
        return c ? [{ p, c }] : []
      })
    : []
  const sig = placeSignificance(content, t)
  const events = lenses.has('events')
    ? content.events.flatMap((e) => {
        const o = eventOpacity(e, t)
        return o > 0.02 ? [{ e, o }] : []
      })
    : []
  const tier1 = content.people.filter((p) => p.itinerary.length)
  const markers = lenses.has('people')
    ? tier1.flatMap((p) => {
        const s = personAt(p, t)
        return s ? [{ p, s }] : []
      })
    : []
  const anchors = lenses.has('polities')
    ? polityAnchors(units, assignment, 1.5).filter((an) => content.polities[an.polity].kind !== 'tribal')
    : []
  const nameOf = (id: string) => polityName(content.polities[id], t)

  // ---- labels: one shared declutter pass, people > selected > places > polities
  const cands: LabelCandidate[] = []
  for (const m of markers)
    cands.push({ key: `person:${m.p.id}`, position: m.s.position, text: m.p.name, size: 13.5, priority: 1e6, offset: [13, 0], alts: [[13, 18], [13, -18], [26, 0], [26, 20], [26, -20]], anchor: 'start', baseline: 'center' })
  const markerR = new Map<string, number>()
  for (const f of footholds) markerR.set(f.p.id, Math.max(markerR.get(f.p.id) ?? 0, 7))
  for (const d of events) markerR.set(d.e.place, Math.max(markerR.get(d.e.place) ?? 0, badgeSize(d.e.significance) / 2))
  const placeOffset = (id: string): [number, number] => [0, -((markerR.get(id) ?? 3) + 3)]
  const placeSize = (id: string) => Math.max(13, Math.min(22, 12 + 2.8 * Math.sqrt(sig.get(id) ?? 0)))
  const selEvent = selection?.kind === 'event' ? content.events.find((e) => e.id === selection.id) : undefined
  if (lenses.has('places'))
    for (const p of content.places) {
      const bonus = isSel(selection, 'place', p.id) || selEvent?.place === p.id ? 2e6 : 0
      cands.push({ key: `place:${p.id}`, position: p.coords, text: p.name, size: placeSize(p.id), priority: 1000 + (sig.get(p.id) ?? 0) * 10 + bonus, offset: placeOffset(p.id), alts: [[0, (markerR.get(p.id) ?? 3) + 3 + placeSize(p.id) * 1.1]], anchor: 'middle', baseline: 'bottom', force: bonus > 0 })
    }
  const politySize = (area: number) => Math.min(16, 10 + Math.sqrt(area) * 1.1) * Math.min(1.25, Math.max(0.85, a.zoom / 5))
  for (const an of anchors)
    cands.push({ key: `polity:${an.polity}`, position: an.position, text: nameOf(an.polity).toUpperCase(), size: politySize(an.area), priority: an.area, offset: [0, 0], anchor: 'middle', baseline: 'center', wrap: 16 })
  const obstacles: [LngLat, number][] = [
    ...markers.map((m): [LngLat, number] => [m.s.position, 8]),
    ...footholds.map((f): [LngLat, number] => [f.p.coords, 7]),
    ...events.map((d): [LngLat, number] => [d.e.coords, badgeSize(d.e.significance) / 2]),
  ]
  const shown = declutter(cands, a.project, obstacles)

  // ---- polities
  if (lenses.has('polities')) {
    const alpha = Math.round(a.polityOpacity * 255)
    layers.push(
      new GeoJsonLayer({
        id: 'polities',
        beforeId: 'hillshade',
        data: units.features as never,
        pickable: true,
        stroked: true,
        filled: true,
        getFillColor: (f: { properties: { id: string } }) => {
          const p = assignment[f.properties.id]
          if (!p) return [...UNMAPPED, Math.round(alpha * 0.35)]
          return [...content.polities[p].color, p === selectedPolity ? Math.min(255, alpha + 60) : alpha]
        },
        // Unit borders stay faint; the eye should read polities, not districts.
        getLineColor: (f: { properties: { id: string } }) => {
          const p = assignment[f.properties.id]
          return p ? darken(content.polities[p].color, 0.55, 55) : [150, 135, 110, 25]
        },
        getLineWidth: 0.5,
        lineWidthUnits: 'pixels',
        updateTriggers: { getFillColor: [ki, alpha, selectedPolity], getLineColor: [ki] },
        transitions: { getFillColor: { duration: 700 } },
        onClick: (info) => {
          const f = info.object as UnitFeature | undefined
          if (f) a.onPick({ kind: 'unit', id: f.properties.id })
          return true
        },
      }),
    )
    type Anchor = (typeof anchors)[number]
    layers.push(
      new TextLayer<Anchor>({
        ...TEXT_BASE,
        id: 'polity-labels',
        data: anchors.filter((an) => shown.has(`polity:${an.polity}`)),
        getPosition: (d: Anchor) => d.position,
        getText: (d: Anchor) => nameOf(d.polity).toUpperCase(),
        getSize: (d: Anchor) => politySize(d.area),
        getColor: (d: Anchor) => darken(content.polities[d.polity].color, 0.32, 255),
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        outlineWidth: 4,
        outlineColor: [...PAPER, 200],
        maxWidth: 16 * 0.62,
        wordBreak: 'break-word',
        lineHeight: 1.05,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        updateTriggers: { getText: [ki, Math.floor(t)], getColor: [ki], getSize: [a.zoom] },
      } as never),
    )
  }

  // ---- non-British enclaves
  if (footholds.length) {
    layers.push(
      new ScatterplotLayer<(typeof footholds)[number]>({
        ...FLAT,
        id: 'footholds',
        data: footholds,
        pickable: true,
        getPosition: (d) => d.p.coords,
        getRadius: (d) => (isSel(selection, 'place', d.p.id) ? 9 : 6),
        radiusUnits: 'pixels',
        getFillColor: (d) => content.polities[d.c.power].color,
        getLineColor: [...PAPER, 255],
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        stroked: true,
        updateTriggers: { getFillColor: [t], getRadius: [selection] },
        onClick: (info) => (info.object && a.onPick({ kind: 'place', id: info.object.p.id }), true),
      }),
    )
  }

  // ---- events: icon badges by kind; ripples for ones just crossed
  if (lenses.has('events')) {
    type EV = { e: HistEvent; o: number }
    const byId = new Map(content.events.map((e) => [e.id, e]))
    const pulses = a.pulses.flatMap((p) => {
      const e = byId.get(p.id)
      return e ? [{ e, f: p.age / PULSE_MS }] : []
    })
    layers.push(
      new ScatterplotLayer<(typeof pulses)[number]>({
        ...FLAT,
        id: 'event-pulses',
        data: pulses,
        getPosition: (d) => d.e.coords,
        getRadius: (d) => badgeSize(d.e.significance) / 2 + d.f * (40 + d.e.significance * 14),
        radiusUnits: 'pixels',
        filled: false,
        stroked: true,
        getLineColor: (d) => [...hexToRgb(kindDef(d.e.kind).color), Math.round(230 * (1 - d.f))],
        getLineWidth: (d) => 3 * (1 - d.f) + 0.5,
        lineWidthUnits: 'pixels',
        updateTriggers: { getRadius: [a.pulses], getLineColor: [a.pulses], getLineWidth: [a.pulses] },
      }),
      new IconLayer<EV>({
        ...FLAT,
        id: 'events',
        data: events,
        pickable: true,
        getPosition: (d) => d.e.coords,
        getIcon: (d) => ({ url: badgeUrl(d.e.kind), id: d.e.kind, width: 64, height: 64 }),
        getSize: (d) => badgeSize(d.e.significance) * (isSel(selection, 'event', d.e.id) ? 1.3 : 1),
        sizeUnits: 'pixels',
        getColor: (d) => [255, 255, 255, Math.round(255 * d.o)],
        updateTriggers: { getSize: [selection], getColor: [t] },
        onClick: (info) => (info.object && a.onPick({ kind: 'event', id: info.object.e.id }), true),
      }),
    )
  }

  // ---- place labels
  if (lenses.has('places')) {
    layers.push(
      new TextLayer<Place>({
        ...TEXT_BASE,
        id: 'place-labels',
        data: content.places.filter((p) => shown.has(`place:${p.id}`)),
        pickable: true,
        getPosition: (p: Place) => p.coords,
        getText: (p: Place) => p.name,
        getSize: (p: Place) => placeSize(p.id),
        getColor: () => [...INK, 255],
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        outlineWidth: 5,
        getPixelOffset: (p: Place) => shown.get(`place:${p.id}`)?.offset ?? placeOffset(p.id),
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        updateTriggers: { getSize: [t], getPixelOffset: [shown] },
        onClick: (info: { object?: Place }) => (info.object && a.onPick({ kind: 'place', id: info.object.id }), true),
      } as never),
    )
  }

  // ---- people: dashed known route, fading trail, marker, name
  if (lenses.has('people')) {
    const segments: Segment[] = tier1.flatMap((p) => personSegments(p, T0))
    layers.push(
      new PathLayer<Segment>({
        ...FLAT,
        id: 'people-route',
        data: segments,
        getPath: (d: Segment) => d.path,
        getColor: (d: Segment) => [...personColor(d.person), 60],
        getWidth: 1.5,
        widthUnits: 'pixels',
        getDashArray: [4, 4],
        dashJustified: true,
        extensions: [new PathStyleExtension({ dash: true })],
      } as never),
      new TripsLayer<Segment>({
        ...FLAT,
        id: 'people-trails',
        data: segments,
        getPath: (d) => d.path,
        getTimestamps: (d) => d.timestamps,
        getColor: (d) => personColor(d.person),
        currentTime: t - T0,
        trailLength: 1.5,
        fadeTrail: true,
        widthMinPixels: 3,
        capRounded: true,
        jointRounded: true,
      }),
    )
    type M = { p: Person; s: PersonState }
    layers.push(
      new ScatterplotLayer<M>({
        ...FLAT,
        id: 'people',
        data: markers,
        pickable: true,
        getPosition: (d) => d.s.position,
        getRadius: (d) => (isSel(selection, 'person', d.p.id) ? 9 : 7),
        radiusUnits: 'pixels',
        getFillColor: (d) => [...personColor(d.p.id), Math.round(255 * d.s.opacity)],
        getLineColor: (d) => [...PAPER, Math.round(255 * d.s.opacity)],
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 2.5,
        updateTriggers: { getPosition: [t], getFillColor: [t], getLineColor: [t], getRadius: [selection] },
        onClick: (info) => (info.object && a.onPick({ kind: 'person', id: info.object.p.id }), true),
      }),
      new TextLayer<M>({
        ...TEXT_BASE,
        id: 'people-labels',
        data: markers.filter((m) => shown.has(`person:${m.p.id}`)),
        getPosition: (d: M) => d.s.position,
        getText: (d: M) => d.p.name,
        getSize: 13.5,
        getColor: (d: M) => darken(personColor(d.p.id), 0.8, Math.round(255 * d.s.opacity)),
        fontFamily: 'Inter',
        fontWeight: 600,
        outlineWidth: 5,
        getPixelOffset: (d: M) => shown.get(`person:${d.p.id}`)?.offset ?? [13, 0],
        getTextAnchor: 'start',
        getAlignmentBaseline: 'center',
        updateTriggers: { getPosition: [t], getColor: [t], getPixelOffset: [shown] },
      } as never),
    )
  }

  return layers
}
