# India Atlas

A visual, map-based story of how the British came to rule India, and how they left (1600–1947), told in 10 chapters and 91 scenes (D25). Explore mode lets you roam the map freely.

Design decisions: [`docs/decisions.md`](docs/decisions.md). Base-data research: [`docs/research/base-units.md`](docs/research/base-units.md).

## Run

```sh
npm install
npm run dev          # validates content, then starts Vite
```

Open the URL Vite prints. Every view is a shareable URL, for example `?ch=1&sc=8` (Plassey) or `?mode=explore&t=1919.28&sel=event:jallianwala&today=1`.

Controls: scroll on the timeline to zoom (centuries down to days), drag the scale to pan, click or drag the track to scrub, Space to play, ←/→ to step. Click anything on the map for its card.

## Layout

| Path | What |
|---|---|
| `content/*.yaml` | Content as code (D10): sources, polities, territory keyframes, places/footholds, events, people, stories. Every record cites `sources.yaml`. |
| `scripts/build-content.ts` | Validates the schemas and every cross-reference, then compiles `public/data/content.json`. Bad content fails the build. |
| `scripts/prep_base.py` | Builds `public/data/base/*` from the CC0 1941 units and Natural Earth (`npm run base`; run `scripts/fetch_raw.sh` first). |
| `src/lib/derive.ts` | The world at time *t*: polity per unit, foothold controller, person position (with fade on gaps), place significance. |
| `src/map/` | MapLibre base style plus deck.gl layers. Labels go through a screen-space declutter pass. |
| `src/ui/` | Timeline, info card, lens dock, story player. |

## Content model in one paragraph

Borders are **sets of 1941 admin units per polity per keyframe** (`content/territory.yaml`). The first keyframe assigns every unit; each later keyframe lists only changes. Units not assigned render as "not yet mapped", so nothing is guessed. Dates are `YYYY`, `YYYY-MM` or `YYYY-MM-DD` with an optional `approx`. People carry itineraries of dated places, with `away` for off-map periods. All content is marked **draft** until a human reviews it (D6).

## Known gaps

- Outside present-day India (Pakistan, Bangladesh, Burma), units are present-day districts standing in for 1941 ones. Borders there are approximate.
- Lenses that have data: polities, footholds, events, people, places. Trade, movements, infrastructure, economy, society and Partition are stubbed.
- "Ask the Atlas" is disabled until cards are reviewed (D12).
