import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MapView } from './components/MapView';
import { DetailsPanel } from './components/DetailsPanel';
import { CountryModal } from './components/CountryModal';
import { SimulationControls } from './components/SimulationControls';
import { Legend } from './components/Legend';
import { LearnMore } from './components/LearnMore';
import { SettingsPanel } from './components/SettingsPanel';
import { useClimateData } from './hooks/useClimateData';
import { useWaterStress } from './hooks/useWaterStress';
import { useCampusPower } from './hooks/useCampusPower';
import { computeMetrics, utilizationFromMW, getCountryFromCoords, getOperatorCalibration, getCarbonData, allocateDCPower, getCountryDCPower, getEuropeStats, inferDCType } from './lib/model';
import { reverseGeocodeCountry } from './hooks/useReverseGeocode';
import './App.css';

let simCounter = 0;

export default function App() {
  const [theme, setTheme]           = useState('dark');
  const [learnOpen, setLearnOpen]       = useState(false);
  const [learnTab, setLearnTab]         = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelDensity, setPanelDensity] = useState(() => localStorage.getItem('panelDensity') || 'full');
  useEffect(() => { localStorage.setItem('panelDensity', panelDensity); }, [panelDensity]);
  const [selectedEurope, setSelectedEurope] = useState(false);
  const [activeLayer, setActiveLayer] = useState('none');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showIris,    setShowIris]    = useState(false);
  const [showDots,    setShowDots]    = useState(true);
  const [layerOpacity, setLayerOpacity] = useState({ carbon: 0.55, water: 0.65, heatmap: 0.75, iris: 0.75 });
  const setOpacity = (key, val) => setLayerOpacity(prev => ({ ...prev, [key]: val }));
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

  const { metrics: precomputedMetrics, stats: campusStats } = useCampusPower();
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

    // Use pre-computed metrics when available (avoids async re-computation per click)
    const precomp = precomputedMetrics?.[dc.id] ?? null;

    const countryCode =
      (dc.country && dc.country.length === 2 ? dc.country.toUpperCase() : null) ??
      precomp?.country ??
      (await reverseGeocodeCountry(dc.lat, dc.lng)) ??
      getCountryFromCoords(dc.lat, dc.lng);

    const [avgTempC, waterStress] = await Promise.all([
      precomp ? Promise.resolve(precomp.avg_temp_c) : getAvgTemp(dc.lat, dc.lng),
      getWaterStress(dc.lat, dc.lng),
    ]);

    const calibration  = getOperatorCalibration(dc.operator);
    const dcType       = precomp?.dc_type ?? dc.dcType ?? inferDCType(dc.operator);
    const reportedPUE  = precomp?.pue_reported ? precomp.pue : (calibration?.pue ?? null);

    // Energy: pre-computed national-share allocation (primary) → footprint allocation fallback.
    // NOTE: estimated_capacity_mw is itself footprint-derived (~300 W/m²), so it is NOT treated
    // as an authoritative capacity. Allocation ties each campus to measured national statistics.
    const allocatedMWh = precomp?.total_mwh_yr
      ?? allocateDCPower(dc.footprintM2 ?? null, countryCode, countryDCStats[countryCode] ?? null);
    const fallbackMW = dc.capacityMW ?? precomp?.power_mw ?? 1;

    const metrics = (allocatedMWh != null || dc.capacityMW != null) ? computeMetrics({
      capacityMW:             fallbackMW,
      utilizationRate:        utilizationFromMW(fallbackMW),
      avgTempC:               avgTempC ?? 12,
      countryCode,
      reportedPUE,
      reportedWUE:            calibration?.wue ?? null,
      totalEnergyMWhOverride: allocatedMWh,
      dcType,
      footprintM2:            dc.footprintM2 ?? null,
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
  }, [getAvgTemp, getWaterStress, countryDCStats, precomputedMetrics]);

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
    setSelectedEurope(false);
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

  const handleSelectEurope = useCallback(() => {
    clearSimDC();
    selectedDCRef.current = null;
    setSelectedDC(null);
    setSelectedCountry(null);
    setSelectedEurope(true);
  }, [clearSimDC]);

  const handleSelectCountry = useCallback((code) => {
    const stats = countryDCStats[code];
    if (!stats) return;
    clearSimDC();
    selectedDCRef.current = null;
    setSelectedDC(null);
    setSelectedEurope(false);
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

  const europeStats = useMemo(() => getEuropeStats(), []);

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
          <button className="outlook-btn" onClick={handleSelectEurope}>
            Europe
          </button>
          <button className="outlook-btn" onClick={() => { setLearnTab(0); setLearnOpen(true); }}>
            Learn More
          </button>
          <button
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
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
          <div className="layer-controls">
            <div className="layer-section-label">Map overlay</div>
            {[
              { id: 'none',   label: 'None',                   src: null,              opKey: null },
              { id: 'carbon', label: 'Grid carbon intensity',  src: 'Ember 2024',      opKey: 'carbon' },
              { id: 'water',  label: 'Watershed water stress', src: 'WRI Aqueduct 4.0',opKey: 'water' },
            ].map(({ id, label, src, opKey }) => (
              <div key={id}>
                <label className={`layer-radio ${activeLayer === id ? 'checked' : ''}`}>
                  <input type="radio" name="map-layer" value={id}
                    checked={activeLayer === id} onChange={() => setActiveLayer(id)} />
                  <span className="layer-radio-dot" />
                  <div className="layer-toggle-label">
                    <span>{label}</span>
                    {src && <span className="layer-src">{src}</span>}
                  </div>
                </label>
                {opKey && activeLayer === id && (
                  <div className="layer-opacity-row">
                    <span className="layer-opacity-label">Intensity</span>
                    <input type="range" min="5" max="100" step="5"
                      value={Math.round((layerOpacity[opKey] ?? 0.6) * 100)}
                      onChange={e => setOpacity(opKey, +e.target.value / 100)}
                      className="layer-opacity-slider" />
                    <span className="layer-opacity-pct">{Math.round((layerOpacity[opKey] ?? 0.6) * 100)}%</span>
                  </div>
                )}
              </div>
            ))}

            <div className="layer-section-label layer-section-label--sep">Additional layers</div>
            {[
              { key: 'dots',    label: 'Campus markers',     src: null,             val: showDots,    set: setShowDots,    opKey: null },
              { key: 'heatmap', label: 'DC concentration',   src: 'OSM',            val: showHeatmap, set: setShowHeatmap, opKey: 'heatmap' },
              { key: 'iris',    label: 'France electricity', src: 'IRIS/RTE 2023',  val: showIris,    set: setShowIris,    opKey: 'iris' },
            ].map(({ key, label, src, val, set, opKey }) => (
              <div key={key}>
                <label className={`layer-checkbox ${val ? 'checked' : ''}`}>
                  <input type="checkbox" checked={val} onChange={() => set(v => !v)} />
                  <span className="layer-checkbox-box" />
                  <div className="layer-toggle-label">
                    <span>{label}</span>
                    {src && <span className="layer-src">{src}</span>}
                  </div>
                </label>
                {opKey && val && (
                  <div className="layer-opacity-row">
                    <span className="layer-opacity-label">Intensity</span>
                    <input type="range" min="5" max="100" step="5"
                      value={Math.round((layerOpacity[opKey] ?? 0.75) * 100)}
                      onChange={e => setOpacity(opKey, +e.target.value / 100)}
                      className="layer-opacity-slider" />
                    <span className="layer-opacity-pct">{Math.round((layerOpacity[opKey] ?? 0.75) * 100)}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Legend activeLayer={activeLayer} showHeatmap={showHeatmap} showIris={showIris} showDots={showDots} />
          <SimulationControls active={simActive} onToggle={handleSimToggle} />
          <div className="sidebar-bottom">
            {totalCampuses > 0 && (
              <div className="sidebar-stat-line">
                <span className="stat-value">{totalCampuses.toLocaleString()}</span>
                <span className="stat-label">campuses mapped (Europe)</span>
              </div>
            )}
            <button className="outlook-btn sidebar-calc-btn" onClick={() => { setLearnTab(4); setLearnOpen(true); }}>
              How we calculate this →
            </button>
          </div>
        </aside>
        <div className="sidebar-resize-handle" onMouseDown={startSidebarResize} />

        <div className="map-wrapper">
          <DetailsPanel
            dc={selectedDC}
            onClose={() => handleSelectDC(null)}
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
            showHeatmap={showHeatmap}
            showIris={showIris}
            showDots={showDots}
            layerOpacity={layerOpacity}
          />
        </div>
      </main>
      {(selectedCountry || selectedEurope) && (
        <CountryModal
          country={selectedCountry ?? null}
          europe={selectedEurope ? europeStats : null}
          onClose={() => { setSelectedCountry(null); setSelectedEurope(false); }}
          onFlyTo={handleFlyTo}
          onSelectCountry={handleSelectCountry}
          totalCampuses={totalCampuses}
          countryDCStats={countryDCStats}
          density={panelDensity}
        />
      )}
      {learnOpen && <LearnMore onClose={() => setLearnOpen(false)} initialTab={learnTab} campusStats={campusStats} />}
      {settingsOpen && (
        <SettingsPanel
          density={panelDensity}
          onDensity={setPanelDensity}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
