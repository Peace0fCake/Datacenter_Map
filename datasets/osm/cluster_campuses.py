"""
cluster_campuses.py

Groups OSM building features into campus-level features using a multi-priority
strategy, applied through a single global union-find:

  1. site_relation_id  — explicit OSM type=site membership (populated by fetch script)
  2. Containment       — building centroid falls inside a larger DC polygon;
                         the enclosing polygon is a site boundary, not a building
  3. operator / name   — same normalised key within MAX_DIST_M (original logic)
  4. Shared address    — addr:street + addr:postcode within MAX_DIST_M

Site-boundary polygons (those that enclose ≥ MIN_CONTAINED other DC centroids)
are excluded from building counts and footprint totals, but their name/operator
is used for the campus metadata.

Usage:
  python3 cluster_campuses.py

Outputs (written to ../../public/data/):
  osm_campuses.geojson      — one Point per campus (or standalone building)
  osm_datacenters.geojson   — individual buildings tagged with campus_id
  country_dc_stats.json     — per-country aggregates
"""

import json
import math
import re
import hashlib
from collections import defaultdict
from pathlib import Path

HERE       = Path(__file__).parent
SRC        = HERE / "osm_datacenters.geojson"
REPO_ROOT  = HERE.parent.parent
OUT_DIR    = REPO_ROOT / "public" / "data"
OUT_CAMPUS = OUT_DIR / "osm_campuses.geojson"
OUT_COPY   = OUT_DIR / "osm_datacenters.geojson"
OUT_STATS  = OUT_DIR / "country_dc_stats.json"

MAX_DIST_M    = 1_000  # same-key buildings within this distance → same campus
MIN_CONTAINED = 2      # polygon must enclose ≥ this many other DC centroids to be a boundary


# ── Name normalisation ────────────────────────────────────────────────────────

_TRAILING_NUM = re.compile(
    r'[\s\-_#\.]*(\b\d+\b|[IVX]{1,4})\s*$',
    re.IGNORECASE,
)

def normalize(name):
    """'Equinix PA3' → 'Equinix PA',  'TeleCity 11' → 'TeleCity'"""
    if not name:
        return None
    base = _TRAILING_NUM.sub('', name.strip()).strip()
    return base or name.strip()


def op_name_key(props):
    """Grouping key from operator or name tag (normalised, trailing numbers stripped)."""
    op   = (props.get('operator') or '').strip()
    name = (props.get('name')     or '').strip()
    if op:
        return ('op',   normalize(op).lower())
    if name:
        return ('name', normalize(name).lower())
    return None


def address_key(props):
    """Grouping key from shared street + postcode."""
    street   = (props.get('addr_street')   or '').strip().lower()
    postcode = (props.get('addr_postcode') or '').strip().lower()
    if street and postcode:
        return ('addr', f"{street}|{postcode}")
    return None


# ── Geometry ──────────────────────────────────────────────────────────────────

def haversine_m(lat1, lon1, lat2, lon2):
    R  = 6_371_000
    d1 = math.radians(lat2 - lat1)
    d2 = math.radians(lon2 - lon1)
    a  = (math.sin(d1 / 2) ** 2
          + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
          * math.sin(d2 / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def avg(vals):
    return sum(vals) / len(vals)


def get_outer_ring(feature):
    """Return the outer coordinate ring [[x,y],...] of a Polygon or MultiPolygon."""
    geom  = feature.get('geometry') or {}
    gtype = geom.get('type')
    coords = geom.get('coordinates') or []
    if gtype == 'Polygon' and coords:
        return coords[0]
    if gtype == 'MultiPolygon' and coords:
        # use the ring with the most vertices (largest outer polygon)
        return max((p[0] for p in coords if p), key=len, default=[])
    return []


def ring_bbox(ring):
    if not ring:
        return None
    xs = [c[0] for c in ring]
    ys = [c[1] for c in ring]
    return min(xs), min(ys), max(xs), max(ys)


def point_in_ring(px, py, ring):
    """Ray-casting point-in-polygon for a closed coordinate ring."""
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > py) != (yj > py)) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


# ── Union-Find ────────────────────────────────────────────────────────────────

def make_uf(n):
    return list(range(n))


def uf_find(parent, x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def uf_union(parent, x, y):
    px, py = uf_find(parent, x), uf_find(parent, y)
    if px != py:
        parent[px] = py


# ── Containment detection ─────────────────────────────────────────────────────

def find_site_boundaries(features):
    """
    Identify polygon features that act as site boundaries: those whose outer ring
    contains the centroids of MIN_CONTAINED or more other DC features.

    Returns
    -------
    boundaries : set of feature indices that are site boundaries
    contained_by : dict[child_index] → boundary_index (smallest enclosing boundary)
    """
    # Pre-compute rings and bboxes for polygon features only
    rings  = {}   # feature_index → outer ring
    bboxes = {}   # feature_index → (minx, miny, maxx, maxy)
    for i, f in enumerate(features):
        ring = get_outer_ring(f)
        if ring:
            rings[i]  = ring
            bboxes[i] = ring_bbox(ring)

    # All feature centroids (lon, lat)
    centroids = {i: (f['properties']['lon'], f['properties']['lat'])
                 for i, f in enumerate(features)}

    boundaries   = set()
    contained_by = {}  # child → (boundary_index, boundary_area)

    for bi, ring in rings.items():
        bb   = bboxes[bi]
        b_area = features[bi]['properties'].get('footprint_m2') or 0
        enclosed = []
        for fi, (px, py) in centroids.items():
            if fi == bi:
                continue
            # Bounding-box pre-filter, then exact ray-cast
            if bb[0] <= px <= bb[2] and bb[1] <= py <= bb[3]:
                if point_in_ring(px, py, ring):
                    enclosed.append(fi)

        if len(enclosed) >= MIN_CONTAINED:
            boundaries.add(bi)
            for child in enclosed:
                prev = contained_by.get(child)
                # Keep the smallest (most specific) enclosing boundary
                if prev is None or b_area < prev[1]:
                    contained_by[child] = (bi, b_area)

    contained_by = {k: v[0] for k, v in contained_by.items()}
    return boundaries, contained_by


# ── Campus feature builder ────────────────────────────────────────────────────

def make_campus(building_feats, boundary_feats):
    """
    building_feats : actual buildings (contribute to footprint + building_count)
    boundary_feats : site-boundary polygons (contribute name/operator metadata only)
    """
    all_feats  = building_feats + boundary_feats
    all_props  = [f['properties'] for f in all_feats]
    bld_props  = [f['properties'] for f in building_feats]

    lats = [p['lat'] for p in all_props]
    lons = [p['lon'] for p in all_props]
    lat  = avg(lats)
    lon  = avg(lons)

    # Footprint and estimated MW come from real buildings only
    areas  = [p['footprint_m2'] for p in bld_props if p.get('footprint_m2')]
    total_m2 = round(sum(areas), 1) if areas else None
    est_mw   = (round(sum(p['estimated_capacity_mw'] for p in bld_props
                          if p.get('estimated_capacity_mw')), 3)
                if areas else None)

    def majority(vals):
        vals = [v for v in vals if v]
        return max(set(vals), key=vals.count) if vals else None

    # Metadata: boundary features often have the canonical campus name/operator
    # so include them in the majority vote alongside buildings.
    operator = majority([p.get('operator') for p in all_props])
    osm_name = majority([p.get('name')     for p in all_props])
    country  = majority([p.get('country_iso2') for p in all_props])

    if osm_name:
        display_name = osm_name
    elif operator:
        city = majority([p.get('addr_city') for p in bld_props])
        display_name = f"{operator} — {city}" if city else operator
    else:
        display_name = f"Data Center — {country}" if country else "Data Center"

    member_ids = sorted(p['osm_id'] for p in all_props)
    campus_id  = 'c' + hashlib.md5(
        ','.join(str(i) for i in member_ids).encode()
    ).hexdigest()[:10]

    # Only set osm_url for a true singleton (one real building, no boundary)
    osm_url = bld_props[0].get('osm_url') if len(all_feats) == 1 else None

    # Per-building detail for the UI member list (buildings only, not boundaries)
    member_buildings = [
        {
            'osm_id':       p['osm_id'],
            'osm_type':     p['osm_type'],
            'osm_url':      p.get('osm_url'),
            'name':         p.get('name') or p.get('operator') or None,
            'footprint_m2': p.get('footprint_m2'),
        }
        for p in bld_props
    ] if len(bld_props) > 1 else []

    return {
        'type': 'Feature',
        'geometry': {'type': 'Point', 'coordinates': [round(lon, 7), round(lat, 7)]},
        'properties': {
            'id':                    f'campus-{campus_id}',
            'campus_id':             campus_id,
            'name':                  display_name,
            'operator':              operator,
            'country_iso2':          country,
            'building_count':        len(building_feats),
            'total_footprint_m2':    total_m2,
            'estimated_capacity_mw': est_mw,
            'lat':                   round(lat, 7),
            'lon':                   round(lon, 7),
            'osm_url':               osm_url,
            'member_ids':            member_ids,
            'member_buildings':      member_buildings,
        },
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Reading {SRC.name} …")
    data     = json.loads(SRC.read_text())
    features = data['features']
    n        = len(features)
    print(f"  {n} features")

    # ── 1. Containment: find site-boundary polygons ───────────────────────────
    print("Detecting site-boundary containers …")
    boundaries, contained_by = find_site_boundaries(features)
    print(f"  {len(boundaries)} site-boundary polygons, "
          f"{len(contained_by)} buildings assigned via containment")

    # ── 2. Global union-find ──────────────────────────────────────────────────
    parent = make_uf(n)

    # 2a. Site-relation edges (explicit OSM grouping, populated by fetch script)
    site_buckets = defaultdict(list)
    for i, f in enumerate(features):
        sr = f['properties'].get('site_relation_id')
        if sr:
            site_buckets[sr].append(i)
    for indices in site_buckets.values():
        for j in range(1, len(indices)):
            uf_union(parent, indices[0], indices[j])

    # 2b. Containment edges: each enclosed building → its boundary polygon
    for child_i, boundary_i in contained_by.items():
        uf_union(parent, child_i, boundary_i)

    # 2c. Operator/name + distance edges
    op_buckets = defaultdict(list)
    for i, f in enumerate(features):
        k = op_name_key(f['properties'])
        if k:
            op_buckets[k].append(i)

    for indices in op_buckets.values():
        feats = [features[i] for i in indices]
        for a in range(len(indices)):
            pa = feats[a]['properties']
            for b in range(a + 1, len(indices)):
                pb = feats[b]['properties']
                if haversine_m(pa['lat'], pa['lon'], pb['lat'], pb['lon']) <= MAX_DIST_M:
                    uf_union(parent, indices[a], indices[b])

    # 2d. Shared address + distance edges
    addr_buckets = defaultdict(list)
    for i, f in enumerate(features):
        k = address_key(f['properties'])
        if k:
            addr_buckets[k].append(i)

    for indices in addr_buckets.values():
        feats = [features[i] for i in indices]
        for a in range(len(indices)):
            pa = feats[a]['properties']
            for b in range(a + 1, len(indices)):
                pb = feats[b]['properties']
                if haversine_m(pa['lat'], pa['lon'], pb['lat'], pb['lon']) <= MAX_DIST_M:
                    uf_union(parent, indices[a], indices[b])

    # ── 3. Collect components ─────────────────────────────────────────────────
    components = defaultdict(list)
    for i in range(n):
        components[uf_find(parent, i)].append(i)

    # ── 4. Build campus features ──────────────────────────────────────────────
    campus_features = []
    multi_count     = 0

    for member_indices in components.values():
        bld_feats = [features[i] for i in member_indices if i not in boundaries]
        bnd_feats = [features[i] for i in member_indices if i in boundaries]

        # Edge case: a boundary with no contained buildings (e.g. isolated large polygon)
        # → treat it as a real building so it still appears on the map
        if not bld_feats:
            bld_feats = bnd_feats
            bnd_feats = []

        campus_features.append(make_campus(bld_feats, bnd_feats))
        if len(bld_feats) > 1 or bnd_feats:
            multi_count += 1

    # ── 5. Tag individual buildings with their campus_id ──────────────────────
    osm_to_campus = {}
    for cf in campus_features:
        cid = cf['properties']['campus_id']
        for osm_id in cf['properties']['member_ids']:
            osm_to_campus[osm_id] = cid

    boundary_osm_ids = {features[i]['properties']['osm_id'] for i in boundaries}
    enriched_buildings = []
    for f in features:
        osm_id    = f['properties']['osm_id']
        campus_id = osm_to_campus.get(osm_id, '')
        is_bnd    = osm_id in boundary_osm_ids
        new_props = {
            **f['properties'],
            'id':                f"osm-{f['properties']['osm_type']}-{osm_id}",
            'campus_id':         campus_id,
            'is_site_boundary':  is_bnd,
        }
        enriched_buildings.append({**f, 'properties': new_props})

    # ── Summary ───────────────────────────────────────────────────────────────
    ungrouped = sum(1 for idxs in components.values()
                    if len([i for i in idxs if i not in boundaries]) == 1
                    and not any(i in boundaries for i in idxs))
    print(f"\nCampuses:                  {len(campus_features)}")
    print(f"  Multi-building campuses: {multi_count}")
    print(f"  Standalone buildings:    {len(campus_features) - multi_count}")
    print(f"  Site-boundary polygons:  {len(boundaries)} (excluded from counts)")

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
        print(f"  {iso}: {s['campus_count']} campuses / {s['building_count']} buildings"
              f" / {s['total_footprint_m2']/1e4:.1f} ha")

    # ── Write outputs ─────────────────────────────────────────────────────────
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
