// One visual language for event kinds, shared by map, timeline and legend.
export type EventKind =
  | 'battle'
  | 'revolt'
  | 'treaty'
  | 'law'
  | 'political'
  | 'movement'
  | 'atrocity'
  | 'famine'
  | 'founding'
  | 'campaign'

export const EVENT_KINDS: { kind: EventKind; label: string; color: string; glyph: string }[] = [
  { kind: 'revolt', label: 'Revolt', color: '#c2541b', glyph: 'M12 3c2 4 6 6 5 11-.6 3.4-2.6 6-5 6s-5-2.4-5-5.4c0-2.6 1.6-3.8 2.6-6.1.9 1.8 1.4 2.8 2.4 3.5' },
  { kind: 'battle', label: 'Battle', color: '#8c241c', glyph: 'M5 5l14 14M19 5L5 19M3.5 8.5l5-5M15.5 20.5l5-5M20.5 8.5l-5-5M8.5 20.5l-5-5' },
  { kind: 'movement', label: 'Movement', color: '#c27c1e', glyph: 'M6.5 21V4M6.5 4.5h11l-2.8 4 2.8 4h-11' },
  { kind: 'atrocity', label: 'Massacre / violence', color: '#2b1d16', glyph: 'M12 3.5c3 4.2 5.5 7.4 5.5 10.5a5.5 5.5 0 0 1-11 0c0-3.1 2.5-6.3 5.5-10.5z' },
  { kind: 'famine', label: 'Famine', color: '#7a5a2a', glyph: 'M12 21V6M12 9.5L8 6.5M12 9.5l4-3M12 13.5l-4-3M12 13.5l4-3M12 17.5l-4-3M12 17.5l4-3' },
  { kind: 'political', label: 'Political', color: '#5c3c6e', glyph: 'M4 17.5L5 8l4.2 4L12 5.5l2.8 6.5L19 8l1 9.5z' },
  { kind: 'law', label: 'Law / reform', color: '#3d5a6c', glyph: 'M12 3.5L3.5 8h17zM6 10.5v6.5M10 10.5v6.5M14 10.5v6.5M18 10.5v6.5M3.5 19.5h17' },
  { kind: 'treaty', label: 'Treaty / pact', color: '#24406e', glyph: 'M7 3.5h10v17H7zM9.5 8.5h5M9.5 12h5M9.5 15.5h3.5' },
  { kind: 'founding', label: 'Founding', color: '#3c6e4a', glyph: 'M12 4l2.3 5.2 5.7.4-4.4 3.6 1.4 5.6-5-3-5 3 1.4-5.6L4 9.6l5.7-.4z' },
  { kind: 'campaign', label: 'Campaign', color: '#aa6e1e', glyph: 'M4 12h14M13.5 7.5L18 12l-4.5 4.5' },
]

export const kindDef = (k: string) => EVENT_KINDS.find((x) => x.kind === k) ?? EVENT_KINDS[1]

export const hexToRgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as never

/** Badge as an SVG string: coloured disc, paper ring, white glyph. */
export function badgeSvg(kind: string, size = 64): string {
  const d = kindDef(kind)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
<circle cx="12" cy="12" r="11" fill="${d.color}" stroke="#f3ead7" stroke-width="1.6"/>
<g transform="translate(12 12) scale(0.62) translate(-12 -12)" fill="none" stroke="#fffaf0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${d.glyph}"/></g>
</svg>`
}

export const badgeUrl = (kind: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(kind))}`
