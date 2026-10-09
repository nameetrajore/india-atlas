"""Prepare base geography for the app.

Inputs (data/raw/):
  India-State-Districts-1941.parquet  CC0, via yashveeeeeeer/india-geodata (India State Story)
  ne_10m_land / rivers / lakes .geojson  Natural Earth, public domain (see scripts/fetch_raw.sh)

Outputs (public/data/base/):
  units-1941.geojson  admin units with stable ids. 1941 units cover present-day India only; areas of British
                      India outside it (Pakistan, Bangladesh, Burma) are filled with present-day districts as
                      proxies (type "Proxy", proxy: true), with any overlap with 1941 units removed
  land.geojson, rivers.geojson, lakes.geojson  clipped to South Asia
  today.geojson  present-day boundaries for "compare with today" (D25): Indian states and UTs from the
                 LGD 2024 layer (Survey of India-sourced, via india-geodata), plus Pakistan, Bangladesh and
                 Myanmar first-level units from geoBoundaries, with any overlap with India removed

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
# Spelling fixes for source names.
NAME_FIX = {"Tamil nadu": "Tamil Nadu", "Rajshani": "Rajshahi", "Saigang": "Sagaing", "Tanitharyi": "Tanintharyi",
            "Dadra,Nagar Haveli,Daman & Diu": "Dadra & Nagar Haveli and Daman & Diu"}
PROXIES = [("PAK", "PAK-ADM2", "PAK-ADM1"), ("BGD", "BGD-ADM2", "BGD-ADM1"), ("MMR", "MMR-ADM1", None)]


def proxies(existing):
    """Present-day districts standing in for 1941 units outside present-day India (raw, unsimplified)."""
    covered = unary_union(existing)
    out = []
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
            out.append(({"id": f"{iso.lower()}--{slug(name)}", "name": name, "division": f"{iso}:{adm1}",
                         "type": "Proxy", "proxy": True}, g))
    return out


# Gap healing (D23 follow-up). The 1941 units and the geoBoundaries proxies come from different surveys, and the
# 1941 data leaves some river beds empty, so the map showed slivers of base land between units.
CLOSE = 0.12       # degrees (~12 km): gaps narrower than about twice this are closed (the 1941 and proxy borders differ by up to ~20 km)
MAX_HOLE = 0.5     # square degrees: interior holes smaller than this are filled
SIMPLIFY = 0.005   # degrees: shared-edge (coverage) simplification tolerance


def polys(g):
    return [g] if g.geom_type == "Polygon" else [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon"]


def heal(items, land):
    """Make the units a clean coverage: no overlaps, small gaps absorbed into the neighbour they touch most."""
    from shapely import STRtree, coverage_simplify
    from shapely.geometry import Polygon
    # 1. Remove overlaps (earlier units win), so the set is a valid coverage.
    geoms, kept = [], []
    tree_src = []
    for props, g in items:
        g = make_valid(g).buffer(0)
        if tree_src:
            t = STRtree(tree_src)
            hits = [tree_src[i] for i in t.query(g, predicate="intersects")]
            if hits:
                g = g.difference(unary_union(hits))
        if g.is_empty or g.area < 1e-6:
            continue
        tree_src.append(g)
        geoms.append(g)
        kept.append(props)
    # 2. Match the drawn coastline: clip units to land, so none spill into the sea.
    coast = land.buffer(0.004)
    geoms = [g.intersection(coast) for g in geoms]
    union = unary_union(geoms)
    # 3. Gaps: any land inside the present-day outlines of India, Pakistan, Bangladesh and Burma that no unit
    #    covers (coastal strips, seams between the 1941 and proxy surveys), plus narrow gaps and small holes.
    #    Land outside those outlines (Nepal, Tibet, Afghanistan) is never claimed.
    today_fc = json.loads((OUT / "today.geojson").read_text())["features"]
    region = unary_union([make_valid(shape(f["geometry"])) for f in today_fc]).buffer(0.02)
    closed = union.buffer(CLOSE, join_style="mitre").buffer(-CLOSE, join_style="mitre")
    holes = [Polygon(r) for p in polys(union) for r in p.interiors if Polygon(r).area < MAX_HOLE]
    gaps = unary_union([closed.intersection(region.buffer(0.25)), region, *holes]).difference(union).intersection(land)
    # Seams where the present-day outlines themselves disagree (India vs Pakistan): look a little further out,
    # but only take pieces mostly enclosed by units, so strips of Nepal or Tibet are never claimed.
    loose = region.buffer(0.2).intersection(land).difference(union).difference(gaps)
    enclosed = []
    # Long seams can join open land at their ends, so test them in 0.5° tiles rather than whole.
    tiles = []
    for piece in polys(loose):
        x0, y0, x1, y1 = piece.bounds
        x = x0
        while x < x1:
            y = y0
            while y < y1:
                tiles.extend(polys(piece.intersection(box(x, y, x + 0.5, y + 0.5))))
                y += 0.5
            x += 0.5
    for piece in tiles:
        if piece.length == 0:
            continue
        shared = piece.boundary.intersection(union.buffer(0.002)).length / piece.length
        if shared >= 0.75:
            enclosed.append(piece)
    print(f"enclosed seam pieces: {len(enclosed)}")
    gaps = unary_union([gaps, *enclosed])
    tree = STRtree(geoms)
    added = 0
    for piece in polys(gaps):
        if piece.area < 1e-7:
            continue
        probe = piece.buffer(0.003)
        cands = tree.query(probe, predicate="intersects")
        if not len(cands):
            continue
        best = max(cands, key=lambda i: probe.intersection(geoms[i]).area)
        geoms[best] = unary_union([geoms[best], piece])
        added += 1
    print(f"healed {added} gap pieces")
    # 3. Simplify shared edges together, so neighbours keep identical borders (no cracks).
    simplified = coverage_simplify(geoms, SIMPLIFY)
    return [(props, make_valid(g)) for props, g in zip(kept, simplified)]


def units():
    rows = pq.read_table(RAW / "India-State-Districts-1941.parquet").to_pylist()
    seen: dict[str, int] = {}
    items = []
    for r in rows:
        div = (r["Admin Divi"] or "unknown").strip()
        name = (r["Districts"] or div).strip()
        base = f"{slug(div)}--{slug(name)}"
        seen[base] = seen.get(base, 0) + 1
        uid = base if seen[base] == 1 else f"{base}-{seen[base]}"
        items.append(({"id": uid, "name": name, "division": div, "type": r["Type"]}, make_valid(wkb.loads(r["geometry"]))))
    extra = proxies([g for _, g in items])
    print(f"proxies: {len(extra)}")
    for f in json.loads((OUT / "today.geojson").read_text())["features"]:
        if f["properties"]["name"] == "Andaman & Nicobar":
            extra.append(({"id": "andaman--andaman-and-nicobar", "name": "Andaman and Nicobar Islands", "division": "Andaman",
                           "type": "Proxy", "proxy": True}, make_valid(shape(f["geometry"]))))
    land = unary_union([make_valid(shape(f["geometry"])) for f in json.loads((RAW / "ne_10m_land.geojson").read_text())["features"]]).intersection(BBOX)
    healed = heal(items + extra, land)
    feats = [{"type": "Feature", "properties": props, "geometry": rounded(g)} for props, g in healed if not g.is_empty]
    write("units-1941.geojson", feats)


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


def today():
    feats, india = [], []
    rows = pq.read_table(RAW / "today" / "LGD_States.parquet").to_pylist()
    for r in rows:
        g = make_valid(wkb.loads(r["geometry"]))
        india.append(g)
        name = (r.get("Remarks") or r["STNAME"].title()).strip()
        name = NAME_FIX.get(name, name)
        feats.append({"type": "Feature", "properties": {"name": name, "country": "India"},
                      "geometry": rounded(g.simplify(0.01, preserve_topology=True))})
    covered = unary_union(india).buffer(0.002)
    for iso, country in (("PAK", "Pakistan"), ("BGD", "Bangladesh"), ("MMR", "Myanmar")):
        for f in json.loads((RAW / "gb" / f"{iso}-ADM1.geojson").read_text())["features"]:
            name = f["properties"]["shapeName"]
            if name in PROXY_SKIP_ADM1:
                continue
            g = make_valid(shape(f["geometry"])).difference(covered)
            if g.is_empty or g.area < 0.01:
                continue
            feats.append({"type": "Feature", "properties": {"name": NAME_FIX.get(name, name), "country": country},
                          "geometry": rounded(g.simplify(0.01, preserve_topology=True))})
    write("today.geojson", feats)


if __name__ == "__main__":
    today()
    units()
    clipped("ne_10m_land.geojson", "land.geojson")
    clipped("ne_10m_rivers_lake_centerlines.geojson", "rivers.geojson",
            keep=lambda p: (p.get("scalerank") or 99) <= 7)
    clipped("ne_10m_lakes.geojson", "lakes.geojson", keep=lambda p: (p.get("scalerank") or 99) <= 6)
