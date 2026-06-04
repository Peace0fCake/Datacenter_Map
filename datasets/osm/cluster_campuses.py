"""
cluster_campuses.py

Groups individual OSM building features from osm_datacenters.geojson into
campus-level features by combining:
  1. Same operator (normalised) OR same name prefix (stripped of trailing numbers)
  2. Within MAX_DIST_M of each other (connected-components / single-linkage)

Buildings that can't be grouped become a campus of size 1.

Name priority: OSM name tag > operator > constructed fallback (operator + city/country).
This means a building tagged name=CNRS / operator=Data4 will show as "CNRS",
not "Data4", even though it clusters with other Data4 buildings.

Usage:
  python3 cluster_campuses.py

Outputs (written to ../../public/data/):
  osm_campuses.geojson      — one Point feature per campus (or standalone building)
  osm_datacenters.geojson   — copy of the source file (for the individual-building layer)
  country_dc_stats.json     — per-country building count, campus count, total footprint m²
"""

import json
import math
import re
import hashlib
from pathlib import Path

HERE       = Path(__file__).parent
SRC        = HERE / "osm_datacenters.geojson"
REPO_ROOT  = HERE.parent.parent          # datasets/osm → datasets → repo root
OUT_DIR    = REPO_ROOT / "public" / "data"
OUT_CAMPUS = OUT_DIR / "osm_campuses.geojson"
OUT_COPY   = OUT_DIR / "osm_datacenters.geojson"
OUT_STATS  = OUT_DIR / "country_dc_stats.json"

MAX_DIST_M = 1_000   # buildings within 1 km AND same key → same campus


# ── Name normalisation ────────────────────────────────────────────────────────

_TRAILING_NUM = re.compile(
    r'[\s\-_#\.]*'                           # optional separator
    r'(\b\d+\b'                              # plain integer
    r'|[IVX]{1,4})'                          # or Roman numeral
    r'\s*$',
    re.IGNORECASE,
)

def normalize(name):
    """'Equinix PA3' → 'Equinix PA',  'TeleCity 11' → 'TeleCity'"""
    if not name:
        return None
    base = _TRAILING_NUM.sub('', name.strip()).strip()
    return base or name.strip()


def group_key(props):
    op   = (props.get('operator') or '').strip()
    name = (props.get('name')     or '').strip()
    if op:
        return ('op',   normalize(op).lower())
    if name:
        return ('name', normalize(name).lower())
    return None   # standalone


# ── Geometry ──────────────────────────────────────────────────────────────────

def haversine_m(lat1, lon1, lat2, lon2):
    R = 6_371_000
    d1 = math.radians(lat2 - lat1)
    d2 = math.radians(lon2 - lon1)
    a  = (math.sin(d1 / 2) ** 2
          + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
          * math.sin(d2 / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def centroid(lats, lons):
    return sum(lats) / len(lats), sum(lons) / len(lons)


# ── Union-Find ────────────────────────────────────────────────────────────────

def connected_components(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i, j in edges:
        pi, pj = find(i), find(j)
        if pi != pj:
            parent[pi] = pj

    groups = {}
    for i in range(n):
        root = find(i)
        groups.setdefault(root, []).append(i)
    return list(groups.values())


# ── Campus feature builder ────────────────────────────────────────────────────

def make_campus(members, features):
    """Build one campus GeoJSON feature from a list of member feature objects."""
    props_list = [f['properties'] for f in members]

    lats = [p['lat'] for p in props_list]
    lons = [p['lon'] for p in props_list]
    lat, lon = centroid(lats, lons)

    areas    = [p['footprint_m2'] for p in props_list if p.get('footprint_m2')]
    total_m2 = round(sum(areas), 1) if areas else None
    est_mw   = round(sum(p['estimated_capacity_mw'] for p in props_list
                         if p.get('estimated_capacity_mw')), 3) if areas else None

    def majority(vals):
        vals = [v for v in vals if v]
        if not vals:
            return None
        return max(set(vals), key=vals.count)

    # Name priority: OSM name > operator (so "CNRS" beats "Data4" when name tag is set)
    operator = majority([p.get('operator') for p in props_list])
    osm_name = majority([p.get('name')     for p in props_list])
    country  = majority([p.get('country_iso2') for p in props_list])

    # Construct a useful display name
    if osm_name:
        display_name = osm_name
    elif operator:
        # Add city if we can get it from addr_city of any member
        city = majority([p.get('addr_city') for p in props_list])
        display_name = f"{operator} — {city}" if city else operator
    else:
        # Nothing useful from OSM — use country fallback
        display_name = f"Data Center — {country}" if country else "Data Center"

    member_ids = sorted(p['osm_id'] for p in props_list)
    campus_id  = 'c' + hashlib.md5(
        ','.join(str(i) for i in member_ids).encode()
    ).hexdigest()[:10]

    osm_url = props_list[0].get('osm_url') if len(members) == 1 else None

    return {
        'type': 'Feature',
        'geometry': {'type': 'Point', 'coordinates': [round(lon, 7), round(lat, 7)]},
        'properties': {
            'id':                    f'campus-{campus_id}',
            'campus_id':             campus_id,
            'name':                  display_name,
            'operator':              operator,
            'country_iso2':          country,
            'building_count':        len(members),
            'total_footprint_m2':    total_m2,
            'estimated_capacity_mw': est_mw,
            'lat':                   round(lat, 7),
            'lon':                   round(lon, 7),
            'osm_url':               osm_url,
            'member_ids':            member_ids,
        },
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Reading {SRC.name} …")
    data     = json.loads(SRC.read_text())
    features = data['features']
    print(f"  {len(features)} features")

    # Bucket features by group key
    buckets = {}     # key → list of feature indices
    singles = []     # features with no groupable key

    for i, f in enumerate(features):
        k = group_key(f['properties'])
        if k is None:
            singles.append(i)
        else:
            buckets.setdefault(k, []).append(i)

    # Within each bucket, find spatially-connected components
    campus_features = []
    multi_count     = 0

    for key, indices in buckets.items():
        if len(indices) == 1:
            campus_features.append(make_campus([features[indices[0]]], features))
            continue

        # Build edges: pairs within MAX_DIST_M
        bucket_feats = [features[i] for i in indices]
        edges = []
        for a in range(len(bucket_feats)):
            pa = bucket_feats[a]['properties']
            for b in range(a + 1, len(bucket_feats)):
                pb = bucket_feats[b]['properties']
                dist = haversine_m(pa['lat'], pa['lon'], pb['lat'], pb['lon'])
                if dist <= MAX_DIST_M:
                    edges.append((a, b))

        for component in connected_components(len(bucket_feats), edges):
            members = [bucket_feats[i] for i in component]
            campus_features.append(make_campus(members, features))
            if len(members) > 1:
                multi_count += 1

    # Singletons
    for i in singles:
        campus_features.append(make_campus([features[i]], features))

    # Tag individual building features with their campus id so the map
    # can highlight all buildings in a campus on selection.
    # (Build a reverse lookup: osm_id → campus_id)
    osm_to_campus = {}
    for cf in campus_features:
        cid = cf['properties']['campus_id']
        for osm_id in cf['properties']['member_ids']:
            osm_to_campus[osm_id] = cid

    enriched_buildings = []
    for f in features:
        osm_id   = f['properties']['osm_id']
        campus_id = osm_to_campus.get(osm_id, '')
        new_props = {
            **f['properties'],
            'id':        f"osm-{f['properties']['osm_type']}-{osm_id}",
            'campus_id': campus_id,
        }
        enriched_buildings.append({**f, 'properties': new_props})

    print(f"\nCampuses: {len(campus_features)}")
    print(f"  Multi-building campuses: {multi_count}")
    print(f"  Standalone buildings:    {len(campus_features) - multi_count}")
    print(f"  Ungrouped singletons:    {len(singles)}")

    # ── Country stats ─────────────────────────────────────────────────────────
    country_stats = {}
    for cf in campus_features:
        p   = cf['properties']
        iso = p.get('country_iso2') or 'XX'
        if iso not in country_stats:
            country_stats[iso] = {'campus_count': 0, 'building_count': 0,
                                  'total_footprint_m2': 0.0}
        s = country_stats[iso]
        s['campus_count']      += 1
        s['building_count']    += p.get('building_count', 1)
        s['total_footprint_m2'] = round(
            s['total_footprint_m2'] + (p.get('total_footprint_m2') or 0), 1
        )

    print(f"\nTop countries by campus count:")
    for iso, s in sorted(country_stats.items(), key=lambda x: -x[1]['campus_count'])[:10]:
        print(f"  {iso}: {s['campus_count']} campuses / {s['building_count']} buildings "
              f"/ {s['total_footprint_m2']/1e4:.1f} ha")

    # ── Write outputs ──────────────────────────────────────────────────────────
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    campus_geojson = {'type': 'FeatureCollection', 'features': campus_features}
    OUT_CAMPUS.write_text(json.dumps(campus_geojson, ensure_ascii=False, indent=2))
    print(f"\nSaved → {OUT_CAMPUS}  ({OUT_CAMPUS.stat().st_size // 1024} KB)")

    buildings_geojson = {'type': 'FeatureCollection', 'features': enriched_buildings}
    OUT_COPY.write_text(json.dumps(buildings_geojson, ensure_ascii=False, indent=2))
    print(f"Saved → {OUT_COPY}  ({OUT_COPY.stat().st_size // 1024} KB)")

    stats_out = {
        '_note': 'Generated by cluster_campuses.py from osm_datacenters.geojson',
        **country_stats,
    }
    OUT_STATS.write_text(json.dumps(stats_out, ensure_ascii=False, indent=2))
    print(f"Saved → {OUT_STATS}  ({OUT_STATS.stat().st_size // 1024} KB)")


if __name__ == '__main__':
    main()
