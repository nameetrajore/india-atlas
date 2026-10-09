import type { LensId, ViewId } from './types'

export interface ViewDef {
  id: ViewId
  name: string
  lenses: LensId[]
  /** Polity fills fade back to a soft backdrop outside the geopolitics view (D18). */
  polityOpacity: number
}

export const VIEWS: ViewDef[] = [
  { id: 'geopolitics', name: 'Geopolitics', lenses: ['polities', 'footholds', 'events', 'people', 'places'], polityOpacity: 0.62 },
  { id: 'trade', name: 'Trade', lenses: ['polities', 'trade', 'footholds', 'places'], polityOpacity: 0.22 },
  { id: 'freedom', name: 'Freedom Struggle', lenses: ['polities', 'people', 'movements', 'events', 'places'], polityOpacity: 0.22 },
  { id: 'economy', name: 'Economy', lenses: ['polities', 'economy', 'infrastructure', 'places'], polityOpacity: 0.18 },
  { id: 'society', name: 'Society', lenses: ['polities', 'society', 'partition', 'places'], polityOpacity: 0.18 },
]

export const LENS_NAMES: Record<LensId, string> = {
  polities: 'Polities & borders',
  footholds: 'French & Portuguese enclaves',
  events: 'Events',
  people: 'People',
  places: 'Places',
  trade: 'Trade routes & goods',
  movements: 'Movements',
  infrastructure: 'Rail, telegraph, canals',
  economy: 'Economy & demography',
  society: 'Society & culture',
  partition: 'Partition',
}

/** Lenses that have data in this build. The rest show as "coming". */
export const LENSES_WITH_DATA = new Set<LensId>(['polities', 'footholds', 'events', 'people', 'places'])

export const viewById = (id: ViewId) => VIEWS.find((v) => v.id === id)!
