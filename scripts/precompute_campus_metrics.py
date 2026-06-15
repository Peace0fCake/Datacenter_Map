"""
Precomputes per-campus power/CO2/water metrics for all OSM campuses and
regenerates the power-weighted KDE heatmap.

Run:  python scripts/precompute_campus_metrics.py
Or:   npm run precompute

Output:
  public/data/campus_metrics.json   - full metrics for every campus
  public/data/dc_heatmap.geojson    - power-weighted KDE (replaces uniform KDE)

Designed to run at build time or on a daily schedule (CI/cron).
"""

import json, math, os
from datetime import datetime, timezone
import numpy as np
from scipy.ndimage import gaussian_filter

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load(rel):
    with open(os.path.join(BASE, rel), encoding='utf-8') as f:
        return json.load(f)

def save(rel, data):
    path = os.path.join(BASE, rel)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))
    return path

# ── Source data ───────────────────────────────────────────────────────────────
campuses     = load('public/data/osm_campuses.geojson')
country_stats = load('public/data/country_dc_stats.json')
dc_power      = load('src/data/dcPowerByCountry.json')

# ── Country average annual temperature (°C) ───────────────────────────────────
COUNTRY_TEMP = {
    'IE': 9.0,  'GB': 10.5, 'NL': 10.5, 'BE': 10.5, 'DE':  9.5, 'FR': 11.5,
    'LU': 9.5,  'CH':  8.0, 'AT':  8.5, 'DK':  8.5, 'SE':  5.5, 'NO':  4.5,
    'FI': 3.0,  'EE':  5.5, 'LV':  6.0, 'LT':  6.5, 'PL':  8.5, 'CZ':  9.0,
    'SK': 9.5,  'HU': 11.0, 'RO': 10.5, 'BG': 12.0, 'HR': 12.5, 'SI':  9.5,
    'IT': 13.5, 'ES': 14.0, 'PT': 15.5, 'GR': 17.0, 'TR': 12.5, 'IS':  4.0,
    'MT': 19.0, 'CY': 21.0, 'RS': 11.5, 'AL': 13.5, 'BA': 10.5, 'ME': 12.0,
    'MK': 12.5, 'MD': 10.5, 'BY':  6.5, 'UA':  8.5, 'AM': 12.0, 'AZ': 13.0,
    'GE': 12.5, 'KZ':  5.0, 'RU':  3.0,
}

# ── Operator type inference (mirrors model.js TYPE_KEYWORDS) ──────────────────
TYPE_KEYWORDS = {
    'hyperscaler': ['microsoft','azure','google','amazon','aws','meta ','facebook','apple ','alibaba','baidu','tencent'],
    'cloud':       ['ovh','hetzner','scaleway','ionos','linode','vultr','leaseweb','contabo','fastly','cloudflare','serverius','previder','hosteurope'],
    'colocation':  ['equinix','digital realty','interxion','ntt ','cyrusone','iron mountain','global switch','globalswitch','vantage','data4','colt ','stack infra','ase','nldc','nabiax','ascenty'],
    'carrier':     ['telekom','telecom','telia','swisscom','bt data','orange','vodafone','telefonica','kddi','tele2','proximus','kcell','teliasonera'],
}
OPERATOR_PUE = {
    'equinix':1.45, 'data4':1.30, 'interxion':1.35, 'digital realty':1.47,
    'global switch':1.39, 'globalswitch':1.39, 'ntt':1.30, 'cyrusone':1.45,
    'iron mountain':1.47, 'vantage':1.35, 'ovh':1.40, 'ovhcloud':1.40,
    'hetzner':1.20, 'microsoft':1.12, 'azure':1.12, 'google':1.10,
    'amazon':1.15, 'aws':1.15,
}
DC_TYPE_PUE_DELTA = {'hyperscaler':-0.22,'cloud':-0.08,'colocation':0.02,'carrier':0.14,'enterprise':0.30}

def infer_type(name):
    if not name: return None
    lo = name.lower()
    for t, kws in TYPE_KEYWORDS.items():
        if any(k in lo for k in kws): return t
    return None

def reported_pue(name):
    if not name: return None
    lo = name.lower()
    for k, v in OPERATOR_PUE.items():
        if k in lo: return v
    return None

def estimate_pue(temp_c, dc_type, footprint_m2):
    base  = 1.40 + 0.012 * temp_c
    tdelt = DC_TYPE_PUE_DELTA.get(dc_type, 0)
    sdelt = -0.05 * (math.log10(max(footprint_m2, 1)) - 4) if footprint_m2 else 0
    return max(1.05, min(2.2, base + tdelt + sdelt))

def utilization(mw):
    if mw <= 5:  return 0.55
    if mw <= 25: return 0.60
    return 0.65

def allocate_mwh(footprint_m2, country, cs):
    if not footprint_m2 or country not in cs: return None
    total_fp = cs[country].get('total_footprint_m2', 0)
    if not total_fp or country not in dc_power: return None
    share = footprint_m2 / total_fp
    return dc_power[country]['twh'] * 1e6 * share   # MWh/yr

# ── Centroid helper ────────────────────────────────────────────────────────────
def centroid(feat):
    g = feat['geometry']
    if g['type'] == 'Point':
        return g['coordinates'][0], g['coordinates'][1]
    c = g['coordinates']
    ring = c[0][0] if g['type'] == 'MultiPolygon' else c[0]
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    return sum(xs)/len(xs), sum(ys)/len(ys)

# ── Main computation loop ──────────────────────────────────────────────────────
# This script's ONLY jobs are (1) cache total_mwh_yr so the panel is instant, and
# (2) provide the heatmap weight. All downstream metrics (cooling split, WUE, water,
# CO2) are computed in src/lib/model.js (computeMetrics) at click time — they are NOT
# duplicated here, so there is a single source of truth for those formulas.
print('Computing campus metrics...')
results       = {}
kde_pts       = []   # (lng, lat, weight_mw) for KDE
total_campuses = len(campuses['features'])
no_operator    = 0

for feat in campuses['features']:
    p  = feat['properties']
    cid = p.get('id') or p.get('campus_id')
    if not cid: continue

    country   = p.get('country_iso2') or ''
    operator  = p.get('operator') or ''
    footprint = p.get('total_footprint_m2') or 0
    cap_mw    = p.get('estimated_capacity_mw') or 0

    if not operator:
        no_operator += 1

    temp_c   = COUNTRY_TEMP.get(country, 10.0)
    dc_type  = infer_type(operator)
    rpue     = reported_pue(operator)
    pue      = rpue if rpue else estimate_pue(temp_c, dc_type, footprint)

    # Priority: national-share footprint allocation (primary) > capacity estimate (fallback).
    # estimated_capacity_mw is itself footprint-derived (~300 W/m²), so allocation — which ties
    # to measured national DC electricity statistics — is the more defensible primary method.
    alloc_mwh = allocate_mwh(footprint, country, country_stats)
    if alloc_mwh:
        total_mwh = alloc_mwh
        it_mwh    = total_mwh / pue
        power_mw  = it_mwh / 8760
    elif cap_mw:
        util      = utilization(cap_mw)
        it_mwh    = cap_mw * util * 8760
        total_mwh = it_mwh * pue
        power_mw  = cap_mw
    else:
        continue  # no estimate possible

    results[cid] = {
        'power_mw':        round(power_mw, 3),
        'total_mwh_yr':    round(total_mwh),
        'pue':             round(pue, 3),
        'pue_reported':    rpue is not None,
        'dc_type':         dc_type,
        'country':         country,
        'avg_temp_c':      temp_c,
    }

    try:
        lng, lat = centroid(feat)
        kde_pts.append((lng, lat, power_mw))
    except Exception:
        pass

print(f'  {len(results)} campuses computed  '
      f'  total power: {sum(r["power_mw"] for r in results.values()):.0f} MW')

# ── Save campus_metrics.json ──────────────────────────────────────────────────
# stats block is consumed by the UI (methodology page) so displayed counts never drift.
out = {
    'generated_at':       datetime.now(timezone.utc).isoformat(),
    'campus_count':       len(results),
    'total_campus_count': total_campuses,
    'no_operator_count':  no_operator,
    'no_operator_pct':    round(no_operator / total_campuses * 100) if total_campuses else 0,
    'total_power_mw':     round(sum(r['power_mw'] for r in results.values()), 1),
    'campuses':           results,
}
path = save('public/data/campus_metrics.json', out)
print(f'  Saved {os.path.getsize(path)//1024} KB -> campus_metrics.json '
      f'({total_campuses} total, {no_operator} no-operator)')

# ── Raw power grid (no diffusion) ────────────────────────────────────────────
# Each cell = sum of estimated_capacity_mw for DCs whose centroid falls in it.
# Viewport-adaptive normalisation is handled in React (queryRenderedFeatures).
print('Generating raw power grid...')

CELL    = 0.10
LON_MIN, LON_MAX = -25, 45
LAT_MIN, LAT_MAX =  34, 72
NCOLS = round((LON_MAX - LON_MIN) / CELL)
NROWS = round((LAT_MAX - LAT_MIN) / CELL)

grid = np.zeros((NROWS, NCOLS), dtype=np.float64)
for lng, lat, w in kde_pts:
    if not (LON_MIN <= lng <= LON_MAX and LAT_MIN <= lat <= LAT_MAX): continue
    col = min(int((lng - LON_MIN) / CELL), NCOLS - 1)
    row = min(NROWS - 1 - int((lat - LAT_MIN) / CELL), NROWS - 1)
    grid[row, col] += w

# Store raw MW values — React normalises to viewport max at render time
features = []
for row in range(NROWS):
    for col in range(NCOLS):
        v = float(grid[row, col])
        if v <= 0: continue
        lat_s = round(LAT_MIN + (NROWS - 1 - row) * CELL, 2)
        lon_w = round(LON_MIN + col * CELL, 2)
        features.append({
            'type': 'Feature',
            'properties': {'density': round(v, 2)},
            'geometry': {'type': 'Polygon', 'coordinates': [[
                [lon_w, lat_s], [lon_w+CELL, lat_s],
                [lon_w+CELL, lat_s+CELL], [lon_w, lat_s+CELL], [lon_w, lat_s]
            ]]}
        })

path = save('public/data/dc_heatmap.geojson',
            {'type': 'FeatureCollection', 'features': features})
print(f'  {len(features)} cells  {os.path.getsize(path)//1024} KB -> dc_heatmap.geojson')
print('Done.')
