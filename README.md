# India Atlas

**How the British came to rule India, and how they left · 1600–1947**

A map-based story of British rule in India, told as 10 chapters and 91 scenes. Each scene moves the map to a moment in time and shows only what the narrative references. Two other ways in: an **explore** sandbox where you scrub the timeline and click anything, and **Follow a person**, step-by-step journeys through the lives of 11 figures from Thomas Roe to Jinnah.

**Live:** https://nameetrajore.github.io/india-atlas/

## What's inside

| | |
|---|---|
| Chapters / scenes | 10 / 91 |
| Events | 169, each with context, consequences and cause → effect links |
| People | 75 (11 with step-through journeys) |
| Polities / border keyframes | 69 / 58, drawn on 625 admin units from the 1941 census |
| Railways / trade routes | 110 segments (1853–1947) / 12 routes with moving cargo |
| Sources | 315, and every record cites at least one |

### Features

- **Story mode.** Chapters play as scenes with narrative text. Names in the text link to their cards on the map.
- **Explore mode.** Use the timeline to zoom from centuries down to days. Scroll to zoom, drag to pan, Space to play, ←/→ to step. Click anything for its card.
- **Then vs now.** A draggable divider shows present-day boundaries next to the historical map, with both views locked to one camera.
- **Follow a person.** Itinerary-driven journeys with a travelling map.
- **Charts.** Economic series, including railway kilometres over time.
- **Sources & methods.** Open doubts, map gaps and how the content was made (`?page=methods`).
- **Every view is a URL.** Some examples:
  - `?ch=1&sc=8` opens a scene (Plassey).
  - `?mode=explore&t=1919.28&sel=event:jallianwala&today=1` opens explore mode at a moment, with a selection and Then vs now on.
  - `?journey=gandhi&step=3` opens a journey step.

## Run locally

```sh
npm install
npm run dev       # validate + compile content, then start Vite
```

| Command | Does |
|---|---|
| `npm run content` | Validate `content/*.yaml` and write `public/data/content.json` |
| `npm run build` | content + type-check + Vite build + per-chapter share pages |
| `npm run lint` | ESLint |
| `npm run base` | Rebuild `public/data/base/*.geojson` (needs `uv`; run `scripts/fetch_raw.sh` first) |

Pushes to `main` deploy to GitHub Pages via `.github/workflows/pages.yml`.

## How it works

**Content as code.** All historical data lives in YAML under `content/`. `scripts/build-content.ts` validates it with strict zod schemas, checks every cross-reference and source citation, then compiles one `content.json` that the app loads at startup. If any content is invalid, the build fails.

- **Borders** are sets of 1941 admin units per polity per keyframe (`territory.yaml`). The first keyframe assigns every unit, and later keyframes list only changes. Units with no assignment render as "not yet mapped" instead of being guessed.
- **Dates** are `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, optionally `approx`. Inside the app, time is a fractional year.
- **Scenes** set the time, camera, text and an explicit `show` list of what appears on the map.
- **Causality is data.** Events link to each other through `causes` and `led_to`.

**Stack.** React 19 + TypeScript + Vite, MapLibre GL base map with deck.gl layers, and Zustand for state, synced both ways with the URL.

| Path | What |
|---|---|
| `content/` | Chapters, events, people, places, polities, territory, railways, trade, sources |
| `scripts/build-content.ts` | Schema validation and the content compiler |
| `src/lib/derive.ts` | The world at time *t*: who controls each unit, where each person is, which places matter |
| `src/map/` | Base style, deck.gl layers, label declutter, present-day comparison map |
| `src/ui/` | Story player, timeline, info cards, journeys, charts, search |
| `docs/decisions.md` | Numbered design decisions (D1–D27) |

## Caveats

- AI wrote the content and AI checked it. No historian has reviewed it yet. Open doubts are listed on the [Sources & methods](https://nameetrajore.github.io/india-atlas/?page=methods) page.
- Contested history appears as period names with modern equivalents and as sourced ranges for disputed figures. The atlas doesn't give verdicts.
- Outside present-day India (Pakistan, Bangladesh, Burma), present-day districts stand in for 1941 units, so borders there are approximate.
