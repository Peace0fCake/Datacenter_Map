# Data Centre Environmental Map

An interactive web map visualising the environmental impact of data centres across Europe — built as part of a Big Data course project.

Live data sourced from OpenStreetMap, national grid operators, the IEA, JRC, Ember Climate, and operator sustainability reports.

---

## What it does

The application plots every publicly mapped data centre campus in Europe and computes, for each facility, an estimate of its:

- **Electricity consumption** (MWh/yr) and Power Usage Effectiveness (PUE)
- **CO₂ emissions** (tCO₂eq/yr) based on the local grid carbon intensity
- **Water consumption** (m³/yr) and Water Usage Effectiveness (WUE)
- **Baseline Water Stress** score (0–5) from the WRI Aqueduct dataset

---

## Features

### Campus clustering

Individual OSM buildings are grouped into campus-level features by operator name and spatial proximity (≤ 1 km). The map shows one dot per campus at lower zoom levels, then reveals individual building footprints at high zoom (≥ 15). Circle size and colour scale with physical footprint area.

### Area-based power allocation

Each data centre's energy consumption is estimated by allocating a share of the national DC electricity total proportional to its mapped footprint area:

```
DC energy (MWh/yr) = country_total_TWh × 1e6 × dc_footprint_m² / country_total_footprint_m²
```

This grounds estimates in published national statistics (JRC 2023, EirGrid 2023, NESO/DESNZ 2023, Energimyndigheten 2023, Fingrid 2023) for 31 European countries.

### Operator calibration

Where an operator has published a PUE or WUE figure in a sustainability report, those reported values override the temperature-based model estimate. Calibrated operators include:

| Operator | PUE | Source |
|---|---|---|
| Equinix | 1.45 | Equinix 2023 Global Sustainability Report |
| Digital Realty | 1.47 | Digital Realty 2022 Sustainability Report |
| NTT | 1.30 | NTT 2023 Sustainability Data |
| OVHcloud | 1.40 | OVH Group DPEF 2023 (fleet average) |
| Hetzner | 1.20 | Hetzner Environmental Report 2023 |
| Microsoft | 1.12 | Microsoft FY2023 Sustainability Report |
| Google | 1.10 | Google 2023 Environmental Report |
| Amazon Web Services | 1.15 | AWS 2022 Sustainability Report |

### Country overview panel

Clicking a country shows a summary of its data centre sector:
- Campus and building counts from OSM
- Total mapped footprint and estimated capacity
- National DC electricity consumption with clickable source links
- Grid carbon intensity from Ember Climate 2024 (covering 2023 data)
- Operator ranking sortable by estimated power (MW) or campus count
- Capacity pipeline: operational, under construction, and planned MW

### Operator panel

Clicking any operator in the country ranking opens a dedicated operator panel showing:
- Global stats: total campuses, buildings, estimated capacity (GW for large operators), and footprint
- Per-country sections sorted by capacity, each listing all campuses with fly-to links
- Coverage note for hyperscalers (OSM systematically under-represents hyperscale campuses)

### Educational explainer

The "Capacity Outlook" button opens a sourced explainer covering:
1. **The energy explosion** — historical growth and four projection scenarios to 2030 (IEA, Goldman Sachs, Rystad Energy)
2. **Grid saturation** — Ireland (21% of national grid), Netherlands moratorium, Spain's emerging bottleneck, Nordic advantages
3. **Hidden water consumption** — WUE explained, cooling technology tradeoffs, water stress conflict, waste heat recovery
4. **Why the numbers are uncertain** — source comparison across six major institutions
5. **Infrastructure pipeline** — announced, under-construction, and operational capacity by country
6. **Policy responses** — EU Energy Efficiency Directive, 24/7 clean energy, grid co-investment

### Simulation mode

Place a hypothetical data centre anywhere on the map and configure its IT capacity (1–500 MW). All environmental metrics update in real time without additional API calls.

### Map overlays

Two optional layers overlay national data:
- Grid carbon intensity (gCO₂/kWh) — Ember Climate 2024 (2023 data)
- Baseline water stress — WRI Aqueduct 3.0

### Resizable panels

Both the sidebar and the details panel are drag-resizable by their edges.

---

## Data pipeline

```
datasets/osm/fetch_osm_datacenters.py   — queries Overpass API, 24 tag combinations,
                                          48 European countries, resumable per country
datasets/osm/cluster_campuses.py        — groups buildings into campuses via union-find,
                                          outputs osm_campuses.geojson + country_dc_stats.json
```

After fetching/clustering, run the operator inference pass to attribute campuses whose `operator` OSM tag is null but whose `name` field identifies the operator:

```bash
cd datasets/osm
python3 fetch_osm_datacenters.py     # ~5 min, resumes from raw/ cache
python3 cluster_campuses.py          # ~1 s
python3 infer_operators.py           # regex inference for named-but-untagged campuses
python3 build_operators_json.py      # regenerates public/data/operators.json
```

---

## Data sources

| Data | Source | Year | Notes |
|---|---|---|---|
| Data centre locations & geometry | OpenStreetMap via Overpass API | Live | ODbL |
| Grid carbon intensity & electricity mix | Ember Global Electricity Review | 2024 (2023 data) | CC BY 4.0 |
| National DC electricity — IE | EirGrid Annual Report | 2023 | High confidence |
| National DC electricity — GB | NESO / DESNZ (DUKES) | 2023 | Medium confidence |
| National DC electricity — SE | Energimyndigheten | 2023 | Medium confidence |
| National DC electricity — FI | Fingrid | 2023 | Medium confidence |
| National DC electricity — DE/FR/NL | JRC Report JRC135926 | 2023 | Medium confidence |
| National DC electricity — others | Derived (% of national grid) | 2022–2023 | Low confidence |
| Capacity projections | IEA Electricity 2024, Goldman Sachs, Rystad Energy | 2024 | Scenarios |
| Infrastructure pipeline | CBRE H1 2024, Data Center Dynamics | 2024 | Estimates |
| Annual average temperature | Open-Meteo (10-yr archive) | – | CC BY 4.0 |
| Water stress score (per DC) | WRI Aqueduct 4.0 REST API | – | CC BY 4.0 |
| Country water stress (map layer) | WRI Aqueduct 3.0 | – | CC BY 4.0 |
| Country boundaries | Natural Earth 110m | – | Public domain |
| Operator PUE / WUE | Operator CSR / sustainability reports | 2022–2023 | Cited per operator |

---

## Environmental model

All metrics are **estimates** — no verified capacity data is publicly available for most facilities.

**With footprint data (area-allocated — used for all OSM-mapped campuses):**
```
DC energy     = country_TWh × dc_footprint / country_total_footprint
IT energy     = DC energy / PUE
CO₂           = DC energy × grid carbon intensity (gCO₂/kWh)
Water         = Cooling energy × WUE   [cooling energy = total − IT energy]
```

**Without footprint data (capacity model fallback):**
```
IT energy     = capacityMW × utilizationRate × 8 760 h
Total energy  = IT energy × PUE
```

**PUE** is estimated from annual average temperature (`1.35 + 0.01 × T°C`, clamped 1.2–2.0), overridden where the operator has published a verified figure.

**WUE** is estimated from temperature (`1.2 + 0.04 × max(0, T − 10)`, clamped ≤ 3.0), overridden where reported.

---

## Tech stack

- **React 19 + Vite** — UI and build tooling
- **MapLibre GL JS 5 + react-map-gl** — WebGL map rendering
- **CartoDB basemaps** — Dark Matter / Positron tile styles (no API key required)
- Static deployment — no backend; all data fetched client-side at runtime

---

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Limitations

- Campus footprint areas are derived from OSM polygon geometry; buildings missing polygon data fall back to the capacity model
- OSM operator tagging is inconsistent — ~385 campuses (out of ~870) remain unattributed even after name-based inference; hyperscale campuses are systematically under-represented
- National DC electricity figures are country-level; sub-national variation is not captured
- WRI Aqueduct serves point scores only — a true basin-level water stress layer would require pre-processing their full GeoPackage
- OSM coverage is uneven: Western Europe is well-mapped, Eastern Europe and Turkey less so
- The model assumes a single utilization rate per size tier and does not account for renewable energy procurement (PPAs, RECs)
- All capacity and consumption figures are estimates; treat them as order-of-magnitude indicators, not precise measurements
