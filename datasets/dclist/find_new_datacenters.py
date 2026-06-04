"""
find_new_datacenters.py

Usage:
  python3 find_new_datacenters.py           # resume from geocoded_progress.csv
  python3 find_new_datacenters.py --fresh   # delete progress and start from zero

Steps:
  1. Geocode european_datacenters_valid.csv via Nominatim.
     Each geocoded row is appended to geocoded_progress.csv immediately —
     open the file while the script runs to see results live.
     On restart without --fresh, already-done rows are skipped.

  2. Fetch OSM data centers via Overpass API.

  3. Compare: rows with no OSM DC within 1 km → extra_datacenters.csv.

Outputs:
  geocoded_progress.csv  — live-updating; becomes the final geocoded dataset
  geocoded_fallback.csv  — city/failed rows with Google Maps links
  extra_datacenters.csv  — DCs not found in OSM within 1 km
"""

import csv
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE          = Path(__file__).parent
INPUT_CSV     = HERE / "european_datacenters_valid.csv"
PROGRESS_CSV  = HERE / "geocoded_progress.csv"
FALLBACK_CSV  = HERE / "geocoded_fallback.csv"
OUTPUT_CSV    = HERE / "extra_datacenters.csv"

THRESHOLD_KM  = 1.0
FRESH         = "--fresh" in sys.argv

# ── Haversine ─────────────────────────────────────────────────────────────────
def haversine(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))

# ── Address cleaner ───────────────────────────────────────────────────────────
_COUNTRY_SUFFIXES = re.compile(
    r'\b(United Kingdom|UK|Great Britain|Germany|Deutschland|France|Spain|España|'
    r'Netherlands|Nederland|Italy|Italia|Switzerland|Suisse|Svizzera|Sweden|Sverige|'
    r'Poland|Polska|Ireland|Belgium|België|Austria|Denmark|Danmark|Norway|Norge|'
    r'Finland|Suomi|Portugal|Romania|România|Russia|Turkey|Türkiye|Ukraine|'
    r'Bulgaria|Greece|Hungary|Czech Republic|Czechia|Slovakia|Croatia|Lithuania|'
    r'Latvia|Estonia|Slovenia|Serbia|Luxembourg|Cyprus|Iceland|Albania|Armenia|'
    r'Azerbaijan|Belarus|Bosnia and Herzegovina|Georgia|Gibraltar|Guernsey|'
    r'Isle of Man|Jersey|Kosovo|Liechtenstein|Moldova|Monaco|Montenegro|'
    r'North Macedonia|Macedonia)\s*$',
    re.IGNORECASE,
)
_PHONE    = re.compile(r'[\+\(]?\d[\d\s\-\(\)/\.]{6,}')
_TRAILING = re.compile(r'[\s,;]+$')

def clean_street(address: str, city: str) -> str:
    s = _PHONE.sub('', address)
    s = _COUNTRY_SUFFIXES.sub('', s)
    if city.strip():
        s = re.sub(re.escape(city.strip()) + r'\s*$', '', s, flags=re.IGNORECASE)
    return _TRAILING.sub('', s).strip()

# ── Nominatim ─────────────────────────────────────────────────────────────────
NOMINATIM = "https://nominatim.openstreetmap.org/search"
HEADERS   = {"User-Agent": "ai-datacenter-map-school-project/1.0 (mtwmuller@gmail.com)"}

def _call(params: dict) -> tuple[float, float] | None:
    url = f"{NOMINATIM}?{urllib.parse.urlencode(params)}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.loads(r.read())
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
            return None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 10 * (attempt + 1)
                print(f"\n    rate-limited — waiting {wait}s …")
                time.sleep(wait)
            else:
                print(f"\n    HTTP {e.code} on: {url[:70]}")
                return None
        except Exception as e:
            print(f"\n    error: {e}")
            return None
    return None

def geocode_row(address: str, city: str, country: str) -> tuple[tuple[float, float] | None, str]:
    # 1. Structured: cleaned street + city + country
    street = clean_street(address, city)
    if street:
        result = _call({"street": street, "city": city, "country": country,
                        "format": "json", "limit": 1})
        if result:
            return result, "address"
        time.sleep(1.2)

    # 2. Free-text: raw address string (handles postcodes, building names, etc.)
    if address.strip():
        result = _call({"q": address.strip(), "format": "json", "limit": 1,
                        "countrycodes": _iso2(country)})
        if result:
            return result, "address"
        time.sleep(1.2)

    # 3. Last resort: city + country only
    result = _call({"city": city or country, "country": country,
                    "format": "json", "limit": 1})
    return result, "city"

_ISO2 = {
    "United Kingdom": "gb", "Germany": "de", "France": "fr", "Netherlands": "nl",
    "Italy": "it", "Spain": "es", "Switzerland": "ch", "Sweden": "se",
    "Poland": "pl", "Ireland": "ie", "Belgium": "be", "Austria": "at",
    "Denmark": "dk", "Norway": "no", "Finland": "fi", "Portugal": "pt",
    "Romania": "ro", "Bulgaria": "bg", "Greece": "gr", "Hungary": "hu",
    "Czechia": "cz", "Slovakia": "sk", "Croatia": "hr", "Lithuania": "lt",
    "Latvia": "lv", "Estonia": "ee", "Luxembourg": "lu", "Cyprus": "cy",
    "Iceland": "is", "Turkey": "tr", "Ukraine": "ua", "Russia": "ru",
    "Albania": "al", "Armenia": "am", "Azerbaijan": "az", "Belarus": "by",
    "Bosnia and Herzegovina": "ba", "Georgia": "ge", "Gibraltar": "gi",
    "Kosovo": "xk", "Liechtenstein": "li", "Moldova": "md", "Monaco": "mc",
    "Montenegro": "me", "North Macedonia": "mk", "Serbia": "rs",
    "Slovenia": "si", "Guernsey": "gg", "Isle of Man": "im", "Jersey": "je",
}
def _iso2(country: str) -> str:
    return _ISO2.get(country, "")

def cache_key(row) -> str:
    return row["address"].strip() or f"{row['city']}|{row['country']}"

def fmt_eta(s: float) -> str:
    s = int(s)
    if s < 60:   return f"{s}s"
    if s < 3600: return f"{s // 60}m {s % 60:02d}s"
    return f"{s // 3600}h {(s % 3600) // 60:02d}m"

# ── Step 1: geocode ───────────────────────────────────────────────────────────
print("=== Step 1: Geocoding ===")

if FRESH and PROGRESS_CSV.exists():
    PROGRESS_CSV.unlink()
    print("--fresh: deleted existing progress, starting from zero")

rows      = list(csv.DictReader(open(INPUT_CSV, encoding="utf-8")))
base_flds = list(rows[0].keys())
prog_flds = base_flds + ["lat", "lng", "geocode_method"]

# Load already-done rows from progress CSV
done: dict[str, dict] = {}
if PROGRESS_CSV.exists():
    with open(PROGRESS_CSV, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            done[cache_key(r)] = r
    print(f"Resuming — {len(done)} rows already geocoded")

to_geocode = [r for r in rows if cache_key(r) not in done]
print(f"{len(rows)} total  |  {len(done)} done  |  {len(to_geocode)} remaining")

if to_geocode:
    # Open progress CSV in append mode; write header only if file is new
    write_header = not PROGRESS_CSV.exists()
    prog_file = open(PROGRESS_CSV, "a", newline="", encoding="utf-8")
    writer    = csv.DictWriter(prog_file, fieldnames=prog_flds)
    if write_header:
        writer.writeheader()

    addr_hits = city_hits = misses = 0
    total     = len(to_geocode)
    t_start   = time.time()

    for i, row in enumerate(to_geocode):
        result, method = geocode_row(row["address"], row["city"], row["country"])
        time.sleep(1.2)

        out_row = {
            **row,
            "lat":            result[0] if result else "",
            "lng":            result[1] if result else "",
            "geocode_method": method    if result else "failed",
        }
        writer.writerow(out_row)
        prog_file.flush()           # visible in the file immediately
        done[cache_key(row)] = out_row

        if result:
            if method == "address": addr_hits += 1
            else:                   city_hits += 1
        else:
            misses += 1

        done_n  = i + 1
        elapsed = time.time() - t_start
        eta     = (elapsed / done_n) * (total - done_n)
        print(
            f"  [{done_n}/{total} {done_n/total*100:5.1f}%]  "
            f"addr:{addr_hits}  city:{city_hits}  failed:{misses}  "
            f"elapsed:{fmt_eta(elapsed)}  ETA:{fmt_eta(eta)}",
            end="\r", flush=True,
        )

    print(f"\nGeocoding complete.")
    prog_file.close()
else:
    print("Nothing to geocode — all rows already in progress CSV.")

# Rebuild full result list from progress CSV (includes previously-done rows)
all_geocoded = list(csv.DictReader(open(PROGRESS_CSV, encoding="utf-8")))
print(f"{len(all_geocoded)} total geocoded rows loaded from {PROGRESS_CSV.name}")

# Split precise vs fallback
precise_rows  = []
fallback_rows = []
for row in all_geocoded:
    if row["lat"] and row["geocode_method"] == "address":
        precise_rows.append(row)
    else:
        maps_q = urllib.parse.quote_plus(
            f"{row['address'].strip() or row['city']}, {row['country']}"
        )
        fallback_rows.append({
            **row,
            "maps_search": f"https://maps.google.com/?q={maps_q}",
        })

print(f"  {len(precise_rows)} address-level  |  {len(fallback_rows)} city/failed")

fallbk_flds = prog_flds + ["maps_search"]
with open(FALLBACK_CSV, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fallbk_flds)
    w.writeheader(); w.writerows(fallback_rows)
print(f"Saved → {FALLBACK_CSV.name}")

# ── Step 2: fetch OSM ─────────────────────────────────────────────────────────
print("\n=== Step 2: Fetching OSM data centers ===")

OSM_BBOX  = "30.0,-30.0,75.0,60.0"
OSM_QUERY = f"""
[out:json][timeout:90];
(
  node["telecom"="data_center"]({OSM_BBOX});
  node["building"="data_center"]({OSM_BBOX});
  node["building"="data_centre"]({OSM_BBOX});
  node["facility"="data_centre"]({OSM_BBOX});
  way["telecom"="data_center"]({OSM_BBOX});
  way["building"="data_center"]({OSM_BBOX});
  way["building"="data_centre"]({OSM_BBOX});
  way["facility"="data_centre"]({OSM_BBOX});
  relation["telecom"="data_center"]({OSM_BBOX});
  relation["building"="data_centre"]({OSM_BBOX});
  relation["facility"="data_centre"]({OSM_BBOX});
);
out center tags;
"""

print("Querying Overpass API …")
body = f"data={urllib.parse.quote(OSM_QUERY)}".encode()
req  = urllib.request.Request(
    "https://overpass-api.de/api/interpreter", data=body,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
)
with urllib.request.urlopen(req, timeout=120) as r:
    osm_data = json.loads(r.read())

osm_coords = []
for el in osm_data["elements"]:
    if el["type"] == "node":
        osm_coords.append((el["lat"], el["lon"]))
    elif "center" in el:
        osm_coords.append((el["center"]["lat"], el["center"]["lon"]))
print(f"Got {len(osm_coords)} OSM data centers")

# ── Step 3: compare ───────────────────────────────────────────────────────────
print(f"\n=== Step 3: Comparing (threshold = {THRESHOLD_KM} km) ===")

extras = []
for row in precise_rows:
    lat, lng = float(row["lat"]), float(row["lng"])
    if not any(haversine(lat, lng, olat, olng) <= THRESHOLD_KM for olat, olng in osm_coords):
        extras.append(row)

print(f"Found {len(extras)} rows with no OSM DC within {THRESHOLD_KM} km")

with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=prog_flds)
    w.writeheader(); w.writerows(extras)
print(f"Saved → {OUTPUT_CSV.name}")

country_counts: dict[str, int] = {}
for row in extras:
    country_counts[row["country"]] = country_counts.get(row["country"], 0) + 1
print("\nExtras by country:")
for k, v in sorted(country_counts.items(), key=lambda x: -x[1]):
    print(f"  {v:4d}  {k}")
