"""
Filter datacenters.csv to European countries (incl. Turkey, Caucasus, Russia)
and geocode each row using Nominatim (OSM).

Outputs:
  european_datacenters.csv          — filtered, no coordinates yet
  european_datacenters_geocoded.csv — filtered + lat/lng added

Nominatim rate limit: 1 req/sec. With ~3 000 rows expect ~50 min.
Run once; re-run is safe (skips already-geocoded rows if you add resume logic).
"""

import csv
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

# ── European country name variants → canonical name ──────────────────────────
# Covers English + common French/Spanish/Portuguese/Dutch/German/Russian variants
EUROPEAN = {
    # Albania
    "Albania": "Albania",
    # Armenia (Caucasus)
    "Armenia": "Armenia",
    # Austria
    "Austria": "Austria", "Österreich": "Austria",
    # Azerbaijan (Caucasus)
    "Azerbaijan": "Azerbaijan",
    # Belarus
    "Belarus": "Belarus", "Biélorussie": "Belarus",
    # Belgium
    "Belgium": "Belgium", "België": "Belgium", "Bélgica": "Belgium",
    "Belgique": "Belgium", "Belgien": "Belgium",
    # Bosnia and Herzegovina
    "Bosnia and Herzegovina": "Bosnia and Herzegovina",
    "Bosnia & Herzegovina": "Bosnia and Herzegovina",
    # Bulgaria
    "Bulgaria": "Bulgaria", "България": "Bulgaria",
    # Croatia
    "Croatia": "Croatia", "Hrvatska": "Croatia",
    # Cyprus
    "Cyprus": "Cyprus", "Chipre": "Cyprus", "Chypre": "Cyprus",
    # Czech Republic / Czechia
    "Czech Republic": "Czechia", "Czechia": "Czechia",
    "Tschechien": "Czechia", "República Checa": "Czechia",
    # Denmark
    "Denmark": "Denmark", "Danmark": "Denmark", "Danemark": "Denmark",
    # Estonia
    "Estonia": "Estonia", "Estonie": "Estonia",
    # Finland
    "Finland": "Finland", "Suomi": "Finland", "Finlandia": "Finland",
    "Finlande": "Finland",
    # France
    "France": "France",
    # Georgia (country, not US state — only 1 row, Tbilisi)
    "Georgia": "Georgia",
    # Germany
    "Germany": "Germany", "Deutschland": "Germany", "Duitsland": "Germany",
    "Allemagne": "Germany", "Alemania": "Germany",
    # Gibraltar
    "Gibraltar": "Gibraltar",
    # Greece
    "Greece": "Greece", "Grecia": "Greece", "Grèce": "Greece",
    # Guernsey
    "Guernsey": "Guernsey",
    # Hungary
    "Hungary": "Hungary", "Hongrie": "Hungary", "Ungarn": "Hungary",
    # Iceland
    "Iceland": "Iceland", "Islande": "Iceland",
    # Ireland
    "Ireland": "Ireland", "Irlande": "Ireland",
    # Isle of Man
    "Isle of Man": "Isle of Man",
    # Italy
    "Italy": "Italy", "Italie": "Italy", "Italia": "Italy",
    # Jersey
    "Jersey": "Jersey",
    # Kosovo
    "Kosovo": "Kosovo",
    # Latvia
    "Latvia": "Latvia", "Lettonie": "Latvia",
    # Liechtenstein
    "Liechtenstein": "Liechtenstein",
    # Lithuania
    "Lithuania": "Lithuania", "Lituanie": "Lithuania",
    # Luxembourg
    "Luxembourg": "Luxembourg",
    # Moldova
    "Moldova": "Moldova", "Moldávia": "Moldova", "Moldavie": "Moldova",
    "République de Moldavie": "Moldova",
    # Monaco
    "Monaco": "Monaco",
    # Montenegro
    "Montenegro": "Montenegro",
    # Netherlands
    "Netherlands": "Netherlands", "Nederland": "Netherlands",
    "Países Bajos": "Netherlands", "Niederlande": "Netherlands",
    "Noorwegen": "Norway",  # Dutch for Norway — see below
    "Pays-Bas": "Netherlands",
    # North Macedonia
    "North Macedonia": "North Macedonia", "Macedonia": "North Macedonia",
    "Macédoine du Nord": "North Macedonia",
    # Norway
    "Norway": "Norway", "Norge": "Norway",
    # Poland
    "Poland": "Poland", "Polska": "Poland", "Pologne": "Poland",
    # Portugal
    "Portugal": "Portugal",
    # Romania
    "Romania": "Romania", "România": "Romania", "Rumanía": "Romania",
    "Roumanie": "Romania",
    # Russia
    "Russia": "Russia", "Russian Federation": "Russia",
    "Россия": "Russia",
    # Serbia
    "Serbia": "Serbia", "Serbia and Montenegro": "Serbia",
    "Serbie": "Serbia",
    # Slovakia
    "Slovakia": "Slovakia", "Slovaquie": "Slovakia",
    # Slovenia
    "Slovenia": "Slovenia", "Slovénie": "Slovenia",
    # Spain
    "Spain": "Spain", "España": "Spain", "Espagne": "Spain",
    "Spanien": "Spain",
    # Sweden
    "Sweden": "Sweden", "Sverige": "Sweden", "Suède": "Sweden",
    "Schweden": "Sweden",
    # Switzerland
    "Switzerland": "Switzerland", "Svizzera": "Switzerland",
    "Schweiz": "Switzerland", "Suisse": "Switzerland",
    # Turkey
    "Turkey": "Turkey", "Türkiye": "Turkey", "Turquía": "Turkey",
    "Turquie": "Turkey",
    # Ukraine
    "Ukraine": "Ukraine", "Ucrania": "Ukraine",
    # United Kingdom
    "United Kingdom": "United Kingdom", "UK": "United Kingdom",
    "Great Britain": "United Kingdom",
}

# ── Step 1: filter ────────────────────────────────────────────────────────────
input_path  = Path(__file__).parent / "datacenters.csv"
euro_path   = Path(__file__).parent / "european_datacenters.csv"
geo_path    = Path(__file__).parent / "european_datacenters_geocoded.csv"

rows = []
skipped_countries = {}

with open(input_path, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        country_raw = row["country"].strip()
        canonical = EUROPEAN.get(country_raw)
        if canonical:
            row["country"] = canonical
            rows.append(row)
        else:
            skipped_countries[country_raw] = skipped_countries.get(country_raw, 0) + 1

print(f"Kept {len(rows)} European rows")
print(f"Top dropped countries: {sorted(skipped_countries.items(), key=lambda x: -x[1])[:15]}")

with open(euro_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

print(f"Saved → {euro_path}")

# ── Step 2: geocode ───────────────────────────────────────────────────────────
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "ai-datacenter-map-school-project/1.0 (mtwmuller@gmail.com)"}

def geocode(city: str, country: str) -> tuple[float, float] | None:
    query = f"{city}, {country}" if city else country
    params = urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "limit": 1,
        "addressdetails": 0,
    })
    url = f"{NOMINATIM_URL}?{params}"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        print(f"  Error geocoding '{query}': {e}")
    return None

fieldnames = list(rows[0].keys()) + ["lat", "lng"]
geocoded = []
failed = []

print(f"\nGeocoding {len(rows)} rows via Nominatim (1 req/sec) …")
for i, row in enumerate(rows):
    result = geocode(row["city"], row["country"])
    time.sleep(1)  # Nominatim rate limit

    if result:
        lat, lng = result
        geocoded.append({**row, "lat": lat, "lng": lng})
    else:
        failed.append({**row, "lat": "", "lng": ""})
        geocoded.append({**row, "lat": "", "lng": ""})

    if (i + 1) % 50 == 0:
        print(f"  {i+1}/{len(rows)} done, {len(failed)} failed so far")

with open(geo_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(geocoded)

success = len(rows) - len(failed)
print(f"\nDone. {success}/{len(rows)} geocoded successfully.")
print(f"Saved → {geo_path}")
