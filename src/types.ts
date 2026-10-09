// Compiled content shapes, produced by scripts/build-content.ts and consumed by the app.

export type Precision = 'year' | 'month' | 'day'
export type LngLat = [number, number]

/** A point in time. `t` is a fractional year (1757.47); `label` is the human form ("23 Jun 1757"). */
export interface CDate {
  t: number
  label: string
  precision: Precision
  approx?: boolean
}

export interface Source {
  id: string
  title: string
  url?: string
}

export interface Polity {
  id: string
  name: string
  altNames: string[]
  /** Official names over time, oldest first. */
  names: { date: CDate; name: string }[]
  kind: 'polity' | 'power' | 'province' | 'state' | 'tribal' | 'foreign' | 'dominion'
  bloc: Bloc
  color: [number, number, number]
  summary: string
  sources: string[]
}

export type Bloc = 'british' | 'indian' | 'european' | 'india' | 'pakistan' | 'other'

export interface Keyframe {
  date: CDate
  certainty: 'approximate' | 'confident'
  note: string
  sources: string[]
  /** unit id -> polity id, cumulative state from this keyframe onward */
  units: Record<string, string>
}

export interface Control {
  date: CDate
  power: string
  note?: string
}

export interface Place {
  id: string
  name: string
  modern?: string
  coords: LngLat
  approx: boolean
  tags: string[]
  why?: string
  control: Control[]
  sources: string[]
}

export interface Figure {
  label: string
  min: number
  max: number
  note?: string
  sources: string[]
}

export interface HistEvent {
  id: string
  name: string
  altNames: string[]
  date: CDate
  end?: CDate
  place: string
  coords: LngLat
  kind: string
  significance: number
  participants: string[]
  summary: string
  context?: string
  consequences?: string
  why?: string
  causes: string[]
  ledTo: string[]
  figures: Figure[]
  perspectives: Perspective[]
  sources: string[]
}

export interface Stop {
  date: CDate
  place?: string
  coords?: LngLat
  away: boolean
  note?: string
}

export interface Perspective {
  view: string
  text: string
}

export interface Person {
  id: string
  name: string
  tier: 1 | 2
  born?: CDate
  died?: CDate
  role: string
  summary: string
  perspectives: Perspective[]
  itinerary: Stop[]
  sources: string[]
}

export interface Camera {
  center: LngLat
  zoom: number
  pitch?: number
  bearing?: number
}

export interface Scene {
  id: string
  date: CDate
  camera: Camera
  title: string
  text: string
  show: { events: string[]; people: string[]; places: string[]; polities: string[] }
  select?: Selection
  playTo?: CDate
}

export interface Chapter {
  id: string
  number: number
  title: string
  period: string
  summary: string
  scenes: Scene[]
}

export interface Content {
  /** Every record is unreviewed until a human approves it (D6). */
  status: 'draft' | 'reviewed'
  title: string
  subtitle: string
  range: [number, number]
  sources: Record<string, Source>
  polities: Record<string, Polity>
  keyframes: Keyframe[]
  places: Place[]
  events: HistEvent[]
  people: Person[]
  chapters: Chapter[]
  /** Display names of base units, by id. */
  unitNames: Record<string, string>
  eras: Era[]
}

export interface Era {
  id: string
  kind: 'phase' | 'viceroy'
  name: string
  from: CDate
  to: CDate
  sources: string[]
}

export type SelectionKind = 'event' | 'place' | 'person' | 'polity' | 'unit'
export interface Selection {
  kind: SelectionKind
  id: string
}

export type ViewId = 'geopolitics' | 'trade' | 'freedom' | 'economy' | 'society'
export type LensId =
  | 'polities'
  | 'footholds'
  | 'events'
  | 'people'
  | 'places'
  | 'trade'
  | 'movements'
  | 'infrastructure'
  | 'economy'
  | 'society'
  | 'partition'
