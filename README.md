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

Per-campus metrics are **pre-computed once at build time** (`npm run precompute`) into `public/data/campus_metrics.json`, so opening a campus is instant — no per-click recomputation.

---

## Features

### Campus clustering

Individual OSM buildings are grouped into campus-level features by operator name and spatial proximity. The map shows one dot per campus at lower zoom levels, then reveals individual building footprints at high zoom (≥ 13). Circle size and colour scale with physical footprint area.

### Area-based power allocation

Each data centre's energy consumption is estimated by allocating a share of the national DC electricity total proportional to its mapped footprint area:

```
DC energy (MWh/yr) = country_total_TWh × 1e6 × dc_footprint_m² / country_total_footprint_m²
```

This grounds estimates in published national statistics (JRC 2023, EirGrid, NESO/DESNZ, Energimyndigheten, Fingrid, IEA 2025) for 30+ European countries. A capacity-based model is used as a fallback only when footprint allocation is unavailable. (OSM "capacity" is itself footprint-derived at ~300 W/m², so it is treated as an estimate, not a measurement.)

### Operator calibration

Where an operator has published a PUE or WUE figure in a sustainability report, those reported values override the model estimate. Calibrated operators include:

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

### Community data suggestions

Each campus panel lets users submit corrected figures (PUE, WUE, capacity, facility type, operator type) with a source link. Submissions are stored in `localStorage`, can be up/down-voted, and the highest-rated entry (≥ 2 net votes) overrides the displayed values. When a community figure differs significantly from a reported operator value, a discrepancy banner is shown.

### Country & Europe overview panels

Clicking a country shows a summary of its data centre sector:
- Campus and building counts from OSM, total mapped footprint
- National DC electricity consumption with clickable source links and per-capita draw
- Grid carbon intensity and electricity mix from Ember Climate 2024 (2023 data)
- Largest campuses and operators, merged behind one toggle and sortable by estimated MW or campus count
- **Market outlook** — forward-looking under-construction and planned capacity (CBRE/DCD), framed as distinct from the OSM-mapped present rather than summed with it

The **Europe** button opens a continent-wide rollup: total campuses, TWh, Mt CO₂, weighted grid intensity, and a country ranking with operator-type breakdown.

### Operator panel

Clicking any operator in the country ranking opens a dedicated panel showing global stats, per-country campus listings with fly-to links, and a coverage note for hyperscalers.

### Panel density & settings

A settings dialog (cog icon in the header) lets users choose how tightly the country and Europe panels pack information — **Compact** (single-line rows, merged rankings, top-5 with show-more, condensed stat strip), **Moderate**, or **Comfortable** (spacious rows). The choice is persisted to `localStorage`.

### Inline definitions

Operator-type chips (Hyperscaler, Colo, Carrier, Enterprise…) and key metrics carry on-demand definitions: hover the term to preview, click to pin it open. Longer explanations and sourced figures use an explicit "?" affordance instead. Definitions live in a central glossary so the UI stays uncluttered while help is always one hover away.

### Educational explainer ("Learn More")

A sourced, tabbed explainer covering: what a data centre is, the AI-driven energy boom with projection scenarios, environmental impact (energy, water, CO₂), a glossary, and a full **methodology page** documenting how every figure is derived. Displayed counts (campuses, attribution rate) are read live from the dataset so they never drift.

### Simulation mode

Place a hypothetical data centre anywhere on the map and configure its IT capacity on a logarithmic slider (1 MW to 5 GW). All environmental metrics update in real time without additional API calls.

### Map overlays

Overlays are split into mutually-exclusive **map overlays** (radio) and additive **additional layers** (checkbox), each with an intensity/opacity slider when active:

- **Grid carbon intensity** (gCO₂/kWh) — smooth per-country gradient, Ember 2024 (2023 data)
- **Watershed water stress** — basin-level, WRI Aqueduct 4.0
- **DC power density** — pre-computed, power-weighted, log-scaled heatmap that re-normalises to the visible viewport
- **France electricity** — sub-national IRIS/RTE annual consumption
- **Campus markers** — individual campus dots (on by default)

### Search & resizable panels

An address search bar (Nominatim) flies to any location. Both the sidebar and the details panel are drag-resizable by their edges.

---

## Data pipeline

```
datasets/osm/fetch_osm_datacenters.py   — queries Overpass API, 24 tag combinations,
                                          48 European countries, resumable per country
datasets/osm/cluster_campuses.py        — groups buildings into campuses via union-find,
                                          outputs osm_campuses.geojson + country_dc_stats.json
scripts/precompute_campus_metrics.py    — derives per-campus energy/PUE + the power-weighted
                                          heatmap; outputs campus_metrics.json + dc_heatmap.geojson
```

```bash
cd datasets/osm
python3 fetch_osm_datacenters.py     # ~5 min, resumes from raw/ cache
python3 cluster_campuses.py          # ~1 s
python3 infer_operators.py           # regex inference for named-but-untagged campuses
python3 build_operators_json.py      # regenerates public/data/operators.json

cd ../..
npm run precompute                   # regenerates campus_metrics.json + dc_heatmap.geojson
```

`npm run precompute` is the single source of truth for cached per-campus energy and the heatmap; it is designed to run at build time or on a daily schedule. (Raw source datasets under `datasets/iris_project/` and `datasets/wri_aqueduct/` are large and git-ignored; only their processed outputs in `public/data/` are committed.)

---

## Data sources

| Data | Source | Year | Notes |
|---|---|---|---|
| Data centre locations & geometry | OpenStreetMap via Overpass API | Live | ODbL |
| Grid carbon intensity & electricity mix | Ember Global Electricity Review | 2024 (2023 data) | CC BY 4.0 |
| National DC electricity — IE | EirGrid Annual Report | 2025 | High confidence |
| National DC electricity — GB | NESO / DESNZ (DUKES) | 2024 | Medium confidence |
| National DC electricity — DE/FR/NL | IEA 2025 + JRC / national operators | 2024–2025 | Medium–high |
| National DC electricity — others | Derived (% of national grid × IEA/Eurostat) | 2024–2025 | Low confidence |
| Capacity projections & pipeline | IEA, Goldman Sachs, Rystad, CBRE, Data Center Dynamics | 2024 | Scenarios / estimates |
| Annual average temperature | Open-Meteo (10-yr archive) | – | CC BY 4.0 |
| Water stress score (per DC) | WRI Aqueduct 4.0 REST API | – | CC BY 4.0 |
| Water stress (map layer) | WRI Aqueduct 4.0 (EU basins) | – | CC BY 4.0 |
| France sub-national electricity | IRIS / RTE | 2023 | Open data |
| Country boundaries | Natural Earth 10m (Europe subset) | – | Public domain |
| Operator PUE / WUE | Operator CSR / sustainability reports | 2022–2023 | Cited per operator |

---

## Environmental model

All metrics are **estimates** — no verified capacity data is publicly available for most facilities. `src/lib/model.js` (`computeMetrics`) is the single source for all downstream formulas.

**Primary path (area-allocated — used for all OSM-mapped campuses with footprint):**
```
DC energy     = country_TWh × dc_footprint / country_total_footprint
IT energy     = DC energy / PUE
CO₂           = DC energy × grid carbon intensity (gCO₂/kWh)
Water         = Cooling energy × WUE   [cooling energy = total − IT energy]
```

**Fallback path (capacity model, when footprint allocation is unavailable):**
```
IT energy     = capacityMW × utilizationRate × 8 760 h
Total energy  = IT energy × PUE
```

**PUE** — base estimate from annual average temperature, then adjusted for operator type and campus size, overridden where the operator publishes a verified figure:
```
PUE = 1.40 + 0.012 × T°C, clamped [1.05, 2.2]
  + operator-type delta (hyperscaler −0.22 … enterprise +0.30)
  + size delta (−0.05 per decade of log footprint above 10,000 m²)
```

**WUE** — same structure:
```
WUE = 1.2 + 0.04 × max(0, T − 10), clamped [0.1, 3.5]
  + operator-type delta (hyperscaler −0.45 … enterprise +0.55)
  + size delta (−0.08 per decade of log footprint above 10,000 m²)
```

---

## Tech stack

- **React 19 + Vite** — UI and build tooling
- **MapLibre GL JS 5 + react-map-gl** — WebGL map rendering
- **CartoDB basemaps** — Dark Matter / Positron tile styles (no API key required)
- **Python (numpy + scipy)** — offline pre-computation of campus metrics and the heatmap
- Static deployment — no backend; all data fetched client-side at runtime

---

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

To regenerate the pre-computed data (requires Python with `numpy` and `scipy`):

```bash
npm run precompute
```

---

## Limitations

- Campus footprint areas are derived from OSM polygon geometry; buildings missing polygon data fall back to the capacity model
- OSM operator tagging is inconsistent — roughly 385 of 1,219 campuses (~32%) remain unattributed even after name-based inference; hyperscale campuses are systematically under-represented
- National DC electricity figures are country-level; sub-national variation is captured only for France (IRIS)
- The DC power-density heatmap weights mapped campuses only and does not reconcile with national top-down totals
- OSM coverage is uneven: Western Europe is well-mapped, Eastern Europe and Turkey less so
- The model assumes a single utilization rate per size tier and does not account for renewable energy procurement (PPAs, RECs)
- All capacity and consumption figures are estimates; treat them as order-of-magnitude indicators, not precise measurements
