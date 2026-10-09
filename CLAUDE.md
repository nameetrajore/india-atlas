# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

India Atlas: a map-based story of British rule in India, 1600–1947, told as chapters made of scenes, plus a secondary "explore freely" sandbox. Static site (React + TypeScript + Vite, MapLibre + deck.gl, Zustand), deployed to GitHub Pages from `main`.

## Commands

```sh
npm run dev       # compile content, then start Vite
npm run content   # validate content/*.yaml and write public/data/content.json (gitignored)
npm run build     # content + tsc -b + vite build + scripts/share-pages.ts (per-chapter OG pages in dist/ch/<n>/)
npm run lint      # eslint
npm run base      # rebuild public/data/base/*.geojson (needs uv; run scripts/fetch_raw.sh first)
```

There are no tests. `npm run content` is the correctness check for content edits; `npm run build` adds type-checking. CI sets `BASE_PATH=/india-atlas/`; locally the base is `/`.

## Architecture

**Content as code.** All historical data lives in `content/` YAML. `scripts/build-content.ts` parses it with zod schemas (`.strict()`, so unknown keys fail), checks every cross-reference and that every record cites a source id from `content/sources/`, then compiles a single `public/data/content.json` that the app fetches at startup (`src/App.tsx`). Bad content fails the build. When adding a field, update the zod schema in `build-content.ts` and the matching type in `src/types.ts`.

- Directories (`sources/`, `places/`, `events/`, `people/`, `chapters/`, `eras/`) are loaded file-by-file and merged; single files (`polities.yaml`, `territory.yaml`, `railways.yaml`, `trade.yaml`, `charts.yaml`, `glossary.yaml`, `methods.yaml`, `meta.yaml`) are loaded directly. `content/archive/` is not loaded.
- **Borders** are sets of 1941 admin units per polity per keyframe (`territory.yaml`). The first keyframe assigns every unit; later keyframes list only changes. Unassigned units render as "not yet mapped". Base geometry is `public/data/base/units-1941.geojson`.
- **Dates** are strings `YYYY`, `YYYY-MM` or `YYYY-MM-DD` (optional `approx`), converted to fractional years by `src/lib/time.ts`. Time `t` everywhere in the app is a fractional year.
- **Chapters** contain **scenes**; each scene sets `t`, `camera`, narrative `text`, and a `show` block listing exactly which events/places/polities/people/railways/trade appear. Scene text links entities inline as `[label](event:id)` / `(place:id)` etc., rendered by `src/ui/Prose.tsx`.
- **Events** carry `context`, `consequences`, and `causes` / `led_to` links (causality is data).
- **People** have itineraries of dated places (with `away` for off-map gaps); itinerary stops with a `note` become steps in "Follow a person" journeys.

**App state.** One Zustand store (`src/store.ts`) holds time, mode (`story` | `explore`), chapter/scene, camera, selection and toggles (`detail`, `today`, `econ`, `journey`, `methods`). `src/lib/url.ts` syncs it both ways with the query string: every view is a URL (e.g. `?ch=1&sc=8`, `?mode=explore&t=1919.28&sel=event:jallianwala&today=1`, `?journey=gandhi&step=3`, `?page=methods`).

**Rendering.** `src/lib/derive.ts` computes the world at time `t` (polity per unit, foothold controller, person position, place significance). `src/map/layers.ts` turns that into deck.gl layers over the MapLibre base style (`src/map/style.ts`); labels pass through a screen-space declutter (`src/map/declutter.ts`). Polities are grouped into simple **blocs** (british/indian/european/india/pakistan) unless `detail` is on. `src/map/NowMap.tsx` is a second, non-interactive map of present-day boundaries, clipped right of a draggable divider and camera-locked to the main map ("Then vs now", `today=1`). Trade-route cargo dots are the only per-frame rebuilt layer.

## Conventions

- `docs/decisions.md` records numbered design decisions (D1–D27); later ones supersede earlier (notably D24/D25 over D2/D3/D13). Read the relevant ones before changing behaviour, and add a new numbered decision for significant product changes. Commit messages and code comments reference them (e.g. `(D25)`).
- Contested history (D11): period place names with the modern name in parens, disputed numbers as sourced ranges, no verdicts on contested figures.
- Map shows only what the current scene references; views/layers with no data are hidden (D25).
- Content is AI-written and AI-checked, not historian-reviewed; open doubts and map gaps go in `content/methods.yaml` (shown at `?page=methods`).
