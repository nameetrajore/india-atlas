"""Prepare base geography for the app.

Inputs (data/raw/):
  India-State-Districts-1941.parquet  CC0, via yashveeeeeeer/india-geodata (India State Story)
  ne_10m_land / rivers / lakes .geojson  Natural Earth, public domain (see scripts/fetch_raw.sh)

Outputs (public/data/base/):
  units-1941.geojson  admin units with stable ids. 1941 units cover present-day India only; areas of British
                      India outside it (Pakistan, Bangladesh, Burma) are filled with present-day districts as
                      proxies (type "Proxy", proxy: true), with any overlap with 1941 units removed
  land.geojson, rivers.geojson, lakes.geojson  clipped to South Asia

Run: uvx --with pyarrow --with shapely python -I scripts/prep_base.py
"""
import json
import re
from pathlib import Path

import pyarrow.parquet as pq
from shapely import wkb
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data" / "base"
BBOX = box(40, -12, 125, 50)
PRECISION = 4


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def rounded(geom):
    def r(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            return [round(c[0], PRECISION), round(c[1], PRECISION)]
        return [r(x) for x in c]

    m = mapping(geom)
    return {"type": m["type"], "coordinates": r(m["coordinates"])}


def write(name, features):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    print(f"{name}: {len(features)} features, {path.stat().st_size // 1024} KB")


# Present-day units that sit inside the 1941 Jammu & Kashmir polygon are dropped, not proxied.
PROXY_SKIP_ADM1 = {"Gilgit-Baltistan", "Azad Kashmir"}
PROXIES = [("PAK", "PAK-ADM2", "PAK-ADM1"), ("BGD", "BGD-ADM2", "BGD-ADM1"), ("MMR", "MMR-ADM1", None)]


def proxies(existing):
    """Present-day districts standing in for 1941 units outside present-day India."""
    covered = unary_union(existing).buffer(0.002)
    feats = []
    for iso, src, parent in PROXIES:
        units_ = json.loads((RAW / "gb" / f"{src}.geojson").read_text())["features"]
        parents = []
        if parent:
            parents = [(f["properties"]["shapeName"], make_valid(shape(f["geometry"])))
                       for f in json.loads((RAW / "gb" / f"{parent}.geojson").read_text())["features"]]
        for f in units_:
            name = f["properties"]["shapeName"]
            g = make_valid(shape(f["geometry"]))
            adm1 = next((n for n, pg in parents if pg.contains(g.representative_point())), name)
            if adm1 in PROXY_SKIP_ADM1 or name in PROXY_SKIP_ADM1:
                continue
            g = g.difference(covered)
            if g.is_empty or g.area < 0.005:
                continue
            g = g.simplify(0.005, preserve_topology=True)
            feats.append({
                "type": "Feature",
                "properties": {"id": f"{iso.lower()}--{slug(name)}", "name": name, "division": f"{iso}:{adm1}",
                               "type": "Proxy", "proxy": True},
                "geometry": rounded(g),
            })
    return feats


def units():
    rows = pq.read_table(RAW / "India-State-Districts-1941.parquet").to_pylist()
    seen: dict[str, int] = {}
    feats = []
    geoms = []
    for r in rows:
        div = (r["Admin Divi"] or "unknown").strip()
        name = (r["Districts"] or div).strip()
        base = f"{slug(div)}--{slug(name)}"
        seen[base] = seen.get(base, 0) + 1
        uid = base if seen[base] == 1 else f"{base}-{seen[base]}"
        raw = make_valid(wkb.loads(r["geometry"]))
        geoms.append(raw)
        g = raw.simplify(0.005, preserve_topology=True)
        feats.append({
            "type": "Feature",
            "properties": {"id": uid, "name": name, "division": div, "type": r["Type"]},
            "geometry": rounded(g),
        })
    extra = proxies(geoms)
    print(f"proxies: {len(extra)}")
    write("units-1941.geojson", feats + extra)


def clipped(src, name, keep=lambda p: True, tol=0.01):
    data = json.loads((RAW / src).read_text())
    feats = []
    for f in data["features"]:
        if not keep(f["properties"]):
            continue
        g = make_valid(shape(f["geometry"])).intersection(BBOX)
        if g.is_empty:
            continue
        g = g.simplify(tol, preserve_topology=True)
        props = {k: f["properties"].get(k) for k in ("name", "scalerank") if k in f["properties"]}
        feats.append({"type": "Feature", "properties": props, "geometry": rounded(g)})
    write(name, feats)


if __name__ == "__main__":
    units()
    clipped("ne_10m_land.geojson", "land.geojson")
    clipped("ne_10m_rivers_lake_centerlines.geojson", "rivers.geojson",
            keep=lambda p: (p.get("scalerank") or 99) <= 7)
    clipped("ne_10m_lakes.geojson", "lakes.geojson", keep=lambda p: (p.get("scalerank") or 99) <= 6)
