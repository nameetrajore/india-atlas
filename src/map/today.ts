// Present-day boundaries for "compare with today" (D25).
import { useEffect, useState } from 'react'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { LngLat } from '../types'

export type TodayFeature = Feature<Polygon | MultiPolygon, { name: string; country: string }>
export interface TodayIndex {
  features: TodayFeature[]
  /** Label anchor per feature (largest polygon's ring average). */
  anchors: { name: string; country: string; position: LngLat; area: number }[]
}

let cache: Promise<TodayIndex> | null = null

function ringArea(r: number[][]) {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]
  return Math.abs(a / 2)
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
const polysOf = (f: TodayFeature) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)

export function loadToday(): Promise<TodayIndex> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/base/today.geojson`)
    .then((r) => r.json() as Promise<FeatureCollection<Polygon | MultiPolygon, { name: string; country: string }>>)
    .then((fc) => ({
      features: fc.features,
      anchors: fc.features.map((f) => {
        const big = polysOf(f).reduce((best, p) => (ringArea(p[0]) > ringArea(best[0]) ? p : best))
        const ring = big[0]
        const x = ring.reduce((s, c) => s + c[0], 0) / ring.length
        const y = ring.reduce((s, c) => s + c[1], 0) / ring.length
        return { ...f.properties, position: [x, y] as LngLat, area: polysOf(f).reduce((s, p) => s + ringArea(p[0]), 0) }
      }),
    }))
  return cache
}

/** "West Bengal, India" for a point, or undefined at sea / outside the layer. */
export function whereToday(idx: TodayIndex, p: LngLat): string | undefined {
  for (const f of idx.features)
    if (polysOf(f).some((poly) => inRing(poly[0], p) && !poly.slice(1).some((h) => inRing(h, p))))
      return f.properties.country === 'India' ? `${f.properties.name}, India` : `${f.properties.name}, ${f.properties.country}`
  return undefined
}

export function useToday(): TodayIndex | null {
  const [idx, setIdx] = useState<TodayIndex | null>(null)
  useEffect(() => {
    loadToday().then(setIdx)
  }, [])
  return idx
}
