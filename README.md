# AI Data Center Environmental Footprint Map

An interactive web map visualising the environmental impact of data centers across Europe — built as part of a Big Data course project.

## What it does

The application plots every publicly mapped data center in Europe (sourced live from OpenStreetMap) and computes, for each facility, an estimate of its:

- **Electricity consumption** (MWh/yr) and Power Usage Effectiveness (PUE)
- **CO₂ emissions** (tCO₂eq/yr) based on the local grid carbon intensity
- **Water consumption** (m³/yr) and Water Usage Effectiveness (WUE)
- **Baseline Water Stress** score (0–5) from the WRI Aqueduct dataset

A **Simulation mode** lets you place a hypothetical data center anywhere on the map and configure its IT capacity (1–500 MW) with a logarithmic slider, updating all environmental metrics in real time without any additional API calls.

Two optional **map layers** overlay national data:
- Grid carbon intensity (gCO₂/kWh) — Ember Climate 2023
- Baseline water stress — WRI Aqueduct 3.0

## Data sources

| Data | Source | Licence |
|---|---|---|
| Data center locations | OpenStreetMap via Overpass API | ODbL |
| Annual average temperature | Open-Meteo (10-yr archive) | CC BY 4.0 |
| Grid carbon intensity & electricity mix | Ember Climate 2023 | CC BY 4.0 |
| Water stress score (per DC) | WRI Aqueduct 4.0 REST API | CC BY 4.0 |
| Country water stress (map layer) | WRI Aqueduct 3.0 country rankings | CC BY 4.0 |
| Country reverse geocoding | Nominatim / OpenStreetMap | ODbL |
| Country boundaries (map overlay) | Natural Earth 110m | Public domain |
| Reported PUE / WUE values | Operator CSR/sustainability reports | Cited per operator |

## Environmental model

All metrics are **estimates** derived from a physical model — no verified capacity data is publicly available for most facilities.

```
IT energy     = capacityMW × utilizationRate × 8 760 h
Total energy  = IT energy × PUE
CO₂           = Total energy × grid carbon intensity
Water         = Cooling energy × WUE
```

**PUE** is estimated from annual average temperature (`1.35 + 0.01 × T°C`, clamped 1.2–2.0), or overridden with reported values from operator CSR reports (Equinix, Data4, Interxion, Digital Realty, etc.).

**Country code** is resolved in three tiers: OSM `addr:country` tag → Nominatim reverse geocoding → bounding-box fallback.

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

- Capacity figures are estimated from operator name heuristics and are not verified; the panel explicitly flags this and points users to Simulation mode
- WRI Aqueduct serves point scores only — a true basin-level water stress layer would require pre-processing their full GeoPackage dataset
- OSM coverage is uneven: Western Europe is well-mapped, Eastern Europe less so
- The model assumes a single utilization rate per size tier and does not account for renewable energy procurement (PPAs, RECs)
