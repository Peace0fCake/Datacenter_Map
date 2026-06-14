import { useState, useEffect, useCallback, useRef } from 'react';
import { waterStressLabel, getCarbonData } from '../lib/model';
import { InfoTip, GLOSSARY } from './InfoTip';
import { OperatorPanel } from './OperatorPanel';

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

function PipelineBar({ pipeline }) {
  const total = pipeline.current_mw + pipeline.construction_mw + pipeline.planned_mw;
  if (!total) return null;
  const pCurrent = (pipeline.current_mw / total * 100).toFixed(1);
  const pConst   = (pipeline.construction_mw / total * 100).toFixed(1);
  const pPlanned = (pipeline.planned_mw / total * 100).toFixed(1);
  return (
    <div className="pipeline-card">
      <div className="pipeline-bar">
        <div className="pipeline-seg pipeline-current" style={{ width: `${pCurrent}%` }} title={`Operating: ${pipeline.current_mw} MW`} />
        <div className="pipeline-seg pipeline-construction" style={{ width: `${pConst}%` }} title={`Construction: ${pipeline.construction_mw} MW`} />
        <div className="pipeline-seg pipeline-planned" style={{ width: `${pPlanned}%` }} title={`Planned: ${pipeline.planned_mw} MW`} />
      </div>
      <div className="pipeline-rows">
        <div className="pipeline-row">
          <span className="pipeline-dot pipeline-current" />
          <span className="pipeline-row-label">Operating</span>
          <span className="pipeline-row-mw">{pipeline.current_mw.toLocaleString()} MW</span>
        </div>
        <div className="pipeline-row">
          <span className="pipeline-dot pipeline-construction" />
          <span className="pipeline-row-label">Under construction</span>
          <span className="pipeline-row-mw">{pipeline.construction_mw.toLocaleString()} MW</span>
        </div>
        <div className="pipeline-row">
          <span className="pipeline-dot pipeline-planned" />
          <span className="pipeline-row-label">Announced / planned</span>
          <span className="pipeline-row-mw">{pipeline.planned_mw.toLocaleString()} MW</span>
        </div>
      </div>
      <div className="pipeline-total">
        {total.toLocaleString()} MW total pipeline · <span className="pipeline-src">CBRE / DCD 2024</span>
      </div>
    </div>
  );
}

const TYPE_LABEL = { hyperscaler: 'Hyperscaler', cloud: 'Cloud', colocation: 'Colo', carrier: 'Carrier', enterprise: 'Enterprise' };
const TYPE_CLASS = { hyperscaler: 'type-hyper', cloud: 'type-cloud', colocation: 'type-colo', carrier: 'type-carrier', enterprise: 'type-enterprise' };

function CountryPanel({ country, onClose, onFlyTo, onOperatorClick }) {
  const [opSort, setOpSort] = useState('mw'); // 'mw' | 'count'

  const fossilPct = 100 - (country.carbon.renewables_pct ?? 0) - (country.carbon.nuclear_pct ?? 0);
  const osm      = country.osm;
  const pipeline = country.pipeline ?? null;
  const dcPower  = country.dcPower;
  const footprintHa = osm?.total_footprint_m2 ? (osm.total_footprint_m2 / 10_000).toFixed(1) : null;
  const topCampuses  = osm?.top_campuses  ?? [];
  const rawOperators = osm?.top_operators ?? [];
  const typeCounts   = osm?.type_counts   ?? {};
  const maxCap       = topCampuses[0]?.cap_mw ?? 1;

  const topOperators = [...rawOperators].sort((a, b) =>
    opSort === 'mw' ? (b.cap_mw ?? 0) - (a.cap_mw ?? 0) : b.count - a.count
  );
  const maxOpVal = opSort === 'mw'
    ? (topOperators[0]?.cap_mw ?? 1)
    : (topOperators[0]?.count  ?? 1);

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
        {Object.entries(typeCounts).filter(([,n]) => n > 0).map(([t, n]) => (
          GLOSSARY[t]
            ? <InfoTip key={t} id={t}><span className={`tag dc-type-tag ${TYPE_CLASS[t]}`}>{TYPE_LABEL[t]} {n}</span></InfoTip>
            : <span key={t} className={`tag dc-type-tag ${TYPE_CLASS[t]}`}>{TYPE_LABEL[t]} {n}</span>
        ))}
      </div>
      <div className="panel-section">
        <SectionLabel>Data Centers · OSM</SectionLabel>
        <div className="card-grid">
          <div className="metric-card">
            <div className="card-icon">🏢</div>
            <BigNumber value={(osm?.campus_count ?? country.dcCount).toLocaleString()} unit="campuses" sub={osm ? `${osm.building_count} data rooms` : 'mapped in OSM'} />
          </div>
          <div className="metric-card">
            <div className="card-icon">⬛</div>
            <BigNumber value={footprintHa ?? '—'} unit={footprintHa ? 'ha' : ''} sub="total mapped footprint" />
          </div>
        </div>
        {dcPower && (
          <div className="country-power-row">
            <div className="country-power-main">
              <span className="country-power-val">{dcPower.twh} TWh/yr</span>
              <span className="country-power-label">estimated DC electricity</span>
            </div>
            <div className="country-power-meta">
              <span>{dcPower.pct_national}% of national grid</span>
              {dcPower.url
                ? <a href={dcPower.url} target="_blank" rel="noopener noreferrer"
                     className={`data-badge data-badge-link ${dcPower.confidence === 'high' ? 'reported' : 'est'}`}>
                    {dcPower.source} ↗
                  </a>
                : <span className={`data-badge ${dcPower.confidence === 'high' ? 'reported' : 'est'}`}>
                    {dcPower.source}
                  </span>
              }
            </div>
            {dcPower.confidence === 'low' && (
              <p className="country-power-warning">
                Derived estimate only — actual 2024 consumption likely 20–40% higher due to AI infrastructure growth.
              </p>
            )}
          </div>
        )}
      </div>

      {topCampuses.length > 0 && (
        <div className="panel-section">
          <SectionLabel><InfoTip id="campus">Largest campuses by est. capacity (OSM)</InfoTip></SectionLabel>
          <div className="campus-ranking">
            {topCampuses.map((c, i) => {
              const canFly = c.lat && c.lon;
              return (
                <div
                  key={c.id ?? i}
                  className={`campus-rank-row ${canFly ? 'campus-rank-row--link' : ''}`}
                  onClick={canFly ? () => onFlyTo?.({ lat: c.lat, lng: c.lon, zoom: 15 }) : undefined}
                  title={canFly ? `Zoom to ${c.name}` : undefined}
                >
                  <span className="rank-num">{i + 1}</span>
                  <div className="rank-info">
                    <div className="rank-name-row">
                      <span className="rank-name">{c.name}</span>
                      <span className={`rank-type ${TYPE_CLASS[c.type]}`}>{TYPE_LABEL[c.type]}</span>
                    </div>
                    <div className="rank-bar-row">
                      <div className="rank-bar-track">
                        <div
                          className={`rank-bar-fill ${TYPE_CLASS[c.type]}`}
                          style={{ width: `${Math.round((c.cap_mw ?? 0) / maxCap * 100)}%` }}
                        />
                      </div>
                      <span className="rank-mw">{c.cap_mw != null ? `${c.cap_mw} MW` : `${(c.fp_m2 / 10000).toFixed(1)} ha`}</span>
                    </div>
                  </div>
                  {canFly && <span className="rank-fly">↗</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {topOperators.length > 0 && (
        <div className="panel-section">
          <div className="section-label-row">
            <SectionLabel>Operators</SectionLabel>
            <div className="sort-toggle">
              <button
                className={`sort-btn ${opSort === 'mw' ? 'active' : ''}`}
                onClick={() => setOpSort('mw')}
              >by MW</button>
              <button
                className={`sort-btn ${opSort === 'count' ? 'active' : ''}`}
                onClick={() => setOpSort('count')}
              >by campuses</button>
            </div>
          </div>
          <div className="campus-ranking">
            {topOperators.map((op, i) => (
              <div
                key={op.name}
                className="campus-rank-row campus-rank-row--link"
                onClick={() => onOperatorClick?.(op.name)}
                title={`View ${op.name} operator page`}
              >
                <span className="rank-num">{i + 1}</span>
                <div className="rank-info">
                  <div className="rank-name-row">
                    <span className="rank-name">{op.name}</span>
                    <span className={`rank-type ${TYPE_CLASS[op.type]}`}>{TYPE_LABEL[op.type]}</span>
                  </div>
                  <div className="rank-bar-row">
                    <div className="rank-bar-track">
                      <div
                        className={`rank-bar-fill ${TYPE_CLASS[op.type]}`}
                        style={{ width: `${Math.round((opSort === 'mw' ? (op.cap_mw ?? 0) : op.count) / maxOpVal * 100)}%` }}
                      />
                    </div>
                    <span className="rank-mw">
                      {opSort === 'mw'
                        ? `${op.cap_mw ? `${op.cap_mw} MW · ` : ''}${op.count} campus${op.count !== 1 ? 'es' : ''}`
                        : `${op.count} campus${op.count !== 1 ? 'es' : ''}${op.cap_mw ? ` · ${op.cap_mw} MW` : ''}`
                      }
                    </span>
                  </div>
                </div>
                <span className="rank-fly">↗</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pipeline && (
        <div className="panel-section">
          <SectionLabel>Capacity Pipeline</SectionLabel>
          <PipelineBar pipeline={pipeline} />
        </div>
      )}

      <div className="panel-section">
        <SectionLabel>Grid · <a href="https://ember-climate.org/insights/research/global-electricity-review-2024/" target="_blank" rel="noopener noreferrer" className="source-link">Ember 2024</a> (2023 data)</SectionLabel>
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

export function DetailsPanel({ dc, country, onClose, simCapacityMW, onCapacityChange, onFlyTo }) {
  const [mixOpen, setMixOpen] = useState(false);
  const [sliderPos, setSliderPos] = useState(() => mwToSlider(simCapacityMW));
  const [operatorName, setOperatorName] = useState(null);

  // Clear operator panel when country changes
  useEffect(() => { setOperatorName(null); }, [country?.countryCode]);

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
  const isOpen = dc !== null || country !== null;
  const m = dc?.metrics;
  const ws = waterStressLabel(dc?.waterStress?.score);
  const isSimulation = dc?.source === 'simulation';

  const householdsPerDay = m ? Math.round(m.euHouseholds / 365) : 0;

  return (
    <div className={`details-panel-wrapper ${isOpen ? 'open' : ''}`} style={{ width: panelW }}>
      <div className="details-panel">
        {country && !dc && operatorName && (
          <OperatorPanel
            name={operatorName}
            onBack={() => setOperatorName(null)}
            onFlyTo={onFlyTo}
          />
        )}
        {country && !dc && !operatorName && (
          <CountryPanel
            country={country}
            onClose={onClose}
            onFlyTo={onFlyTo}
            onOperatorClick={setOperatorName}
          />
        )}
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
            </div>

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
                      <div className="card-icon">⚡</div>
                      <BigNumber value={m.totalEnergyMWh.toLocaleString()} unit="MWh/yr" />
                      <InfoTip id="itLoad"><CoolingBar coolingRatio={m.coolingRatio} /></InfoTip>
                      <div className="card-pue">
                        <InfoTip id="pue">PUE</InfoTip> {m.pue}
                        <ReportedBadge reported={m.pueReported} url={dc.calibrationSourceUrl} />
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
                          <InfoTip id="wue">WUE</InfoTip> {m.wue} L/kWh
                          <ReportedBadge reported={m.wueReported} url={dc.calibrationSourceUrl} />
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
          </>
        )}
      </div>
      {isOpen && (
        <div className="panel-resize-handle" onMouseDown={startPanelResize} title="Drag to resize" />
      )}
    </div>
  );
}
