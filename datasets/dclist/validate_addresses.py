"""
validate_addresses.py

Runs rule-based checks on european_datacenters.csv and writes every detected
issue to address_errors.csv.  A single row can appear multiple times (once per
error type).  No geocoding — pure text analysis.

Checks
------
1. empty_address        address field is blank
2. empty_city           city field is blank (and address is also blank — no location at all)
3. placeholder          address is a stub like "tbc", "N/A", "unknown", …
4. phone_in_address     a phone number is embedded in the address string
5. special_chars        non-printable / mojibake characters (\xa0, \x92, …)
6. country_mismatch     the country name at the END of the address string disagrees
                        with the country column (avoids street-name false-positives
                        like "Poland Street" or "Via Romania")
7. city_is_country      the city column contains a country name instead of a city
8. address_is_only_location  address has no street info — just zip + city + country
9. duplicate_dc         same name + company appears more than once (possible duplicate)
"""

import csv
import re
from collections import defaultdict
from pathlib import Path

INPUT_CSV  = Path(__file__).parent / "european_datacenters.csv"
OUTPUT_CSV = Path(__file__).parent / "address_errors.csv"

# ── Country name lookup ───────────────────────────────────────────────────────
COUNTRY_NAMES = {
    # maps lowercase variant → canonical name used in country column
    "united kingdom": "United Kingdom", "uk": "United Kingdom", "great britain": "United Kingdom",
    "germany": "Germany", "deutschland": "Germany", "france": "France",
    "spain": "Spain", "españa": "Spain", "netherlands": "Netherlands",
    "nederland": "Netherlands", "italy": "Italy", "italia": "Italy",
    "switzerland": "Switzerland", "svizzera": "Switzerland", "schweiz": "Switzerland",
    "sweden": "Sweden", "sverige": "Sweden", "poland": "Poland", "polska": "Poland",
    "ireland": "Ireland", "belgium": "Belgium", "belgië": "Belgium",
    "austria": "Austria", "denmark": "Denmark", "danmark": "Denmark",
    "norway": "Norway", "norge": "Norway", "finland": "Finland", "suomi": "Finland",
    "portugal": "Portugal", "romania": "Romania", "românia": "Romania",
    "russia": "Russia", "russian federation": "Russia", "turkey": "Turkey",
    "türkiye": "Turkey", "ukraine": "Ukraine", "bulgaria": "Bulgaria",
    "greece": "Greece", "hungary": "Hungary", "czech republic": "Czechia",
    "czechia": "Czechia", "slovakia": "Slovakia", "croatia": "Croatia",
    "lithuania": "Lithuania", "latvia": "Latvia", "estonia": "Estonia",
    "luxembourg": "Luxembourg", "cyprus": "Cyprus", "iceland": "Iceland",
    "albania": "Albania", "armenia": "Armenia", "azerbaijan": "Azerbaijan",
    "belarus": "Belarus", "bosnia and herzegovina": "Bosnia and Herzegovina",
    "georgia": "Georgia", "gibraltar": "Gibraltar", "guernsey": "Guernsey",
    "isle of man": "Isle of Man", "jersey": "Jersey", "kosovo": "Kosovo",
    "liechtenstein": "Liechtenstein", "moldova": "Moldova", "monaco": "Monaco",
    "montenegro": "Montenegro", "north macedonia": "North Macedonia",
    "macedonia": "North Macedonia", "serbia": "Serbia", "slovenia": "Slovenia",
    "slovakia": "Slovakia",
}
# Sorted longest-first so multi-word names match before single words
_SORTED_COUNTRIES = sorted(COUNTRY_NAMES.keys(), key=len, reverse=True)

def country_at_end(address: str) -> str | None:
    """Return the canonical country name if one appears at the tail of the address."""
    tail = address.strip().lower()
    # Strip trailing punctuation / whitespace
    tail = re.sub(r'[\s,;.]+$', '', tail)
    for name in _SORTED_COUNTRIES:
        if tail.endswith(name):
            # Make sure it's a word boundary (not "poland street" ending in "and")
            before = tail[: len(tail) - len(name)]
            if not before or re.search(r'[\s,;]$', before):
                return COUNTRY_NAMES[name]
    return None

# ── Patterns ─────────────────────────────────────────────────────────────────
PHONE_RE       = re.compile(r'(\+\d[\d\s\-\(\)/\.]{7,}|[\(\d]{1}\d{2}[\)\s\-]\d{3}[\s\-]\d{3,})')
PLACEHOLDER_RE = re.compile(r'^\s*(tbc|t\.b\.c|n/?a|unknown|none|test|todo|–+|-+|\.+|address unknown|to be confirmed)\s*', re.I)
SPECIAL_RE     = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x80-\x9f\xa0\x92\x93\x94]')
# Address that is just postal-code + city + country with no street
ONLY_LOCATION_RE = re.compile(r'^\s*[\d\-]+\s+[A-Za-zÀ-ÿ\s\-]+$')

# ── Load rows ─────────────────────────────────────────────────────────────────
rows = list(csv.DictReader(open(INPUT_CSV, encoding="utf-8")))
print(f"Loaded {len(rows)} rows")

# ── Duplicate detection ───────────────────────────────────────────────────────
seen: dict[str, list[int]] = defaultdict(list)
for i, r in enumerate(rows):
    key = (r["name"].strip().lower(), r["company"].strip().lower())
    seen[key].append(i)
duplicate_indices = {i for indices in seen.values() if len(indices) > 1 for i in indices}

# ── Run checks ────────────────────────────────────────────────────────────────
errors = []

def add_error(row, error_type, detail):
    errors.append({**row, "error_type": error_type, "error_detail": detail})

for i, r in enumerate(rows):
    addr    = r["address"].strip()
    city    = r["city"].strip()
    country = r["country"].strip()

    # 1. Empty address
    if not addr:
        add_error(r, "empty_address", "address field is blank")
        if not city:
            # Also flag no city — no location at all
            add_error(r, "empty_city", "both address and city are blank — no location data")
        continue  # remaining checks need an address

    # 2. Placeholder
    if PLACEHOLDER_RE.match(addr):
        add_error(r, "placeholder", f"address looks like a stub: {repr(addr[:40])}")

    # 3. Phone number
    phone_match = PHONE_RE.search(addr)
    if phone_match:
        add_error(r, "phone_in_address", f"phone number found: {repr(phone_match.group().strip())}")

    # 4. Special / non-printable characters
    special = SPECIAL_RE.findall(addr)
    if special:
        chars = ", ".join(f"U+{ord(c):04X}" for c in set(special))
        add_error(r, "special_chars", f"non-printable chars in address: {chars}")

    # 5. Country mismatch — only check the country at the END of the address
    addr_country = country_at_end(addr)
    if addr_country and addr_country != country:
        # Filter out known false positives (street names that end in a country word)
        # by requiring the address to have ≥ 2 commas or be fairly long
        if addr.count(",") >= 1 or len(addr) > 20:
            add_error(r, "country_mismatch",
                      f"address ends with '{addr_country}' but country column is '{country}'")

    # 6. City is a country name
    # Exceptions: city-states where capital = country name (Luxembourg, Monaco)
    CITY_EQUALS_COUNTRY_OK = {"luxembourg", "monaco"}
    if city.lower() in COUNTRY_NAMES and city.lower() not in CITY_EQUALS_COUNTRY_OK:
        add_error(r, "city_is_country",
                  f"city field contains country name: {repr(city)}")

    # 7. Address has no street — just a location (zip + city/country, no street name)
    addr_clean = re.sub(r'\b\d{3,6}\b', '', addr)   # remove postal codes
    # Remove known country/city names to see if anything structural remains
    addr_clean = re.sub(r'\b(' + '|'.join(re.escape(c) for c in [country, city] if c) + r')\b',
                        '', addr_clean, flags=re.IGNORECASE)
    addr_clean = re.sub(r'[\s,;]+', ' ', addr_clean).strip()
    if len(addr_clean) < 5 and len(addr) > 0:
        add_error(r, "address_no_street",
                  f"address appears to contain only zip/city/country: {repr(addr[:60])}")

    # 8. Duplicate (same name + company)
    if i in duplicate_indices:
        add_error(r, "duplicate_dc",
                  f"name+company appears {len(seen[(r['name'].strip().lower(), r['company'].strip().lower())])}× in dataset")

# ── Write output ──────────────────────────────────────────────────────────────
fieldnames = list(rows[0].keys()) + ["error_type", "error_detail"]
with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(errors)

print(f"\nFound {len(errors)} issues across {len({e['name']+e['company'] for e in errors})} unique DCs")
print(f"Saved → {OUTPUT_CSV.name}")

# Summary by type
counts: dict[str, int] = {}
for e in errors:
    counts[e["error_type"]] = counts.get(e["error_type"], 0) + 1
print("\nBreakdown by error type:")
for k, v in sorted(counts.items(), key=lambda x: -x[1]):
    print(f"  {v:4d}  {k}")
