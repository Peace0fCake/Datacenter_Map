import { useRef, useCallback, useMemo } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import { waterStressLabel } from '../lib/model';
import carbonData from '../data/carbonIntensity.json';
import waterStressData from '../data/waterStress.json';
import 'maplibre-gl/dist/maplibre-gl.css';

const STYLES = {
  dark:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

const COUNTRIES_GEOJSON = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

// Geographic centroids for EU/EEA countries — matches where OSM places the country label
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

// Natural Earth 110m uses ISO_A2_EH (not ISO_A2) for countries with overseas
// territories — notably France and Norway both have ISO_A2: "-99" there.
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
        // Use geographic centroid so labels match OSM placement; fall back to DC centroid
        geometry: { type: 'Point', coordinates: center ?? [g.lng, g.lat] },
        properties: {
          countryCode: g.countryCode,
          countryName: carbonData[g.countryCode]?.name ?? g.countryCode,
          dcCount: g.dcCount,
          totalCapacityMW: g.totalCapacityMW,
        },
      };
    }),
  };
}

// ── Static layer configs ───────────────────────────────────────────────────────

const CLUSTER_PAINT = {
  'circle-color': '#6366f1',
  'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
  'circle-opacity': 0.85,
  'circle-stroke-width': 1.5,
  'circle-stroke-color': 'rgba(255,255,255,0.25)',
};
const CLUSTER_COUNT_LAYOUT = {
  'text-field': '{point_count_abbreviated}',
  'text-font': ['Noto Sans Bold', 'Arial Unicode MS Bold'],
  'text-size': 12,
};
const CLUSTER_COUNT_PAINT = { 'text-color': '#ffffff' };

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

// Country name label — styled as a clickable chip distinct from the base map labels
const COUNTRY_LABEL_LAYOUT = {
  'text-field': ['get', 'countryName'],
  'text-font': ['Noto Sans Bold', 'Arial Unicode MS Bold'],
  'text-size': 12,
  'text-allow-overlap': false,
  'text-anchor': 'center',
};
const COUNTRY_LABEL_PAINT_DARK = {
  'text-color': '#c7d2fe',         // indigo-200
  'text-halo-color': '#1e1b4b',   // indigo-950, creates a dark pill background
  'text-halo-width': 5,
  'text-halo-blur': 0,
};
const COUNTRY_LABEL_PAINT_LIGHT = {
  'text-color': '#3730a3',         // indigo-800
  'text-halo-color': '#e0e7ff',   // indigo-100
  'text-halo-width': 5,
  'text-halo-blur': 0,
};

const NOT_CLUSTER = ['!', ['has', 'point_count']];
const IS_CLUSTER  = ['has', 'point_count'];
const IS_SELECTED = ['all', NOT_CLUSTER, ['==', ['get', 'selected'], 1]];
const IS_SIM      = ['all', NOT_CLUSTER, ['==', ['get', 'simulation'], 1]];

const COUNTRY_MAX_ZOOM = 5;
const DC_MIN_ZOOM = 4;

export function MapView({
  dataCenters, countryGroups, selectedDC, onSelectDC, onSelectCountry,
  simulationActive, onMapClick, theme, activeLayer,
}) {
  const mapRef = useRef(null);

  const dcGeoJSON = useMemo(
    () => toDCGeoJSON(dataCenters, selectedDC?.id),
    [dataCenters, selectedDC?.id],
  );

  const countryGeoJSON = useMemo(
    () => toCountryGeoJSON(countryGroups),
    [countryGroups],
  );

  const handleClick = useCallback(async (e) => {
    const features = e.features ?? [];

    const pointFeat = features.find(f => f.layer.id === 'dc-points');
    if (pointFeat) {
      const dc = dataCenters.find(d => d.id === pointFeat.properties.id);
      if (dc) { onSelectDC(dc); return; }
    }

    const clusterFeat = features.find(f => f.layer.id === 'dc-clusters');
    if (clusterFeat) {
      const map = mapRef.current?.getMap();
      const source = map?.getSource('dc-source');
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
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 10, latitude: 52, zoom: 4 }}
        mapStyle={STYLES[theme] ?? STYLES.dark}
        onClick={handleClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        interactiveLayerIds={['dc-points', 'dc-clusters', 'country-labels']}
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

        {/* Clickable country name labels — visible when zoomed out */}
        <Source id="country-source" type="geojson" data={countryGeoJSON}>
          <Layer
            id="country-labels"
            type="symbol"
            maxzoom={COUNTRY_MAX_ZOOM}
            layout={COUNTRY_LABEL_LAYOUT}
            paint={countryLabelPaint}
          />
        </Source>

        {/* Individual DC points — clustered between DC_MIN_ZOOM and zoom 8 */}
        <Source
          id="dc-source"
          type="geojson"
          data={dcGeoJSON}
          cluster={true}
          clusterMaxZoom={7}
          clusterRadius={50}
        >
          <Layer id="dc-clusters"      type="circle" minzoom={DC_MIN_ZOOM} filter={IS_CLUSTER}  paint={CLUSTER_PAINT} />
          <Layer id="dc-cluster-count" type="symbol" minzoom={DC_MIN_ZOOM} filter={IS_CLUSTER}  layout={CLUSTER_COUNT_LAYOUT} paint={CLUSTER_COUNT_PAINT} />
          <Layer id="dc-ring"          type="circle" minzoom={DC_MIN_ZOOM} filter={IS_SELECTED} paint={DC_RING_PAINT} />
          <Layer id="dc-points"        type="circle" minzoom={DC_MIN_ZOOM} filter={NOT_CLUSTER} paint={DC_POINT_PAINT} />
          <Layer id="dc-sim-label"     type="symbol" minzoom={DC_MIN_ZOOM} filter={IS_SIM}      layout={DC_SIM_LABEL_LAYOUT} paint={DC_SIM_LABEL_PAINT} />
        </Source>
      </Map>
    </div>
  );
}
