# Design decisions

## D1. Audience
Public explorer for curious adults (Kurzgesagt / Ollie Bye feel, but interactive). Needs polish, sourcing, neutral handling of contested history.

## D2. Time span (v1)
Colonial arc: scrubber starts ~1450 (pre-European context: Vijayanagara, Bahmani, Delhi Sultanate), runs to 1947. Engine must support extending backwards later without rewrite.

## D3. Core loop
Sandbox map (time scrubber + click-anything) as engine; guided story chapters = scripted camera/time/layer states on the same engine. No faction role-play/counterfactuals. Light game touches (collectibles, unlockables, puzzle modes) — open, revisit later.

## D4. Visual style
Stylized modern map (clean, soft hillshade/terrain relief, bold morphing polity fills) + antique theme in chrome/typography (paper texture, serif labels, cartouche info cards). 2.5D: flat, tiltable for story drama. Life via animated ships on routes and moving person markers.

## D5. Lenses (v1)
All ten: polities/borders, colonial footholds, trade routes & goods, people (moving markers + trails), events, movements (animated spreads), infrastructure (rail/telegraph/canals), economy & demography, society & culture, Partition. Risk: ~2x data work — pipeline must be efficient.

## D6. Data sourcing
LLM-assisted pipeline anchored on scholarship.
- Borders: polity-per-year = set of base admin units (~1931 districts + princely states, digitized); validated against Schwartzberg *Historical Atlas of South Asia* (DSAL). Hand-trace only pre-unit-era (~pre-1750) polygons.
- Entities/events/routes: agent pipeline drafts from Wikidata + primary/secondary sources, citation mandatory per record.
- Human review in admin UI before publish. Every fact shows its source in-app.

## D7. Time model
Mixed precision. Every record: date + precision (year/month/day) + uncertainty (c./between). Zoomable scrubber (centuries ↔ days). Borders interpolate between yearly keyframes; people interpolate between dated locations. Uncertainty rendered visually (dashed trails, fuzzy borders).

## D8. Platform
Web app, desktop-first, mobile-capable (stories full; sandbox simplified). Every view = URL encoding time, camera, lenses, selection. Stories and sharing reuse this.

## D9. Rendering stack
MapLibre GL (base map, custom vector style, terrain/hillshade, pitch) + deck.gl (TripsLayer for ships/person trails, ArcLayer for trade flows, polygon transitions, heatmaps). UI shell: React + TypeScript + Vite. State: Zustand, single store (time, camera, lenses, selection) synced to URL. Border morph = per-admin-unit recolor (GPU attribute transition); true geometry tween only for pre-1750 hand-traced shapes.

## D10. Content storage & serving
Content-as-code: one YAML/JSON file per entity/event/polity-year/route, citation inline, schema-validated. Build compiles to PMTiles (geometry) + time-chunked data for animated layers. Fully static hosting (Cloudflare Pages). Agent drafts arrive as PRs; review = PR review via a local visual review tool (map + sources side by side). DB only if user features (accounts/progress) need it later.

## D11. Contested history policy
Neutral, plural framing.
1. Period-accurate place names + modern in parens ("Bombay (Mumbai)").
2. Contested labels: neutral primary + visible alternatives + note on who uses which.
3. Disputed numbers: ranges with sources, never single figures.
4. Contested figures: sourced actions + "perspectives" card across historiographies; no verdicts.
5. No present-day border overlay in v1; if added later, Survey of India compliant.
6. Public Methodology & Sources page at launch.

## D12. Explainer layer
- Written, reviewed cards per entity (summary, key dates, why it matters, perspectives, sources) = source of truth.
- Period media on cards in v1: public-domain paintings/photos/maps/newspapers (British Library, Wikimedia Commons), license recorded per asset.
- "Ask the Atlas" chat (after cards are solid): Claude grounded only in reviewed corpus, cites records, refuses beyond corpus, can drive the map (time/camera/highlight → generated mini-stories via chapter machinery). One Cloudflare Worker, rate-limited.

## D13. Build sequence
- Slice 1 — "Plassey to Buxar, 1740–1765": polity morph (Company takes Bengal), French/British footholds, Clive & Siraj-ud-Daulah markers, battles/treaties, one story chapter. Proves admin-unit morphing, pipeline → polity-years, chapters.
- Slice 2 — "Salt March, 1930": day-level Gandhi trail, movement heatmap spread, events, chapter. Proves fine time, trails, movements.
- Then: remaining lenses as data on the proven engine.

## D14. Audio
Silent. Text captions only. No score, SFX, or narration.

## D15. Language
English only. No i18n scaffolding in schema.

## D16. Game touches
In: discovery log (collectibles count), "Where in time?" (guess the year from map state), "Find them" (pin a person's location at a date, distance score). Out: chapter unlocks, quizzes, achievements. Progress in localStorage (no backend).

## D17. Sandbox layout
Full-bleed map. Floating lens dock (left), slide-in info card (right), zoomable scrubber pinned bottom with event ticks, top bar: title + [Ask] + [Stories].

## D18. Lens density
Preset views bundling lenses with tuned palette + z-order: Geopolitics (polities, footholds, events), Trade (routes, goods, footholds), Freedom Struggle (people, movements, events), Economy (famine, revenue, rail), Society. Toggle lenses within a view; "advanced" switch enables free mixing. Polity layer auto-dims to backdrop in non-geopolitics views. Views encoded in URL.

## D19. People lens
Tiered roster: ~30 Tier-1 (dense day-level itineraries), ~300 Tier-2 (appear at dated events), others as names on event cards. Deliberately include under-represented women, Dalit, tribal, regional leaders (e.g. Birsa Munda, Alluri Sitarama Raju, Rani Gaidinliu, Periyar, Matangini Hazra). Unknown location → marker fades out (no cross-country interpolation); card shows "last recorded at X". Gandhi first (Collected Works, Tendulkar's *Mahatma*) — feeds slice 2.

## D20. Places
Places are first-class entities with a biography across time.
- Place card: auto-aggregated timeline (events, person visits, routes, polity changes) + hand-written "Why it matters".
- Significance score per place per era (from linked events/visits weighted by importance) drives label size/visibility — map typography shows what mattered then (Surat big in 1650, Bombay in 1900).
- Tags: port, fort, capital, battle site, pilgrimage, movement site, factory.
- Curated collections (e.g. Places of the Freedom Struggle) feed the discovery log.

## D21. Licensing
Fully open. Code: MIT. Content/data: CC BY-SA 4.0. External contributions via sourced-record PRs. Per-asset media license tracking (some period images not CC-compatible). Chat cost covered by strict per-user rate limit; optional support link.

## D22. Name
India Atlas. Repo: `india-atlas`.

## Open risks
- Base admin-unit layer (~1931 districts + princely states) availability/licensing unverified — gates D6/D9 border model.
- All ten lenses in v1 (~2x data work).
- Review load on owner for agent-drafted PRs.
