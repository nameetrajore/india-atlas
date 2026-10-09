// Pure functions: what the world looks like at time t.
import type { Content, Control, HistEvent, Keyframe, LngLat, Person, Place, Polity } from '../types'

/** A polity's official name at time t. */
export function polityName(p: Polity, t: number): string {
  let n = p.name
  for (const x of p.names ?? []) if (x.date.t <= t) n = x.name
  return n
}

/** Latest keyframe at or before t (index), or -1 before the first. */
export function keyframeIndexAt(keyframes: Keyframe[], t: number): number {
  let i = -1
  for (let k = 0; k < keyframes.length; k++) if (keyframes[k].date.t <= t) i = k
  return i
}

/** Current controller of a foothold, or null if not yet founded. */
export function controlAt(place: Place, t: number): Control | null {
  let c: Control | null = null
  for (const x of place.control) if (x.date.t <= t) c = x
  return c
}

/** Events fade in at their date and out over a few years, scaled by significance. Campaigns persist until `end`. */
export function eventOpacity(e: HistEvent, t: number): number {
  const start = e.date.t
  const end = e.end?.t ?? start
  if (t < start - 0.02) return 0
  if (t <= end) return 1
  const linger = 0.75 + e.significance * 0.6
  return Math.max(0, 1 - (t - end) / linger)
}

/** Itinerary gaps longer than this are not interpolated: the marker holds, then fades (D19). */
const MAX_INTERP_GAP = 1.0
const HOLD = 0.4
const FADE = 0.4

export interface PersonState {
  position: LngLat
  opacity: number
  note?: string
  /** The last recorded stop; used for "last recorded at X". */
  lastStop: number
  moving: boolean
}

export function personAt(p: Person, t: number): PersonState | null {
  const it = p.itinerary
  if (!it.length || t < it[0].date.t) return null
  if (p.died && t > p.died.t + 0.05) return null
  let i = 0
  while (i + 1 < it.length && it[i + 1].date.t <= t) i++
  const cur = it[i]
  if (cur.away || !cur.coords) return null
  const next = it[i + 1]
  if (next && !next.away && next.coords && next.date.t - cur.date.t <= MAX_INTERP_GAP) {
    const f = (t - cur.date.t) / (next.date.t - cur.date.t)
    const [x0, y0] = cur.coords
    const [x1, y1] = next.coords
    const moving = x0 !== x1 || y0 !== y1
    return { position: [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f], opacity: 1, note: cur.note, lastStop: i, moving }
  }
  const since = t - cur.date.t
  const opacity = since <= HOLD ? 1 : Math.max(0, 1 - (since - HOLD) / FADE)
  // Keep a faint ghost so a click can still say "last recorded at X".
  return { position: cur.coords, opacity: Math.max(opacity, 0.18), note: cur.note, lastStop: i, moving: false }
}

/** Trail segments (for TripsLayer). A segment breaks at `away` stops and at long gaps. */
export interface Segment {
  person: string
  path: LngLat[]
  timestamps: number[]
}

export function personSegments(p: Person, t0: number): Segment[] {
  const segs: Segment[] = []
  let cur: Segment | null = null
  let prevT = -Infinity
  for (const s of p.itinerary) {
    if (s.away || !s.coords || s.date.t - prevT > MAX_INTERP_GAP) {
      if (cur && cur.path.length > 1) segs.push(cur)
      cur = null
    }
    if (!s.away && s.coords) {
      cur ??= { person: p.id, path: [], timestamps: [] }
      cur.path.push(s.coords)
      cur.timestamps.push(s.date.t - t0)
    }
    prevT = s.date.t
  }
  if (cur && cur.path.length > 1) segs.push(cur)
  return segs
}

/**
 * Significance of each place at time t (D20): events near t weighted by importance and closeness in time,
 * plus active colonial control and capital status. Drives label size and collision priority.
 */
export function placeSignificance(content: Content, t: number): Map<string, number> {
  const score = new Map<string, number>()
  for (const p of content.places) {
    let s = 0.4
    if (p.tags.includes('capital')) s += 1
    const c = controlAt(p, t)
    if (c) s += 0.8
    score.set(p.id, s)
  }
  for (const e of content.events) {
    const dt = Math.abs(t - e.date.t)
    const w = e.significance * Math.exp(-dt / 12)
    score.set(e.place, (score.get(e.place) ?? 0) + w)
  }
  return score
}

/** Where each person stands at their latest stop, for the place card's "visits" list. */
export function visitsToPlace(content: Content, placeId: string) {
  const out: { person: Person; date: Content['events'][number]['date']; note?: string }[] = []
  for (const p of content.people)
    for (const s of p.itinerary) if (s.place === placeId) out.push({ person: p, date: s.date, note: s.note })
  return out.sort((a, b) => a.date.t - b.date.t)
}
