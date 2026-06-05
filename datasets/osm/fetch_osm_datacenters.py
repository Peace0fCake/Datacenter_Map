"""
fetch_osm_datacenters.py

Downloads all data centres in Europe from OpenStreetMap via the Overpass API
one country at a time.  Each country's raw response is cached to raw/XX.json
so the script can resume from where it left off after a crash or interrupt.
The output GeoJSON is rebuilt after every country, so partial results are
always available.

Usage:
  python3 fetch_osm_datacenters.py           # resume / start from scratch
  python3 fetch_osm_datacenters.py --fresh   # delete raw cache and restart

Outputs:
  raw/XX.json              — raw Overpass response per country (cache)
  osm_datacenters.geojson  — rebuilt after each country; one Feature per DC

Element types in the GeoJSON:
  node     → Point   (no footprint — area/capacity = null)
  way      → Polygon (building footprint, area computed)
  relation → MultiPolygon (campus / building complex)

Capacity estimate (rough, ±50%):
  footprint_m2 × building_levels (default 2) × 300 W/m² gross floor area
"""

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE       = Path(__file__).parent
RAW_DIR    = HERE / "raw"
SITES_DIR  = RAW_DIR / "sites"   # cached type=site relation responses
OUTPUT     = HERE / "osm_datacenters.geojson"
FRESH      = "--fresh" in sys.argv
HEADERS    = {"User-Agent": "ai-datacenter-map-school-project/1.0 (mtwmuller@gmail.com)"}

# European countries — ISO 3166-1 alpha-2 (name shown in progress only)
COUNTRIES = [
    ("AL", "Albania"),       ("AM", "Armenia"),       ("AT", "Austria"),
    ("AZ", "Azerbaijan"),    ("BA", "Bosnia"),         ("BE", "Belgium"),
    ("BG", "Bulgaria"),      ("BY", "Belarus"),        ("CH", "Switzerland"),
    ("CY", "Cyprus"),        ("CZ", "Czechia"),        ("DE", "Germany"),
    ("DK", "Denmark"),       ("EE", "Estonia"),        ("ES", "Spain"),
    ("FI", "Finland"),       ("FR", "France"),         ("GB", "UK"),
    ("GE", "Georgia"),       ("GI", "Gibraltar"),      ("GR", "Greece"),
    ("HR", "Croatia"),       ("HU", "Hungary"),        ("IE", "Ireland"),
    ("IS", "Iceland"),       ("IT", "Italy"),          ("LI", "Liechtenstein"),
    ("LT", "Lithuania"),     ("LU", "Luxembourg"),     ("LV", "Latvia"),
    ("MC", "Monaco"),        ("MD", "Moldova"),        ("ME", "Montenegro"),
    ("MK", "N. Macedonia"),  ("MT", "Malta"),          ("NL", "Netherlands"),
    ("NO", "Norway"),        ("PL", "Poland"),         ("PT", "Portugal"),
    ("RO", "Romania"),       ("RS", "Serbia"),         ("RU", "Russia"),
    ("SE", "Sweden"),        ("SI", "Slovenia"),       ("SK", "Slovakia"),
    ("TR", "Turkey"),        ("UA", "Ukraine"),        ("XK", "Kosovo"),
]

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def site_query(iso2):
    """
    Fetch type=site relations for a country using 'out body' so we get member
    lists (way/node ref IDs).  We don't need geometry — just which OSM IDs
    belong to which site relation.
    """
    return f"""
[out:json][timeout:60];
area["ISO3166-1"="{iso2}"]->.c;
(
  relation["type"="site"]["amenity"="data_centre"](area.c);
  relation["type"="site"]["amenity"="data_center"](area.c);
  relation["type"="site"]["telecom"="data_centre"](area.c);
  relation["type"="site"]["telecom"="data_center"](area.c);
  relation["type"="site"]["building"="data_centre"](area.c);
  relation["type"="site"]["building"="data_center"](area.c);
  relation["type"="site"]["facility"="data_centre"](area.c);
  relation["type"="site"]["facility"="data_center"](area.c);
  relation["type"="site"]["man_made"="data_centre"](area.c);
  relation["type"="site"]["man_made"="data_center"](area.c);
);
out body;
"""


def country_query(iso2):
    # All known OSM tagging schemes for data centres — both US and British spellings,
    # all element types.  Mirrors the tag set in src/hooks/useDataCenters.js exactly.
    return f"""
[out:json][timeout:60];
area["ISO3166-1"="{iso2}"]->.c;
(
  node["telecom"="data_center"](area.c);
  node["telecom"="data_centre"](area.c);
  node["building"="data_center"](area.c);
  node["building"="data_centre"](area.c);
  node["facility"="data_center"](area.c);
  node["facility"="data_centre"](area.c);
  node["man_made"="data_center"](area.c);
  node["man_made"="data_centre"](area.c);
  way["telecom"="data_center"](area.c);
  way["telecom"="data_centre"](area.c);
  way["building"="data_center"](area.c);
  way["building"="data_centre"](area.c);
  way["facility"="data_center"](area.c);
  way["facility"="data_centre"](area.c);
  way["man_made"="data_center"](area.c);
  way["man_made"="data_centre"](area.c);
  relation["telecom"="data_center"](area.c);
  relation["telecom"="data_centre"](area.c);
  relation["building"="data_center"](area.c);
  relation["building"="data_centre"](area.c);
  relation["facility"="data_center"](area.c);
  relation["facility"="data_centre"](area.c);
  relation["man_made"="data_center"](area.c);
  relation["man_made"="data_centre"](area.c);
);
out geom tags;
"""


# ── HTTP ──────────────────────────────────────────────────────────────────────

def fetch_site_relations(iso2):
    """Query Overpass for type=site relations; retry up to 3× on failure."""
    body = ("data=" + urllib.parse.quote(site_query(iso2))).encode()
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                OVERPASS_URL, data=body,
                headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded"},
            )
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 30 * (attempt + 1)
                print(f"\n    rate-limited (sites) — waiting {wait}s …")
                time.sleep(wait)
            else:
                print(f"\n    HTTP {e.code} (sites) for {iso2}")
                return None
        except Exception as e:
            print(f"\n    error fetching sites {iso2}: {e}")
            if attempt < 2:
                time.sleep(10)
    return None


def fetch_country(iso2):
    """Query Overpass for one country; retry up to 3× on rate-limit or timeout."""
    body = ("data=" + urllib.parse.quote(country_query(iso2))).encode()
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                OVERPASS_URL, data=body,
                headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded"},
            )
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 30 * (attempt + 1)
                print(f"\n    rate-limited — waiting {wait}s …")
                time.sleep(wait)
            else:
                print(f"\n    HTTP {e.code} for {iso2}")
                return None
        except Exception as e:
            print(f"\n    error fetching {iso2}: {e}")
            if attempt < 2:
                time.sleep(10)
    return None


# ── Geometry ──────────────────────────────────────────────────────────────────

def polygon_area_m2(coords):
    n = len(coords)
    if n < 3:
        return 0.0
    center_lat = sum(c[1] for c in coords) / n
    lat_scale  = 111_111.0
    lon_scale  = 111_111.0 * math.cos(math.radians(center_lat))
    xs = [c[0] * lon_scale for c in coords]
    ys = [c[1] * lat_scale for c in coords]
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += xs[i] * ys[j] - xs[j] * ys[i]
    return abs(area) / 2.0


def centroid(coords):
    return (
        sum(c[0] for c in coords) / len(coords),
        sum(c[1] for c in coords) / len(coords),
    )


def to_ring(geom_list):
    ring = [[g["lon"], g["lat"]] for g in geom_list]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


# ── Capacity estimate ─────────────────────────────────────────────────────────

def estimate_mw(footprint_m2, building_levels):
    if not footprint_m2:
        return None
    levels   = max(1, int(building_levels)) if building_levels else 2
    gross_m2 = footprint_m2 * levels
    return round(gross_m2 * 300 / 1_000_000, 3)  # 300 W/m²


# ── Tag extraction ────────────────────────────────────────────────────────────

def make_props(tags, osm_type, osm_id, lat, lon, footprint_m2, country_iso2):
    levels = None
    raw = tags.get("building:levels") or tags.get("levels")
    if raw:
        try:
            levels = int(float(raw))
        except ValueError:
            pass
    return {
        "osm_id":                osm_id,
        "osm_type":              osm_type,
        "osm_url":               f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
        "name":                  tags.get("name") or tags.get("operator") or None,
        "operator":              tags.get("operator") or None,
        "country_iso2":          country_iso2,
        "addr_country":          tags.get("addr:country") or None,
        "addr_city":             tags.get("addr:city") or None,
        "addr_street":           tags.get("addr:street") or None,
        "addr_postcode":         tags.get("addr:postcode") or None,
        "start_date":            tags.get("start_date") or None,
        "website":               tags.get("website") or tags.get("contact:website") or None,
        "building_levels":       levels,
        "telecom_tag":           tags.get("telecom") or None,
        "building_tag":          tags.get("building") or None,
        "lat":                   round(lat, 7),
        "lon":                   round(lon, 7),
        "footprint_m2":          round(footprint_m2, 1) if footprint_m2 else None,
        "estimated_capacity_mw": estimate_mw(footprint_m2, levels),
        "raw_tags":              tags,
    }


# ── Element → Feature ─────────────────────────────────────────────────────────

def node_to_feature(el, iso2):
    tags = el.get("tags", {})
    props = make_props(tags, "node", el["id"], el["lat"], el["lon"], None, iso2)
    return {"type": "Feature",
            "geometry": {"type": "Point", "coordinates": [el["lon"], el["lat"]]},
            "properties": props}


def way_to_feature(el, iso2):
    tags = el.get("tags", {})
    ring = to_ring(el.get("geometry", []))
    if len(ring) < 4:
        return None
    area   = polygon_area_m2(ring)
    cx, cy = centroid(ring)
    props  = make_props(tags, "way", el["id"], cy, cx, area, iso2)
    return {"type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": props}


def relation_to_feature(el, iso2):
    tags   = el.get("tags", {})
    outers, inners = [], []
    for m in el.get("members", []):
        if m.get("type") != "way" or not m.get("geometry"):
            continue
        ring = to_ring(m["geometry"])
        if len(ring) < 4:
            continue
        (inners if m.get("role") == "inner" else outers).append(ring)
    if not outers:
        return None
    total_area = sum(polygon_area_m2(r) for r in outers)
    cx, cy     = centroid([c for r in outers for c in r])
    props      = make_props(tags, "relation", el["id"], cy, cx, total_area, iso2)
    polygons   = [[outers[0]] + inners] + [[o] for o in outers[1:]]
    return {"type": "Feature",
            "geometry": {"type": "MultiPolygon", "coordinates": polygons},
            "properties": props}


def elements_to_features(elements, iso2):
    features, skipped = [], 0
    counts = {"node": 0, "way": 0, "relation": 0}
    for el in elements:
        t = el.get("type")
        counts[t] = counts.get(t, 0) + 1
        if t == "node":
            features.append(node_to_feature(el, iso2))
        elif t == "way":
            f = way_to_feature(el, iso2)
            if f:
                features.append(f)
            else:
                skipped += 1
        elif t == "relation":
            f = relation_to_feature(el, iso2)
            if f:
                features.append(f)
            else:
                skipped += 1
    return features, counts, skipped


# ── Output ────────────────────────────────────────────────────────────────────

def load_site_membership():
    """
    Build a mapping: osm_id (way/node) → site_relation_id from all cached
    SITES_DIR/XX.json files.  Returns an empty dict if no site caches exist.
    """
    membership = {}  # osm_id → relation_id
    if not SITES_DIR.exists():
        return membership
    for path in sorted(SITES_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except Exception:
            continue
        for el in data.get("elements", []):
            if el.get("type") != "relation":
                continue
            rel_id = el["id"]
            for m in el.get("members", []):
                if m.get("type") in ("way", "node"):
                    membership[m["ref"]] = rel_id
    return membership


def rebuild_geojson():
    """Merge all raw/XX.json files into the output GeoJSON, deduplicating by osm_id.
    Tags each feature with site_relation_id when it is a member of a type=site relation."""
    site_membership = load_site_membership()

    seen     = set()
    features = []
    for path in sorted(RAW_DIR.glob("*.json")):
        iso2 = path.stem
        data = json.loads(path.read_text())
        feats, _, _ = elements_to_features(data.get("elements", []), iso2)
        for f in feats:
            key = f["properties"]["osm_id"]
            if key not in seen:
                seen.add(key)
                site_rel = site_membership.get(key)
                if site_rel is not None:
                    f["properties"]["site_relation_id"] = site_rel
                features.append(f)
    OUTPUT.write_text(json.dumps(
        {"type": "FeatureCollection", "features": features},
        ensure_ascii=False, indent=2,
    ))
    return len(features)


# ── Progress ──────────────────────────────────────────────────────────────────

def fmt_eta(seconds):
    s = int(seconds)
    if s < 60:   return f"{s}s"
    if s < 3600: return f"{s // 60}m {s % 60:02d}s"
    return f"{s // 3600}h {(s % 3600) // 60:02d}m"


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    RAW_DIR.mkdir(exist_ok=True)
    SITES_DIR.mkdir(exist_ok=True)

    if FRESH:
        for f in RAW_DIR.glob("*.json"):
            f.unlink()
        for f in SITES_DIR.glob("*.json"):
            f.unlink()
        print("--fresh: cleared raw cache, starting from zero")

    done    = {p.stem for p in RAW_DIR.glob("*.json")}
    todo    = [(iso2, name) for iso2, name in COUNTRIES if iso2 not in done]
    total   = len(COUNTRIES)

    if done:
        print(f"Resuming — {len(done)}/{total} countries already cached")
    print(f"{len(todo)} countries to fetch\n")

    if not todo:
        n = rebuild_geojson()
        print(f"All countries cached.  Rebuilt {OUTPUT.name} → {n} features.")
        return

    t_start = time.time()
    fetched = 0

    for i, (iso2, name) in enumerate(todo):
        done_so_far = len(done) + i
        elapsed     = time.time() - t_start
        eta         = (elapsed / fetched * (len(todo) - fetched)) if fetched else 0

        print(
            f"  [{done_so_far + 1}/{total}  {iso2} {name}]"
            f"  elapsed:{fmt_eta(elapsed)}"
            f"  ETA:{fmt_eta(eta)}",
            end="  ", flush=True,
        )

        t0   = time.time()
        data = fetch_country(iso2)
        dur  = time.time() - t0

        if data is None:
            print(f"FAILED — skipping")
            continue

        elements = data.get("elements", [])
        _, counts, skipped = elements_to_features(elements, iso2)
        n_total = sum(counts.values())

        # Cache raw response
        (RAW_DIR / f"{iso2}.json").write_text(json.dumps(data))

        # Fetch type=site relations for this country (skip if already cached)
        sites_path = SITES_DIR / f"{iso2}.json"
        if not sites_path.exists():
            time.sleep(3)
            sites_data = fetch_site_relations(iso2)
            if sites_data is not None:
                n_sites = len([e for e in sites_data.get("elements", [])
                               if e.get("type") == "relation"])
                sites_path.write_text(json.dumps(sites_data))
                print(f"  +{n_sites} site-relations", end="", flush=True)

        # Rebuild GeoJSON immediately so partial output is always valid
        n_features = rebuild_geojson()

        fetched += 1
        print(
            f"  nodes:{counts.get('node',0)}  ways:{counts.get('way',0)}  "
            f"rels:{counts.get('relation',0)}"
            + (f"  skipped:{skipped}" if skipped else "")
            + f"  ({dur:.1f}s)  total so far:{n_features}"
        )

        # Be polite to Overpass — 3 s between requests
        if i < len(todo) - 1:
            time.sleep(3)

    # Final summary
    elapsed = time.time() - t_start
    n_final = rebuild_geojson()
    size_kb = OUTPUT.stat().st_size / 1024

    print(f"\nDone in {fmt_eta(elapsed)}.")
    print(f"Output: {n_final} features → {OUTPUT.name}  ({size_kb:.0f} KB)")

    with_area = sum(
        1 for p in RAW_DIR.glob("*.json")
        for el in json.loads(p.read_text()).get("elements", [])
        if el.get("type") in ("way", "relation")
    )
    print(f"  ways/relations (have footprint area): ~{with_area}")


if __name__ == "__main__":
    main()
