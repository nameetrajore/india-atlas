import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { LngLat } from '../types'

export interface UnitProps {
  id: string
  name: string
  division: string
  type: string
}
export type UnitFeature = Feature<Polygon | MultiPolygon, UnitProps>

export interface UnitIndex {
  features: UnitFeature[]
  byId: Map<string, UnitFeature>
  /** Planar centroid and area (degree units; fine for label placement). */
  centroid: Map<string, { c: LngLat; area: number }>
}

function ringStats(ring: number[][]) {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    a += f
    cx += (ring[j][0] + ring[i][0]) * f
    cy += (ring[j][1] + ring[i][1]) * f
  }
  a /= 2
  return a === 0 ? { a: 0, cx: ring[0][0], cy: ring[0][1] } : { a: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) }
}

export async function loadUnits(): Promise<UnitIndex> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/base/units-1941.geojson`)
  const fc = (await res.json()) as FeatureCollection<Polygon | MultiPolygon, UnitProps>
  const centroid = new Map<string, { c: LngLat; area: number }>()
  for (const f of fc.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    let A = 0
    let X = 0
    let Y = 0
    for (const p of polys) {
      const s = ringStats(p[0])
      A += s.a
      X += s.cx * s.a
      Y += s.cy * s.a
    }
    centroid.set(f.properties.id, { c: A ? [X / A, Y / A] : (polys[0][0][0] as LngLat), area: A })
  }
  return { features: fc.features, byId: new Map(fc.features.map((f) => [f.properties.id, f])), centroid }
}

/** Area-weighted label anchor per polity, from its units. Only polities above a minimum area get a label. */
export function polityAnchors(units: UnitIndex, assignment: Record<string, string>, minArea = 0.5) {
  const acc = new Map<string, { x: number; y: number; a: number }>()
  for (const [unit, polity] of Object.entries(assignment)) {
    const s = units.centroid.get(unit)
    if (!s) continue
    const v = acc.get(polity) ?? { x: 0, y: 0, a: 0 }
    v.x += s.c[0] * s.area
    v.y += s.c[1] * s.area
    v.a += s.area
    acc.set(polity, v)
  }
  // Scattered polities (groups of states, two-winged Pakistan) have centroids outside their own land;
  // fall back to the centroid of their largest unit.
  const largest = new Map<string, { c: LngLat; area: number }>()
  for (const [unit, polity] of Object.entries(assignment)) {
    const s = units.centroid.get(unit)
    if (s && s.area > (largest.get(polity)?.area ?? 0)) largest.set(polity, s)
  }
  return [...acc]
    .filter(([, v]) => v.a >= minArea)
    .map(([polity, v]) => {
      const c: LngLat = [v.x / v.a, v.y / v.a]
      const inside = Object.entries(assignment).some(([u, p]) => p === polity && contains(units.byId.get(u), c))
      return { polity, position: inside ? c : largest.get(polity)!.c, area: v.a }
    })
}

function inRing(ring: number[][], [x, y]: LngLat) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function contains(f: UnitFeature | undefined, p: LngLat) {
  if (!f) return false
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  return polys.some((poly) => inRing(poly[0], p) && !poly.slice(1).some((h) => inRing(h, p)))
}

/** The base unit containing a point, if any. */
export function unitAt(units: UnitIndex, p: LngLat): string | undefined {
  for (const f of units.features) if (contains(f, p)) return f.properties.id
  return undefined
}

const placeUnitCache = new WeakMap<UnitIndex, Map<string, string | undefined>>()
/** Memoised place → unit lookup. */
export function placeUnit(units: UnitIndex, id: string, p: LngLat) {
  let m = placeUnitCache.get(units)
  if (!m) placeUnitCache.set(units, (m = new Map()))
  if (!m.has(id)) m.set(id, unitAt(units, p))
  return m.get(id)
}
