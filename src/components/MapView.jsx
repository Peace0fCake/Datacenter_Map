import { useRef, useCallback, useMemo, useEffect } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import { waterStressLabel } from '../lib/model';
import carbonData from '../data/carbonIntensity.json';
import waterStressData from '../data/waterStress.json';
import { SearchBar } from './SearchBar';
import 'maplibre-gl/dist/maplibre-gl.css';

const STYLES = {
  dark:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

const COUNTRIES_GEOJSON = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

const COUNTRY_CENTERS = {
  AT: [14.12, 47.60], BE: [4.47, 50.50], BG: [25.48, 42.73], CH: [8.23, 46.82],
  CY: [33.43, 35.13], CZ: [15.47, 49.82], DE: [10.45, 51.17], DK: [9.50, 56.26],
  EE: [25.01, 58.60], ES: [-3.75, 40.22], FI: [26.00, 64.00], FR: [2.21, 46.23],
  GB: [-1.56, 52.36], GR: [21.82, 39.07], HR: [15.20, 45.10], HU: [19.50, 47.16],
  IE: [-8.24, 53.41], IS: [-19.02, 64.96], IT: [12.57, 41.87], LI: [9.56, 47.17],
  LT: [23.88, 55.17], LU: [6.13, 49.82], LV: [24.60, 56.88], MT: [14.44, 35.90],
  NL: [5.29, 52.13], NO: [8.47, 60.47], PL: [19.15, 51.92], PT: [-8.22, 39.40],
  RO: [24.97, 45.94], SE: [18.64, 60.13], SI: [14.99, 46.15], SK: [19.70, 48.67],
};

function intensityToColor(gco2) {
  if (gco2 < 80)  return '#166534';
  if (gco2 < 150) return '#15803d';
  if (gco2 < 250) return '#a16207';
  if (gco2 < 400) return '#c2410c';
  return '#991b1b';
}

const INTENSITY_COLOR_EXPR = [
  'match',
  ['get', 'ISO_A2_EH'],
  ...Object.entries(carbonData).flatMap(([code, d]) => [code, intensityToColor(d.intensity_gco2_kwh)]),
  'rgba(0,0,0,0)',
];

function waterStressToColor(bws) {
  if (bws < 1) return '#22c55e';
  if (bws < 2) return '#84cc16';
  if (bws < 3) return '#eab308';
  if (bws < 4) return '#f97316';
  return '#ef4444';
}

const WATER_STRESS_COLOR_EXPR = [
  'match',
  ['get', 'ISO_A2_EH'],
  ...Object.entries(waterStressData)
    .filter(([k]) => k !== '_source')
    .flatMap(([code, bws]) => [code, waterStressToColor(bws)]),
  'rgba(0,0,0,0)',
];

function dcColor(dc) {
  if (dc.source === 'simulation') return '#a855f7';
  if (dc.waterStress !== undefined) return waterStressLabel(dc.waterStress?.score).color;
  return '#6366f1';
}

function toDCGeoJSON(dataCenters, selectedId) {
  return {
    type: 'FeatureCollection',
    features: dataCenters.map(dc => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [dc.lng, dc.lat] },
      properties: {
        id: dc.id,
        name: dc.name,
        color: dcColor(dc),
        selected: dc.id === selectedId ? 1 : 0,
        simulation: dc.source === 'simulation' ? 1 : 0,
      },
    })),
  };
}

function toCountryGeoJSON(countryGroups) {
  return {
    type: 'FeatureCollection',
    features: countryGroups.map(g => {
      const center = COUNTRY_CENTERS[g.countryCode];
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: center ?? [g.lng, g.lat] },
        properties: {
          countryCode: g.countryCode,
          countryName: carbonData[g.countryCode]?.name ?? g.countryCode,
          dcCount: g.dcCount,
        },
      };
    }),
  };
}

// ── Campus visual scales ───────────────────────────────────────────────────────

function areaColorExpr(field) {
  return [
    'interpolate', ['linear'],
    ['coalesce', ['get', field], 0],
    0,       '#64748b',
    500,     '#6366f1',
    5000,    '#0ea5e9',
    25000,   '#eab308',
    100000,  '#f97316',
    400000,  '#ef4444',
  ];
}

const CAMPUS_RADIUS = [
  'interpolate', ['linear'],
  ['coalesce', ['get', 'total_footprint_m2'], 0],
  0,       5,
  1000,    7,
  10000,   10,
  50000,   14,
  200000,  18,
  800000,  22,
];

const IS_POLYGON    = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const IS_POINT_GEOM = ['==', ['geometry-type'], 'Point'];

// ── Campus DC object factory ───────────────────────────────────────────────────

function parseProp(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return raw;
}

function campusToDC(props) {
  const buildingCount = props.building_count || 1;
  return {
    id:              props.id,
    lat:             props.lat,
    lng:             props.lon,
    name:            props.name || 'Data Center',
    operator:        props.operator || null,
    capacityMW:      props.estimated_capacity_mw || null,
    footprintM2:     props.total_footprint_m2 || null,
    buildingCount,
    isSite:          buildingCount > 1,
    memberBuildings: parseProp(props.member_buildings),
    source:          'campus',
    sourceUrl:       props.osm_url || null,
    country:         props.country_iso2 || null,
    tags:            {},
  };
}

// ── Static layer configs ───────────────────────────────────────────────────────

const DC_RING_PAINT = {
  'circle-radius': 14,
  'circle-color': 'rgba(0,0,0,0)',
  'circle-stroke-width': 2.5,
  'circle-stroke-color': '#22c55e',
};
const DC_POINT_PAINT = {
  'circle-color': ['case', ['==', ['get', 'selected'], 1], '#22c55e', ['get', 'color']],
  'circle-radius': ['case', ['==', ['get', 'selected'], 1], 9, 7],
  'circle-stroke-width': 2,
  'circle-stroke-color': '#ffffff',
  'circle-stroke-opacity': 0.9,
};
const DC_SIM_LABEL_LAYOUT = {
  'text-field': '+',
  'text-font': ['Noto Sans Bold', 'Arial Unicode MS Bold'],
  'text-size': 13,
};
const DC_SIM_LABEL_PAINT = { 'text-color': '#ffffff' };

// Country label layout matching Carto dark-matter / positron style:
//   text-transform: uppercase, text-size with zoom stops, same font fallback chain
const COUNTRY_LABEL_LAYOUT = {
  'text-field': ['get', 'countryName'],
  'text-font': ['Noto Sans Bold', 'Arial Unicode MS Bold'],
  'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 4, 12, 5, 13, 6, 14],
  'text-transform': 'uppercase',
  'text-allow-overlap': false,
  'text-anchor': 'center',
  'text-max-width': ['interpolate', ['linear'], ['zoom'], 2, 6, 5, 12],
};
// Colors sampled from the Carto style: muted blue-gray (dark) / cool gray (light)
const COUNTRY_LABEL_PAINT_DARK = {
  'text-color': ['interpolate', ['linear'], ['zoom'], 3, 'rgba(158,182,189,1)', 6, 'rgba(120,141,147,1)'],
  'text-halo-color': '#111111',
  'text-halo-width': 1,
};
const COUNTRY_LABEL_PAINT_LIGHT = {
  'text-color': ['interpolate', ['linear'], ['zoom'], 3, '#8a99a4', 6, '#b9c2c9'],
  'text-halo-color': '#fafaf8',
  'text-halo-width': 1,
};

const IS_SELECTED = ['==', ['get', 'selected'], 1];
const IS_SIM      = ['==', ['get', 'simulation'], 1];

// Zoom at which building outlines appear; campus dot hides above this threshold
const BUILDING_ZOOM = 13;

const COUNTRY_MAX_ZOOM = 7;    // Matches Carto place_country_1 maxzoom
const DC_MIN_ZOOM      = 4;
const CAMPUS_MIN_ZOOM  = 3;

// ── Base map country label suppression ────────────────────────────────────────
// Hides the base map's own country labels for countries we overlay with clickable ones.
// Layer IDs and iso_a2 property come from the OpenMapTiles schema used by Carto.
function applyCountryLabelFilter(map, codes) {
  if (!codes.length) return;
  const exclude = ['!', ['in', ['get', 'iso_a2'], ['literal', codes]]];
  const layers = map.getStyle()?.layers ?? [];
  ['place_country_1', 'place_country_2'].forEach(id => {
    if (!map.getLayer(id)) return;
    const original = layers.find(l => l.id === id)?.filter;
    map.setFilter(id, original ? ['all', original, exclude] : exclude);
  });
}

// Target zoom when flying to a campus based on its footprint
function campusTargetZoom(footprintM2) {
  if (footprintM2 > 500000) return 13;
  if (footprintM2 > 100000) return 14;
  if (footprintM2 >  25000) return 15;
  if (footprintM2 >   5000) return 16;
  return 18;
}

export function MapView({
  dataCenters, countryGroups, selectedDC, onSelectDC, onSelectCountry,
  simulationActive, onMapClick, theme, activeLayer,
}) {
  const mapRef = useRef(null);
  const countryCodesRef = useRef([]);

  const dcGeoJSON = useMemo(
    () => toDCGeoJSON(dataCenters, selectedDC?.id),
    [dataCenters, selectedDC?.id],
  );

  const countryGeoJSON = useMemo(
    () => toCountryGeoJSON(countryGroups),
    [countryGroups],
  );

  // Campus dot is hidden at BUILDING_ZOOM+ when selected, so outlines take over
  const selectedCampusId = selectedDC?.source === 'campus' ? (selectedDC.id ?? '$$none$$') : '$$none$$';

  // Building highlight filter: only show buildings belonging to the selected campus
  const selectedCampusHash = selectedDC?.source === 'campus'
    ? (selectedDC.id?.slice(7) ?? '')
    : '';

  // Keep country codes ref in sync; apply filter whenever list changes
  useEffect(() => {
    const codes = countryGroups.map(g => g.countryCode);
    countryCodesRef.current = codes;
    const map = mapRef.current?.getMap();
    if (map?.isStyleLoaded() && codes.length) applyCountryLabelFilter(map, codes);
  }, [countryGroups]);

  // On map load (and after style reloads from theme change): suppress base map labels
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const apply = () => applyCountryLabelFilter(map, countryCodesRef.current);
    apply();
    map.on('style.load', apply);
  }, []);

  const handleClick = useCallback((e) => {
    const features = e.features ?? [];

    // Campus circle — primary interactive unit at all zoom levels
    const campusFeat = features.find(f => f.layer.id === 'campus-circles');
    if (campusFeat) {
      const dc = campusToDC(campusFeat.properties);
      onSelectDC(dc);
      // Fly to the campus so building outlines become visible
      const footprint = campusFeat.properties.total_footprint_m2 ?? 0;
      const target = campusTargetZoom(footprint);
      const map = mapRef.current?.getMap();
      if (map && (map.getZoom() ?? 0) < target) {
        map.flyTo({
          center: [campusFeat.properties.lon, campusFeat.properties.lat],
          zoom: target,
          duration: 800,
        });
      }
      return;
    }

    // Simulation DC point
    const pointFeat = features.find(f => f.layer.id === 'dc-points');
    if (pointFeat) {
      const dc = dataCenters.find(d => d.id === pointFeat.properties.id);
      if (dc) { onSelectDC(dc); return; }
    }

    const countryFeat = features.find(f => f.layer.id === 'country-labels');
    if (countryFeat) {
      onSelectCountry(countryFeat.properties.countryCode);
      return;
    }

    if (simulationActive) {
      onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    }
  }, [dataCenters, onSelectDC, onSelectCountry, simulationActive, onMapClick]);

  const onMouseEnter = useCallback(() => {
    const canvas = mapRef.current?.getMap()?.getCanvas();
    if (canvas) canvas.style.cursor = 'pointer';
  }, []);

  const onMouseLeave = useCallback(() => {
    const canvas = mapRef.current?.getMap()?.getCanvas();
    if (canvas) canvas.style.cursor = simulationActive ? 'crosshair' : '';
  }, [simulationActive]);

  const countryLabelPaint = theme === 'light' ? COUNTRY_LABEL_PAINT_LIGHT : COUNTRY_LABEL_PAINT_DARK;
  const borderColor = theme === 'light' ? '#94a3b8' : '#475569';

  return (
    <div className={`map-container ${simulationActive ? 'sim-cursor' : ''}`}>
      <SearchBar mapRef={mapRef} />
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 10, latitude: 52, zoom: 4 }}
        mapStyle={STYLES[theme] ?? STYLES.dark}
        onClick={handleClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onLoad={handleMapLoad}
        interactiveLayerIds={['campus-circles', 'dc-points', 'country-labels']}
        attributionControl={true}
      >
        {/* Country overlay — carbon intensity or water stress */}
        <Source id="countries" type="geojson" data={COUNTRIES_GEOJSON}>
          <Layer id="country-carbon-fill" type="fill" paint={{
            'fill-color': INTENSITY_COLOR_EXPR,
            'fill-opacity': activeLayer === 'carbon' ? 0.55 : 0,
          }} />
          <Layer id="country-water-fill" type="fill" paint={{
            'fill-color': WATER_STRESS_COLOR_EXPR,
            'fill-opacity': activeLayer === 'water' ? 0.6 : 0,
          }} />
          <Layer id="country-border" type="line" paint={{
            'line-color': borderColor,
            'line-width': 0.5,
            'line-opacity': activeLayer !== 'none' ? 1 : 0,
          }} />
        </Source>

        {/* Clickable country name labels — styled to match Carto base map, maxzoom matches base */}
        <Source id="country-source" type="geojson" data={countryGeoJSON}>
          <Layer
            id="country-labels"
            type="symbol"
            maxzoom={COUNTRY_MAX_ZOOM}
            layout={COUNTRY_LABEL_LAYOUT}
            paint={countryLabelPaint}
          />
        </Source>

        {/* Campus-level dots — one per campus, all zoom levels, sized/coloured by footprint.
            The selected campus dot hides at zoom ≥ BUILDING_ZOOM so outlines take over. */}
        <Source id="campus-source" type="geojson" data="/data/osm_campuses.geojson">
          {/* Selection ring — only shown at low zoom before building outlines appear */}
          <Layer
            id="campus-selected-ring"
            type="circle"
            minzoom={CAMPUS_MIN_ZOOM}
            maxzoom={BUILDING_ZOOM}
            filter={['==', ['get', 'id'], selectedCampusId]}
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'total_footprint_m2'], 0],
                0, 9, 1000, 11, 10000, 14, 50000, 18, 200000, 22, 800000, 26],
              'circle-color':        'rgba(0,0,0,0)',
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#22c55e',
            }}
          />
          <Layer
            id="campus-circles"
            type="circle"
            minzoom={CAMPUS_MIN_ZOOM}
            // At zoom ≥ BUILDING_ZOOM, hide the selected campus's dot
            filter={[
              'any',
              ['!=', ['get', 'id'], selectedCampusId],
              ['<', ['zoom'], BUILDING_ZOOM],
            ]}
            paint={{
              'circle-color':        areaColorExpr('total_footprint_m2'),
              'circle-radius':       CAMPUS_RADIUS,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': 'rgba(255,255,255,0.55)',
              'circle-opacity':      0.88,
            }}
          />
        </Source>

        {/* Building footprints — non-interactive; shown only for the selected campus */}
        <Source id="buildings-source" type="geojson" data="/data/osm_datacenters.geojson">
          <Layer
            id="building-selected-fills"
            type="fill"
            minzoom={BUILDING_ZOOM}
            filter={['==', ['get', 'campus_id'], selectedCampusHash]}
            paint={{
              'fill-color':   areaColorExpr('footprint_m2'),
              'fill-opacity': 0.55,
            }}
          />
          <Layer
            id="building-selected-outlines"
            type="line"
            minzoom={BUILDING_ZOOM}
            filter={['all', IS_POLYGON, ['==', ['get', 'campus_id'], selectedCampusHash]]}
            paint={{
              'line-color':   '#22c55e',
              'line-width':   1.5,
              'line-opacity': 0.85,
            }}
          />
          <Layer
            id="building-selected-nodes"
            type="circle"
            minzoom={BUILDING_ZOOM}
            filter={['all', IS_POINT_GEOM, ['==', ['get', 'campus_id'], selectedCampusHash]]}
            paint={{
              'circle-color':        areaColorExpr('footprint_m2'),
              'circle-radius':       6,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#22c55e',
            }}
          />
        </Source>

        {/* Simulation DC — real campuses are rendered by the campus layer above */}
        <Source id="dc-source" type="geojson" data={dcGeoJSON} cluster={false}>
          <Layer id="dc-ring"      type="circle" minzoom={DC_MIN_ZOOM} filter={IS_SELECTED} paint={DC_RING_PAINT} />
          <Layer id="dc-points"    type="circle" minzoom={DC_MIN_ZOOM} filter={IS_SIM}      paint={DC_POINT_PAINT} />
          <Layer id="dc-sim-label" type="symbol" minzoom={DC_MIN_ZOOM} filter={IS_SIM}      layout={DC_SIM_LABEL_LAYOUT} paint={DC_SIM_LABEL_PAINT} />
        </Source>
      </Map>
    </div>
  );
}
