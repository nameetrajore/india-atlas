#!/usr/bin/env bash
# Fetch large raw inputs that are not committed. Natural Earth is public domain.
set -euo pipefail
cd "$(dirname "$0")/../data/raw"
for f in ne_10m_land ne_10m_rivers_lake_centerlines ne_10m_lakes; do
  curl -sSfL -o "$f.geojson" "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/$f.geojson"
done
