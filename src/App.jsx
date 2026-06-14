import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MapView } from './components/MapView';
import { DetailsPanel } from './components/DetailsPanel';
import { SimulationControls } from './components/SimulationControls';
import { Legend } from './components/Legend';
import { CapacityOutlook } from './components/CapacityOutlook';
import { useClimateData } from './hooks/useClimateData';
import { useWaterStress } from './hooks/useWaterStress';
import { computeMetrics, utilizationFromMW, getCountryFromCoords, getOperatorCalibration, getCarbonData, allocateDCPower, getCountryDCPower } from './lib/model';
import { reverseGeocodeCountry } from './hooks/useReverseGeocode';
import './App.css';

let simCounter = 0;

export default function App() {
  const [theme, setTheme]           = useState('dark');
  const [outlookOpen, setOutlookOpen] = useState(false);
  const [activeLayer, setActiveLayer] = useState('none');
  const [countryDCStats, setCountryDCStats] = useState({});
  const [pipelineByCountry, setPipelineByCountry] = useState({});

  useEffect(() => {
    fetch('/data/country_dc_stats.json')
      .then(r => r.json())
      .then(d => setCountryDCStats(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/data/capacityOutlook.json')
      .then(r => r.json())
      .then(d => {
        const lookup = {};
        for (const c of d.pipeline.countries) lookup[c.code] = c;
        setPipelineByCountry(lookup);
      })
      .catch(() => {});
  }, []);

  const { getAvgTemp }    = useClimateData();
  const { getWaterStress } = useWaterStress();

  const [selectedDC, setSelectedDC]       = useState(null);
  const selectedDCRef                      = useRef(null);
  const [selectedCountry, setSelectedCountry] = useState(null);

  const mapViewRef = useRef(null);
  const handleFlyTo = useCallback(({ lat, lng, zoom }) => {
    mapViewRef.current?.flyTo({ lat, lng, zoom });
  }, []);

  // ── Sidebar resize ────────────────────────────────────────────────────────
  const [sidebarW, setSidebarW] = useState(280);
  const sidebarWRef = useRef(sidebarW);
  sidebarWRef.current = sidebarW;
  const startSidebarResize = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWRef.current;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    const onMove = (me) => setSidebarW(Math.max(160, Math.min(480, startW + me.clientX - startX)));
    const onUp   = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

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
      carbon:   getCarbonData(code),
      dcPower:  getCountryDCPower(code),
      osm:      stats,
      pipeline: pipelineByCountry[code] ?? null,
    });
  }, [countryDCStats, pipelineByCountry, clearSimDC]);

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
          <button className="outlook-btn" onClick={() => setOutlookOpen(true)}>
            Capacity Outlook
          </button>
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
        <aside className="sidebar" style={{ width: sidebarW }}>
          <SimulationControls active={simActive} onToggle={handleSimToggle} />

          <div className="layer-controls">
            <div className="section-label" style={{ padding: '16px 16px 8px' }}>Map Layers</div>
            {[
              { id: 'none',   label: 'None' },
              { id: 'carbon', label: 'Grid carbon intensity', src: 'Ember 2024 (2023 data)' },
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
        <div className="sidebar-resize-handle" onMouseDown={startSidebarResize} />

        <div className="map-wrapper">
          <DetailsPanel
            dc={selectedDC}
            country={selectedCountry}
            onClose={() => { handleSelectDC(null); setSelectedCountry(null); }}
            simCapacityMW={simCapacityMW}
            onCapacityChange={handleCapacityChange}
            onFlyTo={handleFlyTo}
          />
          <MapView
            ref={mapViewRef}
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
      {outlookOpen && <CapacityOutlook onClose={() => setOutlookOpen(false)} />}
    </div>
  );
}
