import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MapView } from './components/MapView';
import { DetailsPanel } from './components/DetailsPanel';
import { SimulationControls } from './components/SimulationControls';
import { Legend } from './components/Legend';
import { useDataCenters } from './hooks/useDataCenters';
import { useClimateData } from './hooks/useClimateData';
import { useWaterStress } from './hooks/useWaterStress';
import { computeMetrics, utilizationFromMW, getCountryFromCoords, getOperatorCalibration, groupDCsByCountry, getCarbonData, allocateDCPower, getCountryDCPower } from './lib/model';
import { reverseGeocodeCountry } from './hooks/useReverseGeocode';

import './App.css';

let simCounter = 0;

export default function App() {
  const [theme, setTheme] = useState('dark');
  const [activeLayer, setActiveLayer] = useState('none');
  const [countryDCStats, setCountryDCStats] = useState({});

  useEffect(() => {
    fetch('/data/country_dc_stats.json')
      .then(r => r.json())
      .then(d => setCountryDCStats(d))
      .catch(() => {});
  }, []);

  const { dataCenters: osmDCs, loading: dcLoading, error: dcError } = useDataCenters();
  const { getAvgTemp } = useClimateData();
  const { getWaterStress } = useWaterStress();

  const [enrichedDCs, setEnrichedDCs] = useState([]);
  const [selectedDC, setSelectedDC] = useState(null);
  const selectedDCRef = useRef(null);

  const [selectedCountry, setSelectedCountry] = useState(null);

  const [simActive, setSimActive] = useState(false);
  const [simCapacityMW, setSimCapacityMW] = useState(10);
  // At most one simulated DC at a time
  const [simDC, setSimDC] = useState(null);

  const enrichingRef = useRef(new Set());

  useEffect(() => {
    setEnrichedDCs(osmDCs);
  }, [osmDCs]);

  const enrichDC = useCallback(async (dc) => {
    if (enrichingRef.current.has(dc.id)) return;
    enrichingRef.current.add(dc.id);

    // Country resolution: OSM tag → Nominatim → bbox fallback
    const countryCode =
      (dc.country && dc.country.length === 2 ? dc.country.toUpperCase() : null) ??
      (await reverseGeocodeCountry(dc.lat, dc.lng)) ??
      getCountryFromCoords(dc.lat, dc.lng);

    const [avgTempC, waterStress] = await Promise.all([
      getAvgTemp(dc.lat, dc.lng),
      getWaterStress(dc.lat, dc.lng),
    ]);

    const calibration = getOperatorCalibration(dc.operator);

    // Use area-based country allocation when available; fall back to capacity model
    const allocatedMWh = allocateDCPower(
      dc.footprintM2 ?? null,
      countryCode,
      countryDCStats[countryCode] ?? null,
    );

    const metrics = (dc.capacityMW != null || allocatedMWh != null) ? computeMetrics({
      capacityMW:            dc.capacityMW ?? 1,
      utilizationRate:       utilizationFromMW(dc.capacityMW ?? 1),
      avgTempC:              avgTempC ?? 12,
      countryCode,
      reportedPUE:           calibration?.pue ?? null,
      reportedWUE:           calibration?.wue ?? null,
      totalEnergyMWhOverride: allocatedMWh,
    }) : null;

    const enriched = {
      ...dc,
      metrics,          // null when capacity unknown
      waterStress,
      countryCode,
      avgTempC: avgTempC ?? 12,
      calibrationSource: calibration?.source ?? null,
    };

    if (dc.source === 'simulation') {
      setSimDC((prev) => (prev?.id === dc.id ? enriched : prev));
    } else {
      setEnrichedDCs((prev) => prev.map((d) => (d.id === dc.id ? enriched : d)));
    }

    setSelectedDC((prev) => (prev?.id === dc.id ? enriched : prev));
    enrichingRef.current.delete(dc.id);
  }, [getAvgTemp, getWaterStress, countryDCStats]);

  // Remove the current simulated DC and cancel any in-flight enrichment for it
  const clearSimDC = useCallback(() => {
    const prev = selectedDCRef.current;
    if (prev?.source === 'simulation') {
      enrichingRef.current.delete(prev.id);
      setSimDC(null);
    }
  }, []);

  const handleSelectDC = useCallback((dc) => {
    clearSimDC();
    selectedDCRef.current = dc ?? null;
    setSelectedDC(dc ?? null);
    setSelectedCountry(null);
    if (dc && !dc.metrics) enrichDC(dc);
  }, [clearSimDC, enrichDC]);

  const handleMapClick = useCallback(({ lat, lng }) => {
    // Replace any existing simulated DC
    clearSimDC();
    const id = `sim-${++simCounter}`;
    const newDC = {
      id,
      lat,
      lng,
      name: `Simulated ${simCapacityMW} MW DC`,
      operator: null,
      capacityMW: simCapacityMW,
      source: 'simulation',
    };
    selectedDCRef.current = newDC;
    setSimDC(newDC);
    setSelectedDC(newDC);
    enrichDC(newDC);
  }, [simCapacityMW, clearSimDC, enrichDC]);

  const handleSimToggle = useCallback(() => {
    setSimActive((v) => {
      if (v) {
        clearSimDC();
        selectedDCRef.current = null;
        setSelectedDC(null);
      }
      return !v;
    });
  }, [clearSimDC]);

  // Live-update metrics when slider moves, without re-fetching climate/water data
  const handleCapacityChange = useCallback((mw) => {
    setSimCapacityMW(mw);
    const recompute = (dc) => {
      if (!dc) return null;
      const metrics = dc.avgTempC != null ? computeMetrics({
        capacityMW: mw,
        utilizationRate: utilizationFromMW(mw),
        avgTempC: dc.avgTempC,
        countryCode: dc.countryCode,
        reportedPUE: null,
        reportedWUE: null,
      }) : null;
      return { ...dc, capacityMW: mw, name: `Simulated ${mw} MW DC`, metrics };
    };
    setSimDC(recompute);
    setSelectedDC((prev) => prev?.source === 'simulation' ? recompute(prev) : prev);
  }, []);

  const countryGroups = useMemo(() => groupDCsByCountry(enrichedDCs), [enrichedDCs]);

  const handleSelectCountry = useCallback((code) => {
    const group = countryGroups.find(g => g.countryCode === code);
    if (!group) return;
    clearSimDC();
    selectedDCRef.current = null;
    setSelectedDC(null);
    setSelectedCountry({
      ...group,
      carbon:     getCarbonData(code),
      dcPower:    getCountryDCPower(code),
      osm:        countryDCStats[code] ?? null,
    });
  }, [countryGroups, clearSimDC]);

  const allDCs = simDC ? [...enrichedDCs, simDC] : enrichedDCs;

  return (
    <div className={`app theme-${theme}`}>
      <header className="app-header">
        <div className="header-title">
          <h1>AI Data Centers</h1>
          <span className="header-sub">Environmental footprint across Europe</span>
        </div>
        <div className="header-controls">
          {dcLoading && <div className="loading-badge">Loading OSM data…</div>}
          {dcError && <div className="error-badge" title={dcError}>OSM unavailable · fallback</div>}
          <button
            className="theme-toggle"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title="Toggle light/dark mode"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <main className="app-body">
        <aside className="sidebar">
          <SimulationControls active={simActive} onToggle={handleSimToggle} />

          <div className="layer-controls">
            <div className="section-label" style={{ padding: '16px 16px 8px' }}>Map Layers</div>
            {[
              { id: 'none',   label: 'None',                 src: null },
              { id: 'carbon', label: 'Grid carbon intensity', src: 'Ember Climate 2023' },
              { id: 'water',  label: 'Baseline water stress', src: 'WRI Aqueduct 3.0' },
            ].map(({ id, label, src }) => (
              <label key={id} className={`layer-radio ${activeLayer === id ? 'checked' : ''}`}>
                <input type="radio" name="map-layer" value={id}
                  checked={activeLayer === id} onChange={() => setActiveLayer(id)} />
                <span className="layer-radio-dot" />
                <div className="layer-toggle-label">
                  <span>{label}</span>
                  {src && <span className="layer-src">{src}</span>}
                </div>
              </label>
            ))}
          </div>

          <Legend />
          <div className="sidebar-stats">
            <div className="stat">
              <span className="stat-value">{osmDCs.length}</span>
              <span className="stat-label">DCs mapped (Europe)</span>
            </div>
          </div>
        </aside>

        <div className="map-wrapper">
          <DetailsPanel
            dc={selectedDC}
            country={selectedCountry}
            onClose={() => { handleSelectDC(null); setSelectedCountry(null); }}
            simCapacityMW={simCapacityMW}
            onCapacityChange={handleCapacityChange}
          />
          <MapView
            dataCenters={allDCs}
            countryGroups={countryGroups}
            selectedDC={selectedDC}
            onSelectDC={handleSelectDC}
            onSelectCountry={handleSelectCountry}
            simulationActive={simActive}
            onMapClick={handleMapClick}
            theme={theme}
            activeLayer={activeLayer}
          />
        </div>
      </main>
    </div>
  );
}
