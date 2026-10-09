import { GeoJsonLayer, IconLayer, ScatterplotLayer, TextLayer, PathLayer } from '@deck.gl/layers'
import { TripsLayer } from '@deck.gl/geo-layers'
import { PathStyleExtension } from '@deck.gl/extensions'
import type { Layer } from '@deck.gl/core'
import type { Bloc, Content, HistEvent, LngLat, Person, Place, Scene, Selection } from '../types'
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
import { placeUnit, polityAnchors, type UnitFeature, type UnitIndex } from './units'
import { declutter, type LabelCandidate } from './declutter'

type RGB = [number, number, number]
export const INK: RGB = [36, 27, 20]
export const PAPER: RGB = [246, 239, 222]
/** Trail timestamps are stored relative to this, to keep float32 precision on the GPU. */
export const T0 = 1800
/** Ripple duration for events the playhead just crossed (ms). */
export const PULSE_MS = 1800

const PERSON_COLORS: Record<string, RGB> = {
  gandhi: [150, 60, 20],
  lakshmibai: [140, 30, 60],
  'subhas-bose': [40, 80, 60],
  'bhagat-singh': [170, 110, 20],
  clive: [150, 40, 25],
  'siraj-ud-daulah': [30, 90, 70],
}
export const personColor = (id: string): RGB => PERSON_COLORS[id] ?? [60, 60, 90]

/** Simple-map colours (D25): one per bloc; the atlas convention of pink for British, yellow for Indian. */
export const BLOC_COLORS: Record<Bloc, RGB> = {
  british: [228, 146, 138],
  indian: [236, 214, 146],
  european: [120, 140, 190],
  india: [227, 163, 95],
  pakistan: [127, 165, 122],
  other: [205, 197, 176],
}
export const BLOC_NAMES: Record<Bloc, string> = {
  british: 'British (Company, then Crown)',
  indian: 'Indian rulers',
  european: 'Other Europeans',
  india: 'India (1947)',
  pakistan: 'Pakistan (1947)',
  other: 'Beyond British India',
}

export interface LayerArgs {
  content: Content
  units: UnitIndex
  t: number
  /** Story scene: when set, only what it references is drawn. */
  scene: Scene | null
  detail: boolean
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
export const FLAT = { parameters: { depthCompare: 'always', depthWriteEnabled: false } } as const

export const TEXT_BASE = {
  ...FLAT,
  sizeUnits: 'pixels',
  // Bitmap glyphs, not SDF: deck.gl's SDF path renders this serif jagged and the outline smears it.
  // Labels sit in dark ink on light fills, so they read without a halo, like a printed atlas.
  fontSettings: { sdf: false, fontSize: 64, buffer: 4 },
  characterSet: 'auto',
} as const
export const LABEL_FONT = '"Source Serif 4"'

/** Eight offsets (px) for a crisp halo around bitmap text. */
const HALO = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [1.1, 1.1], [-1.1, 1.1], [1.1, -1.1], [-1.1, -1.1]]

/**
 * A text layer with a halo. Bitmap glyphs can't carry an SDF outline, so the halo is the same text drawn in
 * the paper colour at small offsets underneath. It hides lines and borders behind the label and keeps edges crisp.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props are TextLayer props for varied data types
export function haloText(props: any, haloAlpha = 235): Layer[] {
  const off = props.getPixelOffset ?? [0, 0]
  const offAt = (d: unknown): number[] => (typeof off === 'function' ? off(d) : off)
  const halos = HALO.map(
    ([dx, dy], i) =>
      new TextLayer({
        ...props,
        id: `${props.id}-halo${i}`,
        pickable: false,
        getColor: [...PAPER, haloAlpha],
        getPixelOffset: (d: unknown) => {
          const o = offAt(d)
          return [o[0] + dx, o[1] + dy]
        },
        updateTriggers: { ...props.updateTriggers, getColor: [haloAlpha], getPixelOffset: [props.updateTriggers?.getPixelOffset, dx, dy] },
      }),
  )
  return [...halos, new TextLayer(props)]
}

export function buildLayers(a: LayerArgs): Layer[] {
  const { content, units, t, scene, selection } = a
  const layers: Layer[] = []
  const ki = keyframeIndexAt(content.keyframes, t)
  const assignment = ki >= 0 ? content.keyframes[ki].units : {}
  const selectedPolity =
    selection?.kind === 'polity' ? selection.id : selection?.kind === 'unit' ? assignment[selection.id] : undefined
  const highlight = new Set([...(scene?.show.polities ?? []), ...(selectedPolity ? [selectedPolity] : [])])
  const colorOf = (polity: string | undefined): RGB => {
    if (!polity) return BLOC_COLORS.indian
    const p = content.polities[polity]
    return a.detail || highlight.has(polity) ? p.color : BLOC_COLORS[p.bloc]
  }

  // ---- what to draw: the scene's things, or the most important things near t (D25)
  const scenePlaces = new Set(scene?.show.places ?? [])
  const footholds = content.places.flatMap((p) => {
    if (scene && !scenePlaces.has(p.id)) return []
    const c = controlAt(p, t)
    if (!c) return []
    // A British post is a foothold only while the land around it is not yet British.
    const unit = placeUnit(units, p.id, p.coords)
    const around = unit ? assignment[unit] : undefined
    const surrounded = around && content.polities[around].bloc === content.polities[c.power].bloc
    return surrounded ? [] : [{ p, c }]
  })
  const sig = placeSignificance(content, t)
  const mapped = content.events.filter((e) => e.coords)
  const selEventId = selection?.kind === 'event' ? selection.id : undefined
  const events = scene
    ? mapped.filter((e) => scene.show.events.includes(e.id) || e.id === selEventId).map((e) => ({ e, o: e.date.t <= t + 0.01 ? 1 : 0.45 }))
    : mapped
        .flatMap((e) => {
          const o = eventOpacity(e, t)
          return o > 0.05 || e.id === selEventId ? [{ e, o: Math.max(o, e.id === selEventId ? 1 : 0) }] : []
        })
        .sort((x, y) => y.e.significance * y.o - x.e.significance * x.o)
        .slice(0, 6)
  const tier1 = content.people.filter((p) => p.itinerary.length && (!scene || scene.show.people.includes(p.id)))
  const markers = tier1.flatMap((p) => {
    const s = personAt(p, t)
    return s ? [{ p, s }] : []
  })
  const labelledPolities = a.detail ? null : highlight
  const anchors = polityAnchors(units, assignment, 1.5).filter(
    (an) => content.polities[an.polity].kind !== 'tribal' && (!labelledPolities || labelledPolities.has(an.polity)),
  )
  const nameOf = (id: string) => polityName(content.polities[id], t)
  const placeVisible = (p: Place) =>
    scene ? scenePlaces.has(p.id) || events.some((d) => d.e.place === p.id) : (sig.get(p.id) ?? 0) > 1.2 || events.some((d) => d.e.place === p.id)

  // ---- labels: one shared declutter pass, people > selected > places > polities
  const cands: LabelCandidate[] = []
  for (const m of markers)
    cands.push({ key: `person:${m.p.id}`, position: m.s.position, text: m.p.name, size: 13.5, priority: 1e6, offset: [13, 0], alts: [[13, 18], [13, -18], [26, 0], [26, 20], [26, -20]], anchor: 'start', baseline: 'center' })
  const markerR = new Map<string, number>()
  for (const f of footholds) markerR.set(f.p.id, Math.max(markerR.get(f.p.id) ?? 0, 7))
  for (const d of events) markerR.set(d.e.place!, Math.max(markerR.get(d.e.place!) ?? 0, badgeSize(d.e.significance) / 2))
  const placeOffset = (id: string): [number, number] => [0, -((markerR.get(id) ?? 3) + 3)]
  const placeSize = (id: string) => Math.max(13, Math.min(22, 12 + 2.8 * Math.sqrt(sig.get(id) ?? 0)))
  const selEvent = selection?.kind === 'event' ? content.events.find((e) => e.id === selection.id) : undefined
  for (const p of content.places) {
      if (!placeVisible(p)) continue
      const bonus = isSel(selection, 'place', p.id) || selEvent?.place === p.id ? 2e6 : 0
      cands.push({ key: `place:${p.id}`, position: p.coords, text: p.name, size: placeSize(p.id), priority: 1000 + (sig.get(p.id) ?? 0) * 10 + bonus, offset: placeOffset(p.id), alts: [[0, (markerR.get(p.id) ?? 3) + 3 + placeSize(p.id) * 1.1]], anchor: 'middle', baseline: 'bottom', force: bonus > 0 })
    }
  const politySize = (area: number) => Math.min(16, 10 + Math.sqrt(area) * 1.1) * Math.min(1.25, Math.max(0.85, a.zoom / 5))
  for (const an of anchors)
    cands.push({ key: `polity:${an.polity}`, position: an.position, text: nameOf(an.polity).toUpperCase(), size: politySize(an.area), priority: an.area, offset: [0, 0], anchor: 'middle', baseline: 'center', wrap: 16 })
  const obstacles: [LngLat, number][] = [
    ...markers.map((m): [LngLat, number] => [m.s.position, 8]),
    ...footholds.map((f): [LngLat, number] => [f.p.coords, 7]),
    ...events.map((d): [LngLat, number] => [d.e.coords!, badgeSize(d.e.significance) / 2]),
  ]
  const shown = declutter(cands, a.project, obstacles)

  // ---- polities
  {
    const alpha = Math.round(0.62 * 255)
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
          return [...colorOf(p), p && p === selectedPolity ? Math.min(255, alpha + 60) : alpha]
        },
        // Unit borders stay faint; the eye should read polities, not districts.
        getLineColor: (f: { properties: { id: string } }) => darken(colorOf(assignment[f.properties.id]), 0.55, a.detail ? 55 : 22),
        getLineWidth: 0.5,
        lineWidthUnits: 'pixels',
        updateTriggers: { getFillColor: [ki, selectedPolity, a.detail, scene], getLineColor: [ki, a.detail, scene] },
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
      ...haloText({
        ...TEXT_BASE,
        id: 'polity-labels',
        data: anchors.filter((an) => shown.has(`polity:${an.polity}`)),
        getPosition: (d: Anchor) => d.position,
        getText: (d: Anchor) => nameOf(d.polity).toUpperCase(),
        getSize: (d: Anchor) => politySize(d.area),
        getColor: (d: Anchor) => darken(colorOf(d.polity), 0.32, 255),
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        maxWidth: 16 * 0.62,
        wordBreak: 'break-word',
        lineHeight: 1.05,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        updateTriggers: { getText: [ki, Math.floor(t)], getColor: [ki, a.detail, scene], getSize: [a.zoom] },
      } as never),
    )
  }

  // ---- non-British European enclaves
  {
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
  {
    type EV = { e: HistEvent; o: number }
    const byId = new Map(mapped.map((e) => [e.id, e]))
    const pulses = a.pulses.flatMap((p) => {
      const e = byId.get(p.id)
      return e ? [{ e, f: p.age / PULSE_MS }] : []
    })
    layers.push(
      new ScatterplotLayer<(typeof pulses)[number]>({
        ...FLAT,
        id: 'event-pulses',
        data: pulses,
        getPosition: (d) => d.e.coords!,
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
        getPosition: (d) => d.e.coords!,
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
  {
    layers.push(
      ...haloText({
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
        getPixelOffset: (p: Place) => shown.get(`place:${p.id}`)?.offset ?? placeOffset(p.id),
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        updateTriggers: { getSize: [t], getPixelOffset: [shown] },
        onClick: (info: { object?: Place }) => (info.object && a.onPick({ kind: 'place', id: info.object.id }), true),
      } as never),
    )
  }

  // ---- people: dashed known route, fading trail, marker, name
  {
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
      ...haloText({
        ...TEXT_BASE,
        id: 'people-labels',
        data: markers.filter((m) => shown.has(`person:${m.p.id}`)),
        getPosition: (d: M) => d.s.position,
        getText: (d: M) => d.p.name,
        getSize: 13.5,
        getColor: (d: M) => darken(personColor(d.p.id), 0.8, Math.round(255 * d.s.opacity)),
        fontFamily: 'Inter',
        fontWeight: 600,
        getPixelOffset: (d: M) => shown.get(`person:${d.p.id}`)?.offset ?? [13, 0],
        getTextAnchor: 'start',
        getAlignmentBaseline: 'center',
        updateTriggers: { getPosition: [t], getColor: [t], getPixelOffset: [shown] },
      } as never),
    )
  }

  // Text last: without halos, labels must sit above trails, borders and markers to stay readable.
  const ordered = [...layers.filter((l) => !(l instanceof TextLayer)), ...layers.filter((l) => l instanceof TextLayer)]
  return ordered
}
