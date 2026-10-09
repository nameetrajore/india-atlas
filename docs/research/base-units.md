# Base admin-unit layer: dataset check (2026-10-09)

## Verdict
There is no turnkey dataset. A usable path exists: CC0 1941 geometry for the area of present-day India, plus digitising the missing areas, plus CC0/CC BY temporal tables.

## Geometry
| Source | Coverage | Princely states | Licence | Notes |
|---|---|---|---|---|
| `yashveeeeeeer/india-geodata`, release `census/historical`, `India-State-Districts-1941` (derived from India State Story / FLAME Univ.) | 1941, **only the extent of present-day India** (lon 68.2–97.4) | Yes: 431 units (180 British districts, 202 princely states, 42 princely districts, 4 foreign) | CC0 | Missing: Sind, NWFP, Baluchistan, west Punjab, East Bengal, Burma. J&K is one polygon. Parquet / PMTiles / GeoJSONL. |
| India State Story map files (Google Drive, email-gated) | 1941–2021 | 1941 yes | Unstated, "no claim of accuracy" | Probably the upstream of the row above. |
| IOWC McGill census districts | 1872, 1881, 1891 (unfinished as of 2023) | Yes | Unstated | Contact iowc@mcgill.ca. Covers all of British India. |
| Punjab 1931 (ArcGIS Online) | British Punjab only | — | Unstated | Traced from the 1931 Imperial Gazetteer atlas. Useful for west Punjab. |

## Temporal tables (no geometry)
- **Making of British Provinces and Districts, 1690–1862.** doi:10.7910/DVN/ZVPZAN, CC0. Acquisition date and method for each district. Maps directly to Company expansion (slice 1).
- **Princely States database, 1939.** doi:10.7910/DVN/2ES4C1, CC0.
- **India State & District Evolution Database (ISDED), 1872–2025.** doi:10.7910/DVN/D1AGUR, CC BY 4.0 (needs attribution).

## Plan
1. Use the CC0 1941 layer as the base for present-day India.
2. Digitise the missing roughly 70–90 units (Sind, NWFP, Baluchistan, west Punjab, East Bengal, and Burma optionally) from the Imperial Gazetteer Atlas 1931 (DSAL scans) in QGIS. Check the DSAL image terms first.
3. Split J&K into its 1941 provinces/jagirs if needed.
4. Join the ZVPZAN acquisition dates to the units: this gives Company/Crown territory per year for 1690–1862 almost for free.
5. Polygons from before about 1750, and polities whose borders cut across 1941 units, stay hand-traced (D6).

## Impact on slice 1 (Bengal 1740–1765)
West Bengal, Bihar and Orissa units exist. East Bengal (Dacca, Chittagong, etc.) must be digitised first.
