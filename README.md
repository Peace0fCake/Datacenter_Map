# Data Center Environmental Footprint Map

An interactive web map visualising the environmental impact of data centers across Europe — built as part of a Big Data course project.

## What it does

The application plots every publicly mapped data center in Europe (sourced from OpenStreetMap) and computes, for each facility, an estimate of its:

- **Electricity consumption** (MWh/yr) and Power Usage Effectiveness (PUE)
- **CO₂ emissions** (tCO₂eq/yr) based on the local grid carbon intensity
- **Water consumption** (m³/yr) and Water Usage Effectiveness (WUE)
- **Baseline Water Stress** score (0–5) from the WRI Aqueduct dataset

### Campus clustering

Individual OSM buildings are grouped into campus-level features by operator name and spatial proximity (≤ 1 km). The map shows one dot per campus at lower zoom levels, then reveals individual building footprints at high zoom (15+). Circle size and colour scale with physical footprint area.

### Area-based power allocation

Rather than guessing IT capacity from operator heuristics, each data center's energy consumption is estimated by allocating a share of the national DC electricity total (JRC 2023 / IEA) proportional to its mapped footprint area:

```
DC energy (MWh/yr) = country_total_TWh × 1e6 × dc_footprint_m² / country_total_footprint_m²
```

This gives a data-driven estimate grounded in real national statistics for 31 European countries.

### Country overview panel

Clicking a country shows a summary of its data center sector: campus and building counts from OSM, total mapped footprint, national DC electricity consumption with the source citation, and grid carbon intensity from Ember Climate.

### Simulation mode

Place a hypothetical data center anywhere on the map and configure its IT capacity (1–500 MW) with a logarithmic slider. All environmental metrics update in real time without any additional API calls.

### Map overlays

Two optional layers overlay national data:
- Grid carbon intensity (gCO₂/kWh) — Ember Climate 2023
- Baseline water stress — WRI Aqueduct 3.0

## Data pipeline

```
datasets/osm/fetch_osm_datacenters.py   — queries Overpass API, 24 tag combinations,
                                          48 European countries, resumable per country
datasets/osm/cluster_campuses.py        — groups buildings into campuses via union-find,
                                          outputs osm_campuses.geojson + country_dc_stats.json
```

Run these to refresh the OSM snapshot:

```bash
cd datasets/osm
python3 fetch_osm_datacenters.py   # ~5 min, resumes from raw/ cache
python3 cluster_campuses.py        # ~1 s
```

## Data sources

| Data | Source | Licence |
|---|---|---|
| Data center locations & geometry | OpenStreetMap via Overpass API | ODbL |
| Annual average temperature | Open-Meteo (10-yr archive) | CC BY 4.0 |
| Grid carbon intensity & electricity mix | Ember Climate 2023 | CC BY 4.0 |
| Water stress score (per DC) | WRI Aqueduct 4.0 REST API | CC BY 4.0 |
| Country water stress (map layer) | WRI Aqueduct 3.0 country rankings | CC BY 4.0 |
| National DC electricity consumption | JRC Report JRC135926 (2023) — DE/FR/NL/IE; IEA (2022) — GB | See dcPowerByCountry.json |
| Country reverse geocoding | Nominatim / OpenStreetMap | ODbL |
| Country boundaries (map overlay) | Natural Earth 110m | Public domain |
| Reported PUE / WUE values | Operator CSR/sustainability reports | Cited per operator |

## Environmental model

All metrics are **estimates** — no verified capacity data is publicly available for most facilities.

**With footprint data (area-allocated):**
```
DC energy     = country_TWh × dc_footprint / country_total_footprint
IT energy     = DC energy / PUE
CO₂           = DC energy × grid carbon intensity
Water         = Cooling energy × WUE
```

**Without footprint data (capacity model fallback):**
```
IT energy     = capacityMW × utilizationRate × 8 760 h
Total energy  = IT energy × PUE
```

**PUE** is estimated from annual average temperature (`1.35 + 0.01 × T°C`, clamped 1.2–2.0), or overridden with reported values from operator CSR reports (Equinix, Data4, Interxion, Digital Realty, NTT, etc.).

## Tech stack

- **React 19 + Vite** — UI and build tooling
- **MapLibre GL JS 5 + react-map-gl** — WebGL map rendering
- **CartoDB basemaps** — Dark Matter / Positron tile styles (no API key required)
- Static deployment — no backend, all data fetched client-side at runtime

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Limitations

- Campus footprint areas are derived from OSM polygon geometry; buildings missing polygon data fall back to the capacity model
- National DC electricity figures are country-level; sub-national variation is not captured
- WRI Aqueduct serves point scores only — a true basin-level water stress layer would require pre-processing their full GeoPackage dataset
- OSM coverage is uneven: Western Europe is well-mapped, Eastern Europe less so
- The model assumes a single utilization rate per size tier and does not account for renewable energy procurement (PPAs, RECs)
