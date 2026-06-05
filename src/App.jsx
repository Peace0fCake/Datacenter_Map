import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MapView } from './components/MapView';
import { DetailsPanel } from './components/DetailsPanel';
import { SimulationControls } from './components/SimulationControls';
import { Legend } from './components/Legend';
import { useClimateData } from './hooks/useClimateData';
import { useWaterStress } from './hooks/useWaterStress';
import { computeMetrics, utilizationFromMW, getCountryFromCoords, getOperatorCalibration, getCarbonData, allocateDCPower, getCountryDCPower } from './lib/model';
import { reverseGeocodeCountry } from './hooks/useReverseGeocode';
import './App.css';

let simCounter = 0;

export default function App() {
  const [theme, setTheme]           = useState('dark');
  const [activeLayer, setActiveLayer] = useState('none');
  const [countryDCStats, setCountryDCStats] = useState({});

  useEffect(() => {
    fetch('/data/country_dc_stats.json')
      .then(r => r.json())
      .then(d => setCountryDCStats(d))
      .catch(() => {});
  }, []);

  const { getAvgTemp }    = useClimateData();
  const { getWaterStress } = useWaterStress();

  const [selectedDC, setSelectedDC]       = useState(null);
  const selectedDCRef                      = useRef(null);
  const [selectedCountry, setSelectedCountry] = useState(null);

  const [simActive, setSimActive]       = useState(false);
  const [simCapacityMW, setSimCapacityMW] = useState(10);
  const [simDC, setSimDC]               = useState(null);

  const enrichingRef = useRef(new Set());

  const enrichDC = useCallback(async (dc) => {
    if (enrichingRef.current.has(dc.id)) return;
    enrichingRef.current.add(dc.id);

    const countryCode =
      (dc.country && dc.country.length === 2 ? dc.country.toUpperCase() : null) ??
      (await reverseGeocodeCountry(dc.lat, dc.lng)) ??
      getCountryFromCoords(dc.lat, dc.lng);

    const [avgTempC, waterStress] = await Promise.all([
      getAvgTemp(dc.lat, dc.lng),
      getWaterStress(dc.lat, dc.lng),
    ]);

    const calibration   = getOperatorCalibration(dc.operator);
    const allocatedMWh  = allocateDCPower(dc.footprintM2 ?? null, countryCode, countryDCStats[countryCode] ?? null);

    const metrics = (dc.capacityMW != null || allocatedMWh != null) ? computeMetrics({
      capacityMW:             dc.capacityMW ?? 1,
      utilizationRate:        utilizationFromMW(dc.capacityMW ?? 1),
      avgTempC:               avgTempC ?? 12,
      countryCode,
      reportedPUE:            calibration?.pue ?? null,
      reportedWUE:            calibration?.wue ?? null,
      totalEnergyMWhOverride: allocatedMWh,
    }) : null;

    const enriched = {
      ...dc,
      metrics,
      waterStress,
      countryCode,
      avgTempC:             avgTempC ?? 12,
      calibrationSource:    calibration?.source ?? null,
      calibrationSourceUrl: calibration?.url ?? null,
    };

    if (dc.source === 'simulation') {
      setSimDC(prev => prev?.id === dc.id ? enriched : prev);
    }
    setSelectedDC(prev => prev?.id === dc.id ? enriched : prev);
    enrichingRef.current.delete(dc.id);
  }, [getAvgTemp, getWaterStress, countryDCStats]);

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
    clearSimDC();
    const id = `sim-${++simCounter}`;
    const newDC = {
      id, lat, lng,
      name:       `Simulated ${simCapacityMW} MW DC`,
      operator:   null,
      capacityMW: simCapacityMW,
      source:     'simulation',
    };
    selectedDCRef.current = newDC;
    setSimDC(newDC);
    setSelectedDC(newDC);
    enrichDC(newDC);
  }, [simCapacityMW, clearSimDC, enrichDC]);

  const handleSimToggle = useCallback(() => {
    setSimActive(v => {
      if (v) {
        clearSimDC();
        selectedDCRef.current = null;
        setSelectedDC(null);
      }
      return !v;
    });
  }, [clearSimDC]);

  const handleCapacityChange = useCallback((mw) => {
    setSimCapacityMW(mw);
    const recompute = (dc) => {
      if (!dc) return null;
      const metrics = dc.avgTempC != null ? computeMetrics({
        capacityMW:     mw,
        utilizationRate: utilizationFromMW(mw),
        avgTempC:        dc.avgTempC,
        countryCode:     dc.countryCode,
        reportedPUE:     null,
        reportedWUE:     null,
      }) : null;
      return { ...dc, capacityMW: mw, name: `Simulated ${mw} MW DC`, metrics };
    };
    setSimDC(recompute);
    setSelectedDC(prev => prev?.source === 'simulation' ? recompute(prev) : prev);
  }, []);

  // Country groups derived from static campus stats — drives the country label layer
  const countryGroups = useMemo(() =>
    Object.entries(countryDCStats)
      .filter(([k]) => k !== '_note')
      .map(([code, stats]) => ({ countryCode: code, dcCount: stats.campus_count })),
    [countryDCStats],
  );

  const handleSelectCountry = useCallback((code) => {
    const stats = countryDCStats[code];
    if (!stats) return;
    clearSimDC();
    selectedDCRef.current = null;
    setSelectedDC(null);
    setSelectedCountry({
      countryCode: code,
      dcCount:     stats.campus_count,
      totalCapacityMW: 0,
      carbon:  getCarbonData(code),
      dcPower: getCountryDCPower(code),
      osm:     stats,
    });
  }, [countryDCStats, clearSimDC]);

  const totalCampuses = useMemo(() =>
    Object.entries(countryDCStats)
      .filter(([k]) => k !== '_note')
      .reduce((sum, [, s]) => sum + (s.campus_count || 0), 0),
    [countryDCStats],
  );

  // Only the simulation DC goes through the dynamic layer; real DCs come from static GeoJSON
  const simDCs = simDC ? [simDC] : [];

  return (
    <div className={`app theme-${theme}`}>
      <header className="app-header">
        <div className="header-title">
          <h1>Data Centers</h1>
          <span className="header-sub">Environmental footprint across Europe</span>
        </div>
        <div className="header-controls">
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
              { id: 'none',   label: 'None' },
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
          {totalCampuses > 0 && (
            <div className="sidebar-stats">
              <div className="stat">
                <span className="stat-value">{totalCampuses.toLocaleString()}</span>
                <span className="stat-label">campuses mapped (Europe)</span>
              </div>
            </div>
          )}
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
            dataCenters={simDCs}
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
