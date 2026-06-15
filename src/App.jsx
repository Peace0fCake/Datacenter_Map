import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MapView } from './components/MapView';
import { DetailsPanel } from './components/DetailsPanel';
import { OperatorPanel, loadOperators } from './components/OperatorPanel';
import { SidePanelFrame } from './components/SidePanelFrame';
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

  // ── Navigation stack ───────────────────────────────────────────────────────
  // A linear history of panels. Top of stack is what's shown:
  //   { kind: 'dc', dc } | { kind: 'operator', name } | { kind: 'country', country } | { kind: 'europe' }
  // 'dc'/'operator' render in the left side panel; 'country'/'europe' render as a window (modal).
  const [stack, setStack] = useState([]);
  const stackRef = useRef([]);
  stackRef.current = stack;

  const top        = stack[stack.length - 1] ?? null;
  const canBack    = stack.length > 1;
  const activeDC   = top?.kind === 'dc' ? top.dc : null;

  const pushPanel   = useCallback((entry) => setStack(s => [...s, entry]), []);
  const replaceRoot = useCallback((entry) => setStack([entry]), []);
  const back        = useCallback(() => setStack(s => s.slice(0, -1)), []);
  const closeAll    = useCallback(() => setStack([]), []);

  const mapViewRef = useRef(null);
  const handleFlyTo = useCallback(({ lat, lng, zoom }) => {
    mapViewRef.current?.flyTo({ lat, lng, zoom });
  }, []);

  // When a country becomes the active panel (open or via Back), zoom to it + outline it
  useEffect(() => {
    if (top?.kind === 'country' && top.country?.countryCode) {
      mapViewRef.current?.highlightCountry(top.country.countryCode);
    }
  }, [top]);

  // While an operator panel is open, show only that operator's campuses on the map
  const [operatorCampuses, setOperatorCampuses] = useState(null);
  useEffect(() => {
    if (top?.kind !== 'operator') { setOperatorCampuses(null); return; }
    let cancelled = false;
    loadOperators().then(d => {
      if (cancelled) return;
      const op = d.operators.find(o => o.name === top.name);
      const feats = [];
      for (const c of op?.countries ?? []) {
        for (const camp of c.campuses ?? []) {
          if (camp.lat && camp.lon) feats.push({ id: camp.id, name: camp.name, lat: camp.lat, lon: camp.lon });
        }
      }
      setOperatorCampuses(feats);
    }).catch(() => setOperatorCampuses(null));
    return () => { cancelled = true; };
  }, [top]);

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

    // Write the enriched DC back into its stack entry (datacenter or simulation)
    setStack(s => s.map(e => (e.kind === 'dc' && e.dc.id === dc.id) ? { ...e, dc: enriched } : e));
    enrichingRef.current.delete(dc.id);
  }, [getAvgTemp, getWaterStress, countryDCStats, precomputedMetrics]);

  // Selecting a campus from the map starts a fresh navigation (clears history)
  const handleSelectDC = useCallback((dc) => {
    if (!dc) { closeAll(); return; }
    replaceRoot({ kind: 'dc', dc });
    if (!dc.metrics) enrichDC(dc);
  }, [enrichDC, replaceRoot, closeAll]);

  const handleMapClick = useCallback(({ lat, lng }) => {
    const id = `sim-${++simCounter}`;
    const newDC = {
      id, lat, lng,
      name:       `Simulated ${simCapacityMW} MW DC`,
      operator:   null,
      capacityMW: simCapacityMW,
      source:     'simulation',
    };
    replaceRoot({ kind: 'dc', dc: newDC });
    enrichDC(newDC);
  }, [simCapacityMW, replaceRoot, enrichDC]);

  const handleSimToggle = useCallback(() => {
    setSimActive(v => {
      // Turning sim off while a simulated DC is showing → dismiss it
      if (v && stackRef.current[stackRef.current.length - 1]?.dc?.source === 'simulation') {
        setStack(s => s.slice(0, -1));
      }
      return !v;
    });
  }, []);

  const handleCapacityChange = useCallback((mw) => {
    setSimCapacityMW(mw);
    setStack(s => s.map((e, i) => {
      if (i !== s.length - 1 || e.kind !== 'dc' || e.dc.source !== 'simulation') return e;
      const dc = e.dc;
      const metrics = dc.avgTempC != null ? computeMetrics({
        capacityMW:     mw,
        utilizationRate: utilizationFromMW(mw),
        avgTempC:        dc.avgTempC,
        countryCode:     dc.countryCode,
        reportedPUE:     null,
        reportedWUE:     null,
      }) : null;
      return { ...e, dc: { ...dc, capacityMW: mw, name: `Simulated ${mw} MW DC`, metrics } };
    }));
  }, []);

  // Country groups derived from static campus stats — drives the country label layer
  const countryGroups = useMemo(() =>
    Object.entries(countryDCStats)
      .filter(([k]) => k !== '_note')
      .map(([code, stats]) => ({ countryCode: code, dcCount: stats.campus_count })),
    [countryDCStats],
  );

  const handleSelectEurope = useCallback(() => { replaceRoot({ kind: 'europe' }); }, [replaceRoot]);

  const buildCountryEntry = useCallback((code) => {
    const stats = countryDCStats[code];
    if (!stats) return null;
    return {
      kind: 'country',
      country: {
        countryCode: code,
        dcCount:     stats.campus_count,
        totalCapacityMW: 0,
        carbon:   getCarbonData(code),
        dcPower:  getCountryDCPower(code),
        osm:      stats,
        pipeline: pipelineByCountry[code] ?? null,
      },
    };
  }, [countryDCStats, pipelineByCountry]);

  // From the map / header → fresh root; from within a panel (Europe list) → push onto history
  const openCountryFromMap = useCallback((code) => {
    const entry = buildCountryEntry(code);
    if (entry) replaceRoot(entry);
  }, [buildCountryEntry, replaceRoot]);

  const pushCountry = useCallback((code) => {
    const entry = buildCountryEntry(code);
    if (entry) pushPanel(entry);
  }, [buildCountryEntry, pushPanel]);

  const openOperator = useCallback((name) => { pushPanel({ kind: 'operator', name }); }, [pushPanel]);

  // Open a campus from a list (country/operator panel): push its DC panel AND zoom to it.
  const handleOpenCampus = useCallback((c) => {
    if (!c?.id) return;
    const dc = {
      id:          c.id,
      name:        c.name ?? 'Data Center',
      lat:         c.lat,
      lng:         c.lon,
      operator:    c.operator ?? null,
      capacityMW:  null,                 // footprint-derived; let enrichment allocate
      footprintM2: c.fp_m2 ?? null,
      source:      'campus',
      country:     c.country ?? null,
      dcType:      c.type ?? null,
      sourceUrl:   c.osm_url ?? null,
    };
    pushPanel({ kind: 'dc', dc });
    enrichDC(dc);
    if (c.lat && c.lon) handleFlyTo({ lat: c.lat, lng: c.lon, zoom: 15 });
  }, [pushPanel, enrichDC, handleFlyTo]);

  const totalCampuses = useMemo(() =>
    Object.entries(countryDCStats)
      .filter(([k]) => k !== '_note')
      .reduce((sum, [, s]) => sum + (s.campus_count || 0), 0),
    [countryDCStats],
  );

  const europeStats = useMemo(() => getEuropeStats(), []);

  // Only the simulation DC goes through the dynamic layer; real DCs come from static GeoJSON
  const simDCs = activeDC?.source === 'simulation' ? [activeDC] : [];

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
          <SidePanelFrame open={top != null}>
            {(top?.kind === 'country' || top?.kind === 'europe') ? (
              <CountryModal
                country={top.kind === 'country' ? top.country : null}
                europe={top.kind === 'europe' ? europeStats : null}
                canBack={canBack}
                onBack={back}
                onClose={closeAll}
                onSelectCountry={pushCountry}
                onOpenOperator={openOperator}
                onOpenCampus={handleOpenCampus}
                campusMetrics={precomputedMetrics}
                totalCampuses={totalCampuses}
                countryDCStats={countryDCStats}
                density={panelDensity}
              />
            ) : top?.kind === 'operator' ? (
              <OperatorPanel
                name={top.name}
                canBack={canBack}
                onBack={back}
                onClose={closeAll}
                onOpenCampus={handleOpenCampus}
                campusMetrics={precomputedMetrics}
              />
            ) : (
              <DetailsPanel
                dc={activeDC}
                canBack={canBack}
                onBack={back}
                onClose={closeAll}
                onOpenOperator={openOperator}
                simCapacityMW={simCapacityMW}
                onCapacityChange={handleCapacityChange}
                onFlyTo={handleFlyTo}
              />
            )}
          </SidePanelFrame>
          <MapView
            ref={mapViewRef}
            dataCenters={simDCs}
            countryGroups={countryGroups}
            selectedDC={activeDC}
            onSelectDC={handleSelectDC}
            onSelectCountry={openCountryFromMap}
            simulationActive={simActive}
            onMapClick={handleMapClick}
            operatorCampuses={operatorCampuses}
            theme={theme}
            activeLayer={activeLayer}
            showHeatmap={showHeatmap}
            showIris={showIris}
            showDots={showDots}
            layerOpacity={layerOpacity}
          />
        </div>
      </main>
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
