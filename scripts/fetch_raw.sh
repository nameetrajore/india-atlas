#!/usr/bin/env bash
# Fetch large raw inputs that are not committed. Natural Earth is public domain.
set -euo pipefail
cd "$(dirname "$0")/../data/raw"
for f in ne_10m_land ne_10m_rivers_lake_centerlines ne_10m_lakes; do
  curl -sSfL -o "$f.geojson" "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/$f.geojson"
done

# geoBoundaries proxies for the parts of British India outside present-day India (D24).
# PAK ADM2: public domain. BGD ADM2: CC BY 3.0 IGO. MMR ADM1: CC BY 4.0.
mkdir -p gb
for c in PAK/ADM1 PAK/ADM2 BGD/ADM1 BGD/ADM2 MMR/ADM1; do
  f=$(echo "$c" | tr / -)
  curl -sSfL -o "gb/$f.geojson" "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/$c/geoBoundaries-${f}_simplified.geojson"
done
