import { useState, useCallback, useRef } from 'react';
import { waterStressLabel, getCarbonData } from '../lib/model';
import { InfoTip, HoverDef } from './InfoTip';
import { SuggestPanel } from './SuggestPanel';
import { useSuggestions } from '../hooks/useSuggestions';

const TYPE_LABEL = { hyperscaler: 'Hyperscaler', cloud: 'Cloud', colocation: 'Colo', carrier: 'Carrier', enterprise: 'Enterprise' };
const TYPE_CLASS = { hyperscaler: 'type-hyper', cloud: 'type-cloud', colocation: 'type-colo', carrier: 'type-carrier', enterprise: 'type-enterprise' };

// Logarithmic slider: internal range 0–100 maps to 1–5,000 MW.
// Covers edge DCs up to the largest planned mega-campus (~5 GW, Stargate-scale).
const SIM_SLIDER_MAX = 100;

function sliderToMW(pos) {
  return Math.max(1, Math.round(Math.pow(5000, pos / 100)));
}
function mwToSlider(mw) {
  return Math.round(Math.log(Math.max(1, mw)) / Math.log(5000) * 100);
}

const SLIDER_MARKS = [
  { pos: 0,   label: '1' },
  { pos: 27,  label: '10' },
  { pos: 54,  label: '100' },
  { pos: 81,  label: '1k' },
  { pos: 100, label: '5k MW' },
];

function SectionLabel({ children }) {
  return <div className="section-label">{children}</div>;
}

function ReportedBadge({ reported, url }) {
  if (!reported) return <span className="data-badge est">est.</span>;
  if (url) return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="data-badge reported data-badge-link">
      reported ↗
    </a>
  );
  return <span className="data-badge reported">reported</span>;
}

function BigNumber({ value, unit, sub }) {
  return (
    <div className="big-number">
      <div className="big-inline">
        <span className="big-val">{value}</span>
        <span className="big-unit">{unit}</span>
      </div>
      {sub && <span className="big-sub">{sub}</span>}
    </div>
  );
}

function CoolingBar({ coolingRatio }) {
  const itPct = Math.round((1 - coolingRatio) * 100);
  const coolPct = Math.round(coolingRatio * 100);
  return (
    <div className="cooling-bar-wrap">
      <div className="cooling-bar">
        <div className="cooling-seg it-seg" style={{ width: `${itPct}%` }} title={`IT load: ${itPct}%`} />
        <div className="cooling-seg cool-seg" style={{ width: `${coolPct}%` }} title={`Cooling: ${coolPct}%`} />
      </div>
      <div className="cooling-legend">
        <span><span className="dot it-dot" />IT load {itPct}%</span>
        <span><span className="dot cool-dot" />Cooling {coolPct}%</span>
      </div>
    </div>
  );
}

function ElectricityMixBar({ renewablesPct, nuclearPct, fossilPct }) {
  const segments = [
    { label: 'Renewable', pct: renewablesPct, color: '#22c55e' },
    { label: 'Nuclear',   pct: nuclearPct,    color: '#818cf8' },
    { label: 'Fossil',    pct: fossilPct,     color: '#f97316' },
  ].filter(s => s.pct > 0);

  return (
    <div className="mix-bar-wrap">
      <div className="mix-bar">
        {segments.map(s => (
          <div
            key={s.label}
            className="mix-seg"
            style={{ width: `${s.pct}%`, background: s.color }}
            title={`${s.label}: ${s.pct}%`}
          />
        ))}
      </div>
      <div className="mix-legend">
        {segments.map(s => (
          <span key={s.label}>
            <span className="dot" style={{ background: s.color }} />{s.label} {s.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

function WaterStressSection({ dc, ws }) {
  return (
    <div className="ws-section">
      <div className="ws-header"><InfoTip id="waterStress">WRI Aqueduct — Baseline Water Stress</InfoTip></div>
      {dc.waterStress?.score != null ? (
        <>
          <WaterStressGauge score={dc.waterStress.score} label={ws.label} color={ws.color} />
          <p className="ws-context">
            This watershed already withdraws{' '}
            <strong style={{ color: ws.color }}>{dc.waterStress.score.toFixed(1)}×</strong>{' '}
            its annual renewable water supply.
          </p>
        </>
      ) : (
        <span className="ws-loading">Aqueduct data unavailable</span>
      )}
    </div>
  );
}

function WaterStressGauge({ score, label, color }) {
  const level = Math.min(Math.round(score ?? 0), 5);
  return (
    <div className="ws-gauge">
      <div className="ws-dots">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className="ws-dot"
            style={{ background: i <= level ? color : 'var(--surface2)' }}
          />
        ))}
      </div>
      <span className="ws-label" style={{ color }}>{label}</span>
      {score != null && (
        <span className="ws-score">{score.toFixed(1)}/5</span>
      )}
    </div>
  );
}

export function DetailsPanel({ dc, onClose, simCapacityMW, onCapacityChange, onFlyTo }) {
  const [mixOpen, setMixOpen] = useState(false);
  const [sliderPos, setSliderPos] = useState(() => mwToSlider(simCapacityMW));

  // ── Panel resize ────────────────────────────────────────────────────────
  const [panelW, setPanelW] = useState(340);
  const panelWRef = useRef(panelW);
  panelWRef.current = panelW;
  const startPanelResize = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWRef.current;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    const onMove = (me) => setPanelW(Math.max(240, Math.min(640, startW + me.clientX - startX)));
    const onUp   = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const handleSlider = (e) => {
    const pos = Number(e.target.value);
    setSliderPos(pos);
    onCapacityChange(sliderToMW(pos));
  };

  const isOpen = dc !== null;
  const m = dc?.metrics;
  const ws = waterStressLabel(dc?.waterStress?.score);
  const isSimulation = dc?.source === 'simulation';
  const householdsPerDay = m ? Math.round(m.euHouseholds / 365) : 0;

  // Community data — lifted here so we can drive discrepancy detection + value overrides
  const { suggestions, topSuggestion, submit, vote } = useSuggestions(dc?.id ?? '');

  const communityPUE = topSuggestion?.pue ?? null;
  const communityWUE = topSuggestion?.wue ?? null;
  const communityCapMW = topSuggestion?.capacity_mw ?? null;

  // Discrepancy: reported operator value AND community says something meaningfully different
  const hasDiscrepancy = !isSimulation && topSuggestion && m && (
    (communityPUE    != null && m.pueReported && Math.abs(communityPUE - m.pue) > 0.2) ||
    (communityWUE    != null && m.wueReported && Math.abs(communityWUE - m.wue) > 0.5) ||
    (communityCapMW  != null && dc.capacityMW != null &&
      Math.abs(communityCapMW - dc.capacityMW) / dc.capacityMW > 0.3)
  );

  return (
    <div className={`details-panel-wrapper ${isOpen ? 'open' : ''}`} style={{ width: panelW }}>
      <div className="details-panel">
        {dc && (
          <>
            {/* Header */}
            <div className="panel-header">
              <div className="panel-title-group">
                <h2 title={dc.name}>{dc.name}</h2>
                <span className={`panel-operator ${!dc.operator ? 'no-operator' : ''}`}>
                  {dc.operator ?? 'No operator indicated'}
                </span>
                <div className="panel-source">
                  {(dc.source === 'osm' || dc.source === 'campus') && dc.sourceUrl
                    ? <a href={dc.sourceUrl} target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
                    : (dc.source === 'osm' || dc.source === 'campus')
                    ? <span>OpenStreetMap</span>
                    : dc.source === 'simulation'
                    ? <span>Simulation</span>
                    : <span>Fallback dataset</span>
                  }
                </div>
              </div>
              <button className="panel-close" onClick={onClose}>✕</button>
            </div>

            {/* Tags */}
            <div className="panel-tags">
              {(m?.countryName || dc.countryCode) && (
                <span className="tag tag-country">{m?.countryName ?? dc.countryCode}</span>
              )}
              {isSimulation && <span className="tag tag-sim">Simulation</span>}
              {dc.source === 'fallback' && <span className="tag tag-fallback">OSM fallback</span>}
              {dc.isSite
                ? <span className="tag tag-site">Campus · {dc.buildingCount} buildings</span>
                : !isSimulation && dc.source !== 'fallback' && <span className="tag tag-dc">Data Center</span>
              }
              {!isSimulation && (dc.dcType || m?.dcType) && (
                <HoverDef id={dc.dcType || m.dcType}>
                  <span className={`tag dc-type-tag ${TYPE_CLASS[dc.dcType || m.dcType]}`}>
                    {TYPE_LABEL[dc.dcType || m.dcType]}
                  </span>
                </HoverDef>
              )}
              {topSuggestion?.facility_type && topSuggestion.facility_type !== 'unknown' && (
                <span className="tag tag-community-facility" title="Community-reported facility type">
                  {topSuggestion.facility_type}
                </span>
              )}
              {topSuggestion?.operator_type && topSuggestion.operator_type !== 'unknown' && (
                <span className="tag tag-community-op" title="Community-reported operator type">
                  {topSuggestion.operator_type}
                </span>
              )}
            </div>

            {/* Discrepancy banner */}
            {hasDiscrepancy && (
              <div className="community-discrepancy">
                <span className="discrepancy-icon">⚠</span>
                <span>Community data differs from reported values</span>
                <div className="discrepancy-details">
                  {communityPUE    != null && m.pueReported && Math.abs(communityPUE - m.pue) > 0.2 &&
                    <span>PUE: reported {m.pue} · community {communityPUE}</span>}
                  {communityWUE    != null && m.wueReported && Math.abs(communityWUE - m.wue) > 0.5 &&
                    <span>WUE: reported {m.wue} · community {communityWUE}</span>}
                  {communityCapMW  != null && dc.capacityMW != null &&
                    Math.abs(communityCapMW - dc.capacityMW) / dc.capacityMW > 0.3 &&
                    <span>Capacity: reported {dc.capacityMW} MW · community {communityCapMW} MW</span>}
                </div>
              </div>
            )}

            {/* Footprint */}
            {dc.footprintM2 > 0 && (
              <div className="panel-footprint">
                <span className="footprint-icon">⬛</span>
                <span className="footprint-val">
                  {dc.footprintM2 >= 10_000
                    ? `${(dc.footprintM2 / 10_000).toFixed(2)} ha`
                    : `${dc.footprintM2.toLocaleString()} m²`}
                </span>
                {dc.isSite
                  ? <span className="footprint-label">combined data center area · {dc.buildingCount} buildings</span>
                  : <span className="footprint-label">data center area</span>
                }
              </div>
            )}

            {/* Member buildings list for campus sites */}
            {dc.isSite && dc.memberBuildings?.length > 0 && (
              <div className="panel-section">
                <SectionLabel>Buildings in this campus</SectionLabel>
                <div className="member-list">
                  {dc.memberBuildings.map(b => (
                    <div key={b.osm_id} className="member-item">
                      <span className="member-name">{b.name || 'Unnamed building'}</span>
                      <span className="member-meta">
                        {b.footprint_m2 ? `${Math.round(b.footprint_m2).toLocaleString()} m²` : '—'}
                        {b.osm_url && (
                          <a href={b.osm_url} target="_blank" rel="noopener noreferrer" className="member-osm-link">OSM ↗</a>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="member-note">
                  Footprint and power estimates are the sum of individual buildings.
                  The campus boundary polygon is excluded from calculations.
                </p>
              </div>
            )}

            {/* Simulation capacity slider */}
            {isSimulation && (
              <div className="sim-slider-section">
                <div className="sim-slider-header">
                  <span>IT Capacity</span>
                  <span className="sim-slider-val">{simCapacityMW} MW</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={SIM_SLIDER_MAX}
                  step="1"
                  value={sliderPos}
                  onChange={handleSlider}
                  className="mw-slider"
                />
                <div className="slider-marks-abs">
                  {SLIDER_MARKS.map(({ pos, label }) => (
                    <span key={pos} style={{ left: `${pos}%` }}>{label}</span>
                  ))}
                </div>
                <div className="sim-scale-hint">
                  <span className="sim-scale-band">Edge</span>
                  <span className="sim-scale-band">Enterprise</span>
                  <span className="sim-scale-band">Hyperscale</span>
                  <span className="sim-scale-band">Mega</span>
                </div>
              </div>
            )}

            {/* dc.waterStress === undefined means enrichment hasn't completed yet */}
            {dc.waterStress === undefined ? (
              <div className="panel-loading">
                <span className="spinner" />Fetching local data…
              </div>
            ) : m ? (
              <>
                {/* Calibration notice */}
                {dc.calibrationSource && (
                  <div className="calibration-notice">
                    {dc.calibrationSourceUrl
                      ? <a href={dc.calibrationSourceUrl} target="_blank" rel="noopener noreferrer" className="cal-badge cal-badge-link">Reported ↗</a>
                      : <span className="cal-badge">Reported</span>
                    }
                    PUE{m.wueReported ? ' & WUE' : ''} from {dc.calibrationSource}
                  </div>
                )}

                {/* Electricity + Households */}
                <div className="panel-section">
                  <SectionLabel><InfoTip id="totalEnergyMWh">Electricity</InfoTip></SectionLabel>
                  <div className="card-grid">
                    <div className="metric-card">
                      <div className="card-icon card-icon-energy" />
                      <BigNumber value={m.totalEnergyMWh.toLocaleString()} unit="MWh/yr" />
                      <InfoTip id="itLoad"><CoolingBar coolingRatio={m.coolingRatio} /></InfoTip>
                      <div className="card-pue">
                        <InfoTip id="pue">PUE</InfoTip>{' '}
                        {communityPUE != null ? (
                          <>
                            <span className="community-val">{communityPUE}</span>
                            <span className="data-badge community-badge">community</span>
                            {m.pueReported && <span className="community-orig">(reported: {m.pue})</span>}
                          </>
                        ) : (
                          <>{m.pue}<ReportedBadge reported={m.pueReported} url={dc.calibrationSourceUrl} /></>
                        )}
                      </div>
                    </div>
                    <div className="metric-card">
                      <div className="card-icon card-icon-home" />
                      <BigNumber
                        value={m.euHouseholds.toLocaleString()}
                        unit="homes/yr"
                        sub={householdsPerDay > 0 ? `≈ ${householdsPerDay}/day` : null}
                      />
                      <div className="card-note">EU avg 3,500 kWh/yr</div>
                    </div>
                  </div>
                </div>

                {/* CO2 */}
                <div className="panel-section">
                  <SectionLabel><InfoTip id="carbonIntensity">CO₂ Emissions</InfoTip></SectionLabel>
                  <div className="co2-card">
                    <div className="co2-main">
                      <BigNumber value={m.co2TonnesPerYear.toLocaleString()} unit="tCO₂eq/yr" />
                      <span className="co2-intensity">{m.countryName} grid · {m.carbonIntensity} gCO₂/kWh</span>
                    </div>
                    <div className="clean-bar-wrap">
                      <div className="clean-bar-header">
                        <span>Low-carbon share</span>
                        <span style={{ color: '#22c55e' }}>{m.renewablesPct + m.nuclearPct}%</span>
                      </div>
                      <div className="clean-bar">
                        <div className="clean-fill" style={{ width: `${m.renewablesPct + m.nuclearPct}%` }} />
                      </div>
                    </div>
                    <button className="mix-toggle" onClick={() => setMixOpen(v => !v)}>
                      <span>Electricity sources</span>
                      <span className={`chevron ${mixOpen ? 'open' : ''}`}>›</span>
                    </button>
                    {mixOpen && (
                      <ElectricityMixBar
                        renewablesPct={m.renewablesPct}
                        nuclearPct={m.nuclearPct}
                        fossilPct={m.fossilPct}
                      />
                    )}
                  </div>
                </div>

                {/* Water */}
                <div className="panel-section">
                  <SectionLabel>Water</SectionLabel>
                  <div className="water-card">
                    <BigNumber
                      value={m.waterM3PerYear.toLocaleString()}
                      unit="m³/yr"
                      sub={
                        <>
                          <InfoTip id="wue">WUE</InfoTip>{' '}
                          {communityWUE != null ? (
                            <>
                              <span className="community-val">{communityWUE}</span> L/kWh
                              <span className="data-badge community-badge">community</span>
                              {m.wueReported && <span className="community-orig">(reported: {m.wue})</span>}
                            </>
                          ) : (
                            <>{m.wue} L/kWh<ReportedBadge reported={m.wueReported} url={dc.calibrationSourceUrl} /></>
                          )}
                        </>
                      }
                    />
                    <WaterStressSection dc={dc} ws={ws} />
                  </div>
                </div>

                <div className="panel-footer">
                  <span>PUE {m.pue} · {m.avgTempC}°C avg · {(m.utilizationRate * 100).toFixed(0)}% util.</span>
                  <span className="model-note">
                    {dc.footprintM2
                      ? <InfoTip id="allocatedPower">
                          {dc.isSite ? 'building areas · ' : 'area model · '}
                          <a href="https://publications.jrc.ec.europa.eu/repository/handle/JRC135926" target="_blank" rel="noopener noreferrer" className="source-link">JRC 2023</a>
                        </InfoTip>
                      : 'capacity model'}
                  </span>
                </div>
              </>
            ) : (
              <>
                {/* No capacity data — show what we do have */}
                <div className="no-capacity-notice">
                  <span className="no-cap-icon" />
                  <div>
                    <strong>No capacity data available</strong>
                    <p>IT capacity is not publicly disclosed for this facility. Energy, CO₂ and water estimates require it.</p>
                    <p className="no-cap-hint">Use <strong>Simulation mode</strong> to model any location with a custom capacity.</p>
                  </div>
                </div>

                {/* Grid info — available from Ember data regardless of capacity */}
                {dc.countryCode && (() => {
                  const carbon = getCarbonData(dc.countryCode);
                  const fossilPct = 100 - carbon.renewables_pct - (carbon.nuclear_pct ?? 0);
                  return (
                    <div className="panel-section">
                      <SectionLabel>Grid · <a href="https://ember-climate.org/insights/research/global-electricity-review-2024/" target="_blank" rel="noopener noreferrer" className="source-link">Ember 2024</a> (2023 data)</SectionLabel>
                      <div className="co2-card">
                        <span className="co2-intensity">{carbon.name} · {carbon.intensity_gco2_kwh} gCO₂/kWh</span>
                        <div className="clean-bar-wrap" style={{ marginTop: 8 }}>
                          <div className="clean-bar-header">
                            <span>Low-carbon share</span>
                            <span style={{ color: '#22c55e' }}>{carbon.renewables_pct + (carbon.nuclear_pct ?? 0)}%</span>
                          </div>
                          <div className="clean-bar">
                            <div className="clean-fill" style={{ width: `${carbon.renewables_pct + (carbon.nuclear_pct ?? 0)}%` }} />
                          </div>
                        </div>
                        <ElectricityMixBar
                          renewablesPct={carbon.renewables_pct}
                          nuclearPct={carbon.nuclear_pct ?? 0}
                          fossilPct={fossilPct}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Water stress — always available */}
                <div className="panel-section">
                  <SectionLabel>Water</SectionLabel>
                  <div className="water-card">
                    <WaterStressSection dc={dc} ws={ws} />
                  </div>
                </div>
              </>
            )}
          {!isSimulation && (
            <div className="panel-section suggest-section">
              <SuggestPanel
                dcId={dc.id} dcName={dc.name}
                suggestions={suggestions} submit={submit} vote={vote}
              />
            </div>
          )}
          </>
        )}
      </div>
      {isOpen && (
        <div className="panel-resize-handle" onMouseDown={startPanelResize} title="Drag to resize" />
      )}
    </div>
  );
}
