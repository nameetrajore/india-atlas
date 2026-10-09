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
  return [...acc]
    .filter(([, v]) => v.a >= minArea)
    .map(([polity, v]) => ({ polity, position: [v.x / v.a, v.y / v.a] as LngLat, area: v.a }))
}
