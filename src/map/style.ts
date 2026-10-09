import type { StyleSpecification } from 'maplibre-gl'

const BASE = `${import.meta.env.BASE_URL}data/base`

export const MAP_COLORS = {
  sea: '#c6d4cf',
  land: '#efe5cc',
  river: '#8fa9ab',
  coast: '#9b8b6a',
}

/**
 * Stylised modern base (D4): flat paper land, soft terrain relief, no modern borders or labels (D11).
 * Relief: AWS Terrain Tiles (Terrarium), open data.
 */
export const baseStyle: StyleSpecification = {
  version: 8,
  sources: {
    land: { type: 'geojson', data: `${BASE}/land.geojson` },
    rivers: { type: 'geojson', data: `${BASE}/rivers.geojson` },
    lakes: { type: 'geojson', data: `${BASE}/lakes.geojson` },
    dem: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 11,
      attribution: 'Relief: AWS Terrain Tiles · Base: Natural Earth · Units: India State Story (CC0)',
    },
  },
  layers: [
    { id: 'sea', type: 'background', paint: { 'background-color': MAP_COLORS.sea } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': MAP_COLORS.land } },
    // Polity fills are inserted here by deck.gl (beforeId: 'hillshade'), so relief shades them.
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem',
      paint: {
        'hillshade-exaggeration': 0.45,
        'hillshade-shadow-color': '#5a4630',
        'hillshade-highlight-color': '#fff8e6',
        'hillshade-accent-color': '#6b5538',
        'hillshade-illumination-direction': 315,
      },
    },
    { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': MAP_COLORS.sea } },
    {
      id: 'rivers',
      type: 'line',
      source: 'rivers',
      paint: {
        'line-color': MAP_COLORS.river,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, ['-', 2.2, ['*', 0.25, ['get', 'scalerank']]], 9, 3],
        'line-opacity': 0.85,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    },
    {
      id: 'coast',
      type: 'line',
      source: 'land',
      paint: { 'line-color': MAP_COLORS.coast, 'line-width': 0.8, 'line-opacity': 0.7 },
    },
  ],
}
