import { useRef, useCallback, useMemo, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import MapGL, { Source, Layer } from 'react-map-gl/maplibre';
import { waterStressLabel, inferDCType } from '../lib/model';
import carbonData from '../data/carbonIntensity.json';
import { SearchBar } from './SearchBar';
import 'maplibre-gl/dist/maplibre-gl.css';

const STYLES = {
  dark:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

const COUNTRIES_GEOJSON = '/data/countries_europe_10m.geojson';

const CARBON_COLOR_STOPS = [
  [0,   [22,  101, 52]],
  [80,  [22,  163, 74]],
  [200, [202, 138, 4]],
  [320, [234, 88,  12]],
  [450, [220, 38,  38]],
  [650, [127, 29,  29]],
];

function intensityToColor(gco2) {
  const stops = CARBON_COLOR_STOPS;
  if (gco2 <= stops[0][0]) return rgbHex(stops[0][1]);
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i];
    const [v1, c1] = stops[i + 1];
    if (gco2 <= v1) {
      const t = (gco2 - v0) / (v1 - v0);
      return rgbHex(c0.map((ch, j) => Math.round(ch + (c1[j] - ch) * t)));
    }
  }
  return rgbHex(stops[stops.length - 1][1]);
}
function rgbHex([r, g, b]) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Natural Earth 110m uses ISO_A2_EH for countries with overseas territories
const INTENSITY_COLOR_EXPR = [
  'match',
  ['get', 'ISO_A2_EH'],
  ...Object.entries(carbonData).flatMap(([code, d]) => [code, intensityToColor(d.intensity_gco2_kwh)]),
  'rgba(0,0,0,0)',
];


function dcColor(dc) {
  if (dc.source === 'simulation') return '#ffffff';
  if (dc.waterStress !== undefined) return waterStressLabel(dc.waterStress?.score).color;
  return '#94a3b8';
}

function toDCGeoJSON(dataCenters, selectedId) {
  return {
    type: 'FeatureCollection',
    features: dataCenters.map(dc => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [dc.lng, dc.lat] },
      properties: {
        id: dc.id, name: dc.name, color: dcColor(dc),
        selected:   dc.id === selectedId ? 1 : 0,
        simulation: dc.source === 'simulation' ? 1 : 0,
      },
    })),
  };
}

// ── Campus visual scales ───────────────────────────────────────────────────────

function areaColorExpr(field) {
  return [
    'interpolate', ['linear'],
    ['coalesce', ['get', field], 0],
    0,      '#64748b',
    500,    '#6366f1',
    5000,   '#0ea5e9',
    25000,  '#eab308',
    100000, '#f97316',
    400000, '#ef4444',
  ];
}

const CAMPUS_RADIUS = [
  'case', ['>', ['coalesce', ['get', 'total_footprint_m2'], 0], 0],
  ['interpolate', ['linear'],
    ['get', 'total_footprint_m2'],
    0, 5, 1000, 7, 10000, 10, 50000, 14, 200000, 18, 800000, 22,
  ],
  7,
];

const IS_POLYGON    = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const IS_POINT_GEOM = ['==', ['geometry-type'], 'Point'];
const NOT_CLUSTER   = ['!', ['has', 'point_count']];
const IS_CLUSTER    = ['has', 'point_count'];

// ── Campus DC factory ──────────────────────────────────────────────────────────

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
    dcType:          inferDCType(props.operator),
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

const IS_SELECTED = ['==', ['get', 'selected'], 1];
const IS_SIM      = ['==', ['get', 'simulation'], 1];

// Zoom thresholds
const CLUSTER_MAX_ZOOM = 4;   // Clusters dissolve into individual dots above this
const BUILDING_ZOOM    = 13;  // Building outlines appear; campus dots hide
const COUNTRY_MAX_ZOOM = 7;   // Matches Carto place_country_1
const DC_MIN_ZOOM      = 4;
const CAMPUS_MIN_ZOOM  = 3;

// Target zoom when flying to a campus on click
function campusTargetZoom(footprintM2) {
  if (footprintM2 > 500000) return 13;
  if (footprintM2 > 100000) return 14;
  if (footprintM2 >  25000) return 15;
  if (footprintM2 >   5000) return 16;
  return 17;
}

export const MapView = forwardRef(function MapView({
  dataCenters, countryGroups, selectedDC, onSelectDC, onSelectCountry,
  simulationActive, onMapClick, operatorCampuses, theme, activeLayer,
  showHeatmap, showIris, showDots,
  layerOpacity,
}, ref) {
  const opFilterActive = (operatorCampuses?.length ?? 0) > 0;
  const opFilterGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: (operatorCampuses ?? []).map(c => ({
      type: 'Feature',
      properties: { id: c.id, name: c.name },
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    })),
  }), [operatorCampuses]);
  // Viewport-adaptive KDE max: updated on moveend/zoomend so colours re-normalise
  const [kdeMax, setKdeMax] = useState(1.0);
  const kdeMaxRef = useRef(1.0);
  const mapRef = useRef(null);

  // Transient country outline (shown on country open, cleared on next user move)
  const [outlineCountry, setOutlineCountry] = useState(null);
  const countryBoundsRef = useRef({});
  const clearOutlineRef = useRef(null);

  // Build a bbox per country once, for fit-to-country zooming.
  // Only coordinates within the European metropolitan window count, so countries
  // with overseas territories (FR, UK, NL, ES, PT…) fit to their mainland, not the world.
  useEffect(() => {
    const inEU = (x, y) => x >= -26 && x <= 46 && y >= 34 && y <= 72;
    fetch(COUNTRIES_GEOJSON).then(r => r.json()).then(gj => {
      // Accumulate (union) per country code across all of its features, EU-window only,
      // so overseas territories never widen the box and same-code features can't overwrite it.
      const acc = {};
      for (const f of gj.features || []) {
        const code = f.properties?.ISO_A2_EH;
        if (!code || !f.geometry) continue;
        const a = acc[code] || (acc[code] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
        const scan = (co) => {
          if (typeof co[0] === 'number') {
            if (!inEU(co[0], co[1])) return;
            if (co[0] < a.minX) a.minX = co[0]; if (co[0] > a.maxX) a.maxX = co[0];
            if (co[1] < a.minY) a.minY = co[1]; if (co[1] > a.maxY) a.maxY = co[1];
          } else for (const c of co) scan(c);
        };
        scan(f.geometry.coordinates);
      }
      const bounds = {};
      for (const [code, a] of Object.entries(acc)) {
        if (a.minX < a.maxX) bounds[code] = [[a.minX, a.minY], [a.maxX, a.maxY]];
      }
      countryBoundsRef.current = bounds;
    }).catch(() => {});
  }, []);

  // Width of the on-screen side panel — used to offset zoom targets into the visible area
  const panelOffsetX = () => {
    const el = typeof document !== 'undefined' && document.querySelector('.details-panel-wrapper');
    return el ? el.getBoundingClientRect().width : 0;
  };

  useImperativeHandle(ref, () => ({
    flyTo({ lat, lng, zoom = 15 }) {
      const map = mapRef.current?.getMap();
      // Shift the target into the visible area (right of the side panel)
      map?.flyTo({ center: [lng, lat], zoom, duration: 900, offset: [panelOffsetX() / 2, 0] });
    },
    highlightCountry(code) {
      const map = mapRef.current?.getMap();
      if (!map) return;
      // tear down any previous clear listeners
      clearOutlineRef.current?.();
      setOutlineCountry(code);
      const b = countryBoundsRef.current[code];
      if (b) map.fitBounds(b, {
        padding: { top: 50, right: 50, bottom: 50, left: panelOffsetX() + 30 },
        duration: 900, maxZoom: 7,
      });
      // After the fit settles, clear the outline on the next user-initiated movement
      map.once('moveend', () => {
        const clear = () => {
          setOutlineCountry(null);
          map.off('dragstart', clear); map.off('zoomstart', clear); map.off('rotatestart', clear);
          clearOutlineRef.current = null;
        };
        clearOutlineRef.current = clear;
        map.on('dragstart', clear); map.on('zoomstart', clear); map.on('rotatestart', clear);
      });
    },
  }));

  // Viewport-adaptive KDE normalisation: re-query visible features after pan/zoom
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !showHeatmap) { setKdeMax(1); kdeMaxRef.current = 1; return; }

    const update = () => {
      if (!map.getLayer('dc-kde-fill')) return;
      const features = map.queryRenderedFeatures({ layers: ['dc-kde-fill'] });
      if (!features.length) return;
      const maxD = features.reduce((m, f) => Math.max(m, +(f.properties?.density) || 0), 1);
      if (Math.abs(maxD - kdeMaxRef.current) / (kdeMaxRef.current || 1) > 0.05) {
        kdeMaxRef.current = maxD;
        setKdeMax(maxD);
      }
    };

    // Small delay so the layer is rendered before querying
    const tid = setTimeout(update, 400);
    map.on('moveend', update);
    map.on('zoomend', update);
    return () => {
      clearTimeout(tid);
      map.off('moveend', update);
      map.off('zoomend', update);
    };
  }, [showHeatmap]);

  // Prefetched campus lookup: hash → campus properties, for reliable building→campus resolution
  const campusLookup = useRef(new Map());
  useEffect(() => {
    fetch('/data/osm_campuses.geojson')
      .then(r => r.json())
      .then(geojson => {
        const m = new Map();
        for (const feat of geojson.features) {
          const hash = feat.properties.id?.slice(7); // strip 'campus-' prefix
          if (hash) m.set(hash, feat.properties);
        }
        campusLookup.current = m;
      })
      .catch(() => {});
  }, []);

  // Country hover state — ref avoids re-render storms on every mouse move
  const hoveredCountryRef = useRef(null);
  const [hoveredCountryCode, setHoveredCountryCode] = useState(null);

  const dcGeoJSON = useMemo(
    () => toDCGeoJSON(dataCenters, selectedDC?.id),
    [dataCenters, selectedDC?.id],
  );

  // Country codes we have data for — used to filter the interactive fill
  const ourCountryCodes = useMemo(
    () => countryGroups.map(g => g.countryCode),
    [countryGroups],
  );

  const selectedCampusHash = selectedDC?.source === 'campus'
    ? (selectedDC.id?.slice(7) ?? '')
    : '';

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleClick = useCallback(async (e) => {
    const features = e.features ?? [];

    // Cluster → expand
    const clusterFeat = features.find(f => f.layer.id === 'campus-clusters');
    if (clusterFeat) {
      const map = mapRef.current?.getMap();
      const source = map?.getSource('campus-source');
      if (source) {
        const [lng, lat] = clusterFeat.geometry.coordinates;
        try {
          const zoom = await source.getClusterExpansionZoom(clusterFeat.properties.cluster_id);
          map.easeTo({ center: [lng, lat], zoom: zoom + 0.5 });
        } catch {
          map.easeTo({ center: [lng, lat], zoom: (map.getZoom() ?? 4) + 2 });
        }
      }
      return;
    }

    // Individual campus dot → open panel + always fly to target zoom
    const campusFeat = features.find(f => f.layer.id === 'campus-circles');
    if (campusFeat) {
      const dc = campusToDC(campusFeat.properties);
      onSelectDC(dc);
      const footprint = campusFeat.properties.total_footprint_m2 ?? 0;
      const target    = campusTargetZoom(footprint);
      const map = mapRef.current?.getMap();
      if (map) {
        map.flyTo({
          center: [campusFeat.properties.lon, campusFeat.properties.lat],
          zoom: target, duration: 800, offset: [panelOffsetX() / 2, 0],
        });
      }
      return;
    }

    // Building polygon/node at high zoom → resolve parent campus from pre-fetched lookup
    const buildingFeat = features.find(f =>
      f.layer.id === 'building-fills' || f.layer.id === 'building-nodes'
    );
    if (buildingFeat) {
      const hash = buildingFeat.properties.campus_id;
      const campusProps = campusLookup.current.get(hash);
      if (campusProps) {
        onSelectDC(campusToDC(campusProps));
      }
      return;
    }

    // Simulation DC point
    const pointFeat = features.find(f => f.layer.id === 'dc-points');
    if (pointFeat) {
      const dc = dataCenters.find(d => d.id === pointFeat.properties.id);
      if (dc) { onSelectDC(dc); return; }
    }

    // Country fill (low zoom)
    const countryFeat = features.find(f => f.layer.id === 'country-interactive-fill');
    if (countryFeat) {
      onSelectCountry(countryFeat.properties.ISO_A2_EH);
      return;
    }

    if (simulationActive) {
      onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    }
  }, [dataCenters, onSelectDC, onSelectCountry, simulationActive, onMapClick]);

  const handleMouseMove = useCallback((e) => {
    const features = e.features ?? [];

    // Country hover
    const countryFeat = features.find(f => f.layer.id === 'country-interactive-fill');
    const newCode = countryFeat?.properties?.ISO_A2_EH ?? null;
    if (newCode !== hoveredCountryRef.current) {
      hoveredCountryRef.current = newCode;
      setHoveredCountryCode(newCode);
    }

    // Cursor
    const interactive = INTERACTIVE_LAYER_IDS.some(id =>
      features.find(f => f.layer.id === id)
    );
    const canvas = mapRef.current?.getMap()?.getCanvas();
    if (canvas) canvas.style.cursor = interactive ? 'pointer' : (simulationActive ? 'crosshair' : '');
  }, [simulationActive]);

  const handleMouseLeave = useCallback(() => {
    if (hoveredCountryRef.current !== null) {
      hoveredCountryRef.current = null;
      setHoveredCountryCode(null);
    }
    const canvas = mapRef.current?.getMap()?.getCanvas();
    if (canvas) canvas.style.cursor = simulationActive ? 'crosshair' : '';
  }, [simulationActive]);

  const borderColor    = theme === 'light' ? '#94a3b8' : '#475569';

  return (
    <div className={`map-container ${simulationActive ? 'sim-cursor' : ''}`}>
      <SearchBar mapRef={mapRef} />
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: 10, latitude: 52, zoom: 4 }}
        mapStyle={STYLES[theme] ?? STYLES.dark}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={INTERACTIVE_LAYER_IDS}
        attributionControl={true}
      >
        {/* ── Country overlays + hover interaction ── */}
        <Source id="countries" type="geojson" data={COUNTRIES_GEOJSON}>
          {/* Data overlays */}
          <Layer id="country-carbon-fill" type="fill" paint={{
            'fill-color': INTENSITY_COLOR_EXPR,
            'fill-opacity': activeLayer === 'carbon' ? (layerOpacity?.carbon ?? 0.55) : 0,
          }} />

          {/* Invisible clickable fill for countries we have data on */}
          <Layer
            id="country-interactive-fill"
            type="fill"
            maxzoom={COUNTRY_MAX_ZOOM}
            filter={ourCountryCodes.length
              ? ['in', ['get', 'ISO_A2_EH'], ['literal', ourCountryCodes]]
              : ['==', ['get', 'ISO_A2_EH'], '$$none$$']
            }
            paint={{ 'fill-color': '#ffffff', 'fill-opacity': 0.01 }}
          />

          {/* Hover highlight fill */}
          <Layer
            id="country-hover-fill"
            type="fill"
            maxzoom={COUNTRY_MAX_ZOOM}
            filter={['==', ['get', 'ISO_A2_EH'], hoveredCountryCode ?? '$$none$$']}
            paint={{ 'fill-color': 'rgba(99,102,241,0.14)', 'fill-opacity': 1 }}
          />

          {/* Overlay border */}
          <Layer id="country-border" type="line" paint={{
            'line-color': borderColor,
            'line-width': 0.5,
            'line-opacity': activeLayer !== 'none' ? 1 : 0,
          }} />

          {/* Hover border highlight */}
          <Layer
            id="country-hover-border"
            type="line"
            maxzoom={COUNTRY_MAX_ZOOM}
            filter={['==', ['get', 'ISO_A2_EH'], hoveredCountryCode ?? '$$none$$']}
            paint={{
              'line-color': '#818cf8',
              'line-width': 2,
              'line-opacity': 0.9,
            }}
          />

          {/* Transient outline when a country panel is opened (cleared on user move) */}
          <Layer
            id="country-outline-highlight"
            type="line"
            filter={['==', ['get', 'ISO_A2_EH'], outlineCountry ?? '$$none$$']}
            paint={{
              'line-color': '#a5b4fc',
              'line-width': 2.5,
              'line-opacity': 0.95,
              'line-blur': 0.4,
            }}
          />
        </Source>

        {/* ── Aqueduct watershed water stress (basin-level) ── */}
        <Source id="aqueduct-basins" type="geojson" data="/data/aqueduct_eu_basins.geojson">
          <Layer id="basin-water-fill" type="fill" paint={{
            'fill-color': [
              'interpolate', ['linear'],
              ['coalesce', ['get', 'bws_score'], 0],
              0, '#22c55e',
              1, '#84cc16',
              2, '#eab308',
              3, '#f97316',
              4, '#ef4444',
              5, '#b91c1c',
            ],
            'fill-opacity': activeLayer === 'water' ? (layerOpacity?.water ?? 0.65) : 0,
          }} />
          <Layer id="basin-water-outline" type="line" paint={{
            'line-color': 'rgba(0,0,0,0.12)',
            'line-width': 0.4,
            'line-opacity': activeLayer === 'water' ? (layerOpacity?.water ?? 0.65) : 0,
          }} />
        </Source>

        {/* ── Building footprints (zoom ≥ 13) ── */}
        <Source id="buildings-source" type="geojson" data="/data/osm_datacenters.geojson">
          {/* All buildings — muted fill */}
          <Layer
            id="building-fills"
            type="fill"
            minzoom={BUILDING_ZOOM}
            filter={IS_POLYGON}
            paint={{ 'fill-color': areaColorExpr('footprint_m2'), 'fill-opacity': 0.45 }}
          />
          {/* All outlines — subtle white */}
          <Layer
            id="building-outlines"
            type="line"
            minzoom={BUILDING_ZOOM}
            filter={IS_POLYGON}
            paint={{ 'line-color': 'rgba(255,255,255,0.35)', 'line-width': 1 }}
          />
          {/* Selected campus — brighter fill + green outline on top */}
          <Layer
            id="building-selected-fills"
            type="fill"
            minzoom={BUILDING_ZOOM}
            filter={['==', ['get', 'campus_id'], selectedCampusHash]}
            paint={{ 'fill-color': areaColorExpr('footprint_m2'), 'fill-opacity': 0.65 }}
          />
          <Layer
            id="building-selected-outlines"
            type="line"
            minzoom={BUILDING_ZOOM}
            filter={['all', IS_POLYGON, ['==', ['get', 'campus_id'], selectedCampusHash]]}
            paint={{ 'line-color': '#22c55e', 'line-width': 1.5, 'line-opacity': 0.9 }}
          />
          {/* Point-geometry buildings */}
          <Layer
            id="building-nodes"
            type="circle"
            minzoom={BUILDING_ZOOM}
            filter={IS_POINT_GEOM}
            paint={{
              'circle-color':        areaColorExpr('footprint_m2'),
              'circle-radius':       8,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': 'rgba(255,255,255,0.7)',
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

        {/* ── France IRIS electricity layer (test overlay) ── */}
        <Source id="iris-source" type="geojson" data="/data/iris_france.geojson">
          <Layer
            id="iris-fill"
            type="fill"
            paint={{
              'fill-color': [
                'interpolate', ['linear'],
                ['coalesce', ['get', 'consommation_electricite_rte'], 0],
                0,        '#fef9c3',
                3000,     '#fde047',
                11000,    '#fb923c',
                55000,    '#dc2626',
                200000,   '#7f1d1d',
                1000000,  '#450a0a',
              ],
              'fill-opacity': showIris ? (layerOpacity?.iris ?? 0.75) : 0,
            }}
          />
          <Layer
            id="iris-outline"
            type="line"
            paint={{
              'line-color': 'rgba(0,0,0,0.08)',
              'line-width': 0.3,
              'line-opacity': showIris ? Math.min(1, (layerOpacity?.iris ?? 0.75) * 1.2) : 0,
            }}
          />
        </Source>

        {/* ── DC density KDE — geographically fixed Gaussian, viewport-normalised ── */}
        <Source id="dc-kde-source" type="geojson" data="/data/dc_heatmap.geojson">
          <Layer
            id="dc-kde-fill"
            type="fill"
            maxzoom={10}
            paint={{
              // Log scale: ln(density+1) so a 1 MW DC beside a 500 MW cluster still shows colour.
              'fill-color': (() => {
                const logMax = Math.log(Math.max(kdeMax, 2) + 1);
                return [
                  'interpolate', ['linear'],
                  ['ln', ['+', ['max', ['get', 'density'], 0], 1]],
                  0,              'rgba(0,0,0,0)',
                  logMax * 0.04,  'rgba(99,102,241,0.3)',
                  logMax * 0.15,  'rgba(99,102,241,0.7)',
                  logMax * 0.32,  '#4f46e5',
                  logMax * 0.52,  '#818cf8',
                  logMax * 0.72,  '#f97316',
                  logMax * 0.88,  '#ef4444',
                  logMax,         '#b91c1c',
                ];
              })(),
              'fill-opacity':    showHeatmap ? (layerOpacity?.heatmap ?? 0.85) : 0,
              'fill-antialias':  true,
            }}
          />
        </Source>

        {/* ── Campus dots + clusters (zoom < 13) ── */}
        <Source
          id="campus-source"
          type="geojson"
          data="/data/osm_campuses.geojson"
          cluster={true}
          clusterRadius={40}
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
        >
          {/* Cluster circles */}
          <Layer
            id="campus-clusters"
            type="circle"
            filter={IS_CLUSTER}
            maxzoom={BUILDING_ZOOM}
            paint={{
              'circle-color': [
                'step', ['get', 'point_count'],
                '#6366f1', 10, '#0ea5e9', 50, '#f97316', 200, '#ef4444',
              ],
              'circle-radius': [
                'step', ['get', 'point_count'],
                10, 10, 13, 50, 16, 200, 20,
              ],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': 'rgba(255,255,255,0.25)',
              'circle-opacity': (showDots && !opFilterActive) ? 0.85 : 0,
              'circle-stroke-opacity': (showDots && !opFilterActive) ? 1 : 0,
            }}
          />
          {/* Cluster count labels */}
          <Layer
            id="campus-cluster-count"
            type="symbol"
            filter={IS_CLUSTER}
            maxzoom={BUILDING_ZOOM}
            layout={{
              'text-field': '{point_count_abbreviated}',
              'text-font': ['Noto Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 10,
            }}
            paint={{ 'text-color': (showDots && !opFilterActive) ? '#ffffff' : 'rgba(0,0,0,0)' }}
          />
          {/* Selection ring — always visible so selected campus is clear at any zoom */}
          <Layer
            id="campus-selected-ring"
            type="circle"
            minzoom={CAMPUS_MIN_ZOOM}
            filter={['all', NOT_CLUSTER, ['==', ['get', 'id'], selectedDC?.id ?? '$$none$$']]}
            paint={{
              'circle-radius': ['interpolate', ['linear'],
                ['coalesce', ['get', 'total_footprint_m2'], 0],
                0, 9, 1000, 11, 10000, 14, 50000, 18, 200000, 22, 800000, 26,
              ],
              'circle-color':        'rgba(0,0,0,0)',
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#22c55e',
            }}
          />
          {/* Individual campus dots — visibility controlled by showDots */}
          <Layer
            id="campus-circles"
            type="circle"
            minzoom={CAMPUS_MIN_ZOOM}
            filter={NOT_CLUSTER}
            paint={{
              'circle-color':        areaColorExpr('total_footprint_m2'),
              'circle-radius':       CAMPUS_RADIUS,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': 'rgba(255,255,255,0.55)',
              'circle-opacity':      (showDots && !opFilterActive) ? 0.88 : 0,
              'circle-stroke-opacity': (showDots && !opFilterActive) ? 1 : 0,
            }}
          />
        </Source>

        {/* ── Operator filter: only this operator's campuses, highlighted ── */}
        <Source id="op-filter-source" type="geojson" data={opFilterGeoJSON}>
          <Layer id="op-filter-glow" type="circle" paint={{
            'circle-radius': 11, 'circle-color': '#22c55e', 'circle-blur': 0.6,
            'circle-opacity': opFilterActive ? 0.16 : 0,
          }} />
          <Layer id="op-filter-circles" type="circle" paint={{
            'circle-radius': 6, 'circle-color': '#22c55e',
            'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff',
            'circle-opacity': opFilterActive ? 0.95 : 0,
            'circle-stroke-opacity': opFilterActive ? 1 : 0,
          }} />
        </Source>

        {/* ── Simulation DC ── */}
        <Source id="dc-source" type="geojson" data={dcGeoJSON} cluster={false}>
          <Layer id="dc-ring"      type="circle" minzoom={DC_MIN_ZOOM} filter={IS_SELECTED} paint={DC_RING_PAINT} />
          <Layer id="dc-points"    type="circle" minzoom={DC_MIN_ZOOM} filter={IS_SIM}      paint={DC_POINT_PAINT} />
          <Layer id="dc-sim-label" type="symbol" minzoom={DC_MIN_ZOOM} filter={IS_SIM}      layout={DC_SIM_LABEL_LAYOUT} paint={DC_SIM_LABEL_PAINT} />
        </Source>
      </MapGL>
    </div>
  );
});

// Defined after the component so INTERACTIVE_LAYER_IDS can reference layer id strings
// that are constant — used in both the Map prop and the handleMouseMove check
const INTERACTIVE_LAYER_IDS = [
  'campus-clusters',
  'campus-circles',
  'building-fills',
  'building-nodes',
  'dc-points',
  'country-interactive-fill',
];
