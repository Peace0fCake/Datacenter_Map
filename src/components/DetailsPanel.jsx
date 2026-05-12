import { useState } from 'react';
import { waterStressLabel, getCarbonData } from '../lib/model';

// Logarithmic slider: internal range 0–100 maps to 1–500 MW.
// Gives fine resolution at small sizes, still reaches hyperscale campus.
const SIM_SLIDER_MAX = 100;

function sliderToMW(pos) {
  // 0→1 MW, 50→~22 MW, 74→~100 MW, 100→500 MW
  return Math.max(1, Math.round(Math.pow(500, pos / 100)));
}
function mwToSlider(mw) {
  return Math.round(Math.log(Math.max(1, mw)) / Math.log(500) * 100);
}

const SLIDER_MARKS = [
  { pos: 0,   label: '1' },
  { pos: 37,  label: '10' },
  { pos: 63,  label: '50' },
  { pos: 74,  label: '100' },
  { pos: 100, label: '500 MW' },
];

function SectionLabel({ children }) {
  return <div className="section-label">{children}</div>;
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
      <div className="ws-header">WRI Aqueduct — Baseline Water Stress</div>
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

function CountryPanel({ country, onClose }) {
  const fossilPct = 100 - (country.carbon.renewables_pct ?? 0) - (country.carbon.nuclear_pct ?? 0);
  return (
    <>
      <div className="panel-header">
        <div className="panel-title-group">
          <h2>{country.carbon.name ?? country.countryCode}</h2>
          <span className="panel-operator">Country overview</span>
        </div>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="panel-tags">
        <span className="tag tag-country">{country.countryCode}</span>
      </div>
      <div className="panel-section">
        <SectionLabel>Data Centers</SectionLabel>
        <div className="card-grid">
          <div className="metric-card">
            <div className="card-icon">🏢</div>
            <BigNumber value={country.dcCount} unit="DCs" sub="mapped in OSM" />
          </div>
          <div className="metric-card">
            <div className="card-icon">⚡</div>
            <BigNumber value={country.totalCapacityMW.toLocaleString()} unit="MW" sub="total IT capacity est." />
          </div>
        </div>
      </div>
      <div className="panel-section">
        <SectionLabel>Grid · Ember Climate 2023</SectionLabel>
        <div className="co2-card">
          <BigNumber value={country.carbon.intensity_gco2_kwh} unit="gCO₂/kWh" />
          <div className="clean-bar-wrap" style={{ marginTop: 10 }}>
            <div className="clean-bar-header">
              <span>Low-carbon share</span>
              <span style={{ color: '#22c55e' }}>{(country.carbon.renewables_pct ?? 0) + (country.carbon.nuclear_pct ?? 0)}%</span>
            </div>
            <div className="clean-bar">
              <div className="clean-fill" style={{ width: `${(country.carbon.renewables_pct ?? 0) + (country.carbon.nuclear_pct ?? 0)}%` }} />
            </div>
          </div>
          <ElectricityMixBar
            renewablesPct={country.carbon.renewables_pct ?? 0}
            nuclearPct={country.carbon.nuclear_pct ?? 0}
            fossilPct={fossilPct}
          />
        </div>
      </div>
    </>
  );
}

export function DetailsPanel({ dc, country, onClose, simCapacityMW, onCapacityChange }) {
  const [mixOpen, setMixOpen] = useState(false);
  const [sliderPos, setSliderPos] = useState(() => mwToSlider(simCapacityMW));

  const handleSlider = (e) => {
    const pos = Number(e.target.value);
    setSliderPos(pos);
    onCapacityChange(sliderToMW(pos));
  };
  const isOpen = dc !== null || country !== null;
  const m = dc?.metrics;
  const ws = waterStressLabel(dc?.waterStress?.score);
  const isSimulation = dc?.source === 'simulation';

  const householdsPerDay = m ? Math.round(m.euHouseholds / 365) : 0;

  return (
    <div className={`details-panel-wrapper ${isOpen ? 'open' : ''}`}>
      <div className="details-panel">
        {country && !dc && (
          <CountryPanel country={country} onClose={onClose} />
        )}
        {dc && (
          <>
            {/* Header */}
            <div className="panel-header">
              <div className="panel-title-group">
                <h2 title={dc.name}>{dc.name}</h2>
                {dc.operator && <span className="panel-operator">{dc.operator}</span>}
                <div className="panel-source">
                  {dc.source === 'osm' && dc.sourceUrl
                    ? <a href={dc.sourceUrl} target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
                    : dc.source === 'osm'
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
            </div>

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
                  <span className="sim-scale-band">Colo</span>
                  <span className="sim-scale-band">Hyperscale</span>
                  <span className="sim-scale-band">Campus</span>
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
                    <span className="cal-badge">Reported</span>
                    PUE{m.wueReported ? ' & WUE' : ''} from {dc.calibrationSource}
                  </div>
                )}

                {/* Electricity + Households */}
                <div className="panel-section">
                  <SectionLabel>Electricity</SectionLabel>
                  <div className="card-grid">
                    <div className="metric-card">
                      <div className="card-icon">⚡</div>
                      <BigNumber value={m.totalEnergyMWh.toLocaleString()} unit="MWh/yr" />
                      <CoolingBar coolingRatio={m.coolingRatio} />
                      <div className="card-pue">
                        PUE {m.pue}
                        <span className={`data-badge ${m.pueReported ? 'reported' : 'est'}`}>
                          {m.pueReported ? 'reported' : 'est.'}
                        </span>
                      </div>
                    </div>
                    <div className="metric-card">
                      <div className="card-icon">🏠</div>
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
                  <SectionLabel>CO₂ Emissions</SectionLabel>
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
                          WUE {m.wue} L/kWh
                          <span className={`data-badge ${m.wueReported ? 'reported' : 'est'}`}>
                            {m.wueReported ? 'reported' : 'est.'}
                          </span>
                        </>
                      }
                    />
                    <WaterStressSection dc={dc} ws={ws} />
                  </div>
                </div>

                <div className="panel-footer">
                  <span>PUE {m.pue} · {m.avgTempC}°C avg · {(m.utilizationRate * 100).toFixed(0)}% util.</span>
                  <span className="model-note">estimated</span>
                </div>
              </>
            ) : (
              <>
                {/* No capacity data — show what we do have */}
                <div className="no-capacity-notice">
                  <span className="no-cap-icon">📊</span>
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
                      <SectionLabel>Grid · Ember Climate 2023</SectionLabel>
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
          </>
        )}
      </div>
    </div>
  );
}
