import type { LngLat } from '../types'

export interface LabelCandidate {
  key: string
  position: LngLat
  text: string
  size: number
  priority: number
  /** Pixel offset of the text anchor, and how the box extends from it. */
  offset: [number, number]
  anchor: 'middle' | 'start'
  baseline: 'bottom' | 'center'
  /** Max characters per line, for wrapped labels. */
  wrap?: number
  /** Always place (e.g. the selected item's label), still reserving its space. */
  force?: boolean
  /** Fallback offsets to try when the primary position collides. */
  alts?: [number, number][]
}

export interface Placement {
  offset: [number, number]
}

/**
 * Greedy screen-space declutter: highest priority first, drop any label whose box overlaps one already placed.
 * Width is estimated from character count (serif caps ≈ 0.62em, mixed case ≈ 0.5em); good enough for a few hundred labels.
 */
export function declutter(
  cands: LabelCandidate[],
  project: (p: LngLat) => [number, number],
  /** Markers that labels must not cover: [position, radius in px]. */
  obstacles: [LngLat, number][] = [],
  pad = 3,
): Map<string, Placement> {
  const placed: [number, number, number, number][] = obstacles.map(([p, r]) => {
    const [x, y] = project(p)
    return [x - r, y - r, x + r, y + r]
  })
  const keep = new Map<string, Placement>()
  for (const c of [...cands].sort((a, b) => b.priority - a.priority)) {
    const [x0, y0] = project(c.position)
    const lines = c.wrap ? Math.ceil(c.text.length / c.wrap) : 1
    const chars = c.wrap ? Math.min(c.text.length, c.wrap) : c.text.length
    const caps = c.text === c.text.toUpperCase()
    const w = chars * c.size * (caps ? 0.62 : 0.5)
    const h = c.size * 1.1 * lines
    for (const off of [c.offset, ...(c.alts ?? [])]) {
      const x = x0 + off[0] - (c.anchor === 'middle' ? w / 2 : 0)
      const y = y0 + off[1] - (c.baseline === 'bottom' ? h : h / 2)
      const box: [number, number, number, number] = [x - pad, y - pad, x + w + pad, y + h + pad]
      if (!c.force && placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue
      placed.push(box)
      keep.set(c.key, { offset: off })
      break
    }
  }
  return keep
}
