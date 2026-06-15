import { useState, useEffect, useCallback } from 'react';
import { getCarbonData, getDCWattsPerCapita } from '../lib/model';
import { InfoTip } from './InfoTip';
import { OperatorPanel } from './OperatorPanel';

// ── Shared primitives ────────────────────────────────────────────────────────

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
          <div key={s.label} className="mix-seg" style={{ width: `${s.pct}%`, background: s.color }} title={`${s.label}: ${s.pct}%`} />
        ))}
      </div>
      <div className="mix-legend">
        {segments.map(s => (
          <span key={s.label}><span className="dot" style={{ background: s.color }} />{s.label} {s.pct}%</span>
        ))}
      </div>
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
        <div className="pipeline-seg pipeline-current"      style={{ width: `${pCurrent}%` }} title={`Operating: ${pipeline.current_mw} MW`} />
        <div className="pipeline-seg pipeline-construction" style={{ width: `${pConst}%` }}   title={`Construction: ${pipeline.construction_mw} MW`} />
        <div className="pipeline-seg pipeline-planned"      style={{ width: `${pPlanned}%` }} title={`Planned: ${pipeline.planned_mw} MW`} />
      </div>
      <div className="pipeline-rows">
        <div className="pipeline-row"><span className="pipeline-dot pipeline-current" /><span className="pipeline-row-label">Operating</span><span className="pipeline-row-mw">{pipeline.current_mw.toLocaleString()} MW</span></div>
        <div className="pipeline-row"><span className="pipeline-dot pipeline-construction" /><span className="pipeline-row-label">Under construction</span><span className="pipeline-row-mw">{pipeline.construction_mw.toLocaleString()} MW</span></div>
        <div className="pipeline-row"><span className="pipeline-dot pipeline-planned" /><span className="pipeline-row-label">Announced / planned</span><span className="pipeline-row-mw">{pipeline.planned_mw.toLocaleString()} MW</span></div>
      </div>
      <div className="pipeline-total">{total.toLocaleString()} MW total pipeline · <span className="pipeline-src">CBRE / DCD 2024</span></div>
    </div>
  );
}

const TYPE_LABEL = { hyperscaler: 'Hyperscaler', cloud: 'Cloud', colocation: 'Colo', carrier: 'Carrier', enterprise: 'Enterprise' };
const TYPE_CLASS = { hyperscaler: 'type-hyper', cloud: 'type-cloud', colocation: 'type-colo', carrier: 'type-carrier', enterprise: 'type-enterprise' };
const TYPE_COLOR = { hyperscaler: '#a855f7', cloud: '#22c55e', colocation: '#0ea5e9', carrier: '#eab308', enterprise: '#64748b' };
const TYPE_ORDER = ['hyperscaler', 'cloud', 'colocation', 'carrier', 'enterprise'];

// Stacked bar showing operator type distribution within a country's bar
function TypeStackBar({ typeCounts, widthPct }) {
  const total = Object.values(typeCounts ?? {}).reduce((s, n) => s + n, 0);
  if (!total || widthPct <= 0) return (
    <div className="rank-bar-track" style={{ flex: 1 }}>
      <div className="rank-bar-fill type-hyper" style={{ width: `${widthPct}%` }} />
    </div>
  );
  const segments = TYPE_ORDER
    .filter(t => (typeCounts[t] ?? 0) > 0)
    .map(t => ({ t, pct: (typeCounts[t] / total) * widthPct }));
  return (
    <div className="rank-bar-track" style={{ flex: 1, position: 'relative' }}>
      {segments.map(({ t, pct }, i) => (
        <div key={t} className="rank-bar-fill"
          title={`${TYPE_LABEL[t]}: ${typeCounts[t]} campuses`}
          style={{
            position: i === 0 ? 'relative' : 'absolute',
            left: i === 0 ? undefined : `${segments.slice(0, i).reduce((s, x) => s + x.pct, 0)}%`,
            width: `${pct}%`,
            background: TYPE_COLOR[t],
            height: '100%',
            animation: 'barReveal 0.45s cubic-bezier(0.4,0,0.2,1) both',
          }}
        />
      ))}
    </div>
  );
}

// ── Country panel content ─────────────────────────────────────────────────────

function CountryContent({ country, onFlyTo, onOperatorClick }) {
  const [opSort, setOpSort] = useState('mw');

  const wattsPerCapita = getDCWattsPerCapita(country.countryCode);
  const fossilPct      = 100 - (country.carbon.renewables_pct ?? 0) - (country.carbon.nuclear_pct ?? 0);
  const osm            = country.osm;
  const pipeline       = country.pipeline ?? null;
  const dcPower        = country.dcPower;
  const footprintHa    = osm?.total_footprint_m2 ? (osm.total_footprint_m2 / 10_000).toFixed(1) : null;
  const topCampuses    = osm?.top_campuses  ?? [];
  const rawOperators   = osm?.top_operators ?? [];
  const maxCap         = topCampuses[0]?.cap_mw ?? 1;

  const topOperators = [...rawOperators].sort((a, b) =>
    opSort === 'mw' ? (b.cap_mw ?? 0) - (a.cap_mw ?? 0) : b.count - a.count
  );
  const maxOpVal = opSort === 'mw' ? (topOperators[0]?.cap_mw ?? 1) : (topOperators[0]?.count ?? 1);

  return (
    <div className="cm-body">
      {/* 1. DC stats — campuses, footprint, power */}
      <div className="panel-section">
        <SectionLabel>Data Centers · OSM</SectionLabel>
        <div className="card-grid">
          <div className="metric-card">
            <BigNumber value={(osm?.campus_count ?? country.dcCount).toLocaleString()} unit="campuses" sub={osm ? `${osm.building_count} data rooms` : 'mapped in OSM'} />
          </div>
          <div className="metric-card">
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
                ? <a href={dcPower.url} target="_blank" rel="noopener noreferrer" className={`data-badge data-badge-link ${dcPower.confidence === 'high' ? 'reported' : 'est'}`}>{dcPower.source} ↗</a>
                : <span className={`data-badge ${dcPower.confidence === 'high' ? 'reported' : 'est'}`}>{dcPower.source}</span>
              }
            </div>
            {dcPower.confidence === 'low' && (
              <p className="country-power-warning">Derived estimate only — actual 2024 consumption likely 20–40% higher due to AI infrastructure growth.</p>
            )}
            {wattsPerCapita != null && (
              <div className="country-per-capita">
                <span className="per-capita-val">{wattsPerCapita} W</span>
                <span className="per-capita-label"> per person · avg draw attributed to data centres</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Grid — moved above campuses/operators */}
      <div className="panel-section">
        <SectionLabel>Grid · <a href="https://ember-climate.org/insights/research/global-electricity-review-2024/" target="_blank" rel="noopener noreferrer" className="source-link">Ember 2024</a> (2023 data)</SectionLabel>
        <div className="co2-card">
          <BigNumber value={country.carbon.intensity_gco2_kwh} unit="gCO₂/kWh" />
          <div className="clean-bar-wrap" style={{ marginTop: 10 }}>
            <div className="clean-bar-header">
              <span>Low-carbon share</span>
              <span style={{ color: '#22c55e' }}>{(country.carbon.renewables_pct ?? 0) + (country.carbon.nuclear_pct ?? 0)}%</span>
            </div>
            <div className="clean-bar"><div className="clean-fill" style={{ width: `${(country.carbon.renewables_pct ?? 0) + (country.carbon.nuclear_pct ?? 0)}%` }} /></div>
          </div>
          <ElectricityMixBar renewablesPct={country.carbon.renewables_pct ?? 0} nuclearPct={country.carbon.nuclear_pct ?? 0} fossilPct={fossilPct} />
        </div>
      </div>

      {/* 3. Largest campuses */}
      {topCampuses.length > 0 && (
        <div className="panel-section">
          <SectionLabel><InfoTip id="campus">Largest campuses by est. capacity (OSM)</InfoTip></SectionLabel>
          <div className="campus-ranking">
            {topCampuses.map((c, i) => {
              const canFly = c.lat && c.lon;
              return (
                <div key={c.id ?? i} className={`campus-rank-row ${canFly ? 'campus-rank-row--link' : ''}`}
                  onClick={canFly ? () => onFlyTo?.({ lat: c.lat, lng: c.lon, zoom: 15 }) : undefined}
                  title={canFly ? `Zoom to ${c.name}` : undefined}>
                  <span className="rank-num">{i + 1}</span>
                  <div className="rank-info">
                    <div className="rank-name-row">
                      <span className="rank-name">{c.name}</span>
                      <span className={`rank-type ${TYPE_CLASS[c.type]}`}>{TYPE_LABEL[c.type]}</span>
                    </div>
                    <div className="rank-bar-row">
                      <div className="rank-bar-track">
                        <div className={`rank-bar-fill ${TYPE_CLASS[c.type]}`} style={{ width: `${Math.round((c.cap_mw ?? 0) / maxCap * 100)}%` }} />
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

      {/* 4. Operators */}
      {topOperators.length > 0 && (
        <div className="panel-section">
          <div className="section-label-row">
            <SectionLabel>Operators</SectionLabel>
            <div className="sort-toggle">
              <button className={`sort-btn ${opSort === 'mw' ? 'active' : ''}`} onClick={() => setOpSort('mw')}>by MW</button>
              <button className={`sort-btn ${opSort === 'count' ? 'active' : ''}`} onClick={() => setOpSort('count')}>by campuses</button>
            </div>
          </div>
          <div className="campus-ranking">
            {topOperators.map((op, i) => (
              <div key={op.name} className="campus-rank-row campus-rank-row--link"
                onClick={() => onOperatorClick?.(op.name)} title={`View ${op.name} operator page`}>
                <span className="rank-num">{i + 1}</span>
                <div className="rank-info">
                  <div className="rank-name-row">
                    <span className="rank-name">{op.name}</span>
                    <span className={`rank-type ${TYPE_CLASS[op.type]}`}>{TYPE_LABEL[op.type]}</span>
                  </div>
                  <div className="rank-bar-row">
                    <div className="rank-bar-track">
                      <div className={`rank-bar-fill ${TYPE_CLASS[op.type]}`}
                        style={{ width: `${Math.round((opSort === 'mw' ? (op.cap_mw ?? 0) : op.count) / maxOpVal * 100)}%` }} />
                    </div>
                    <span className="rank-mw">
                      {opSort === 'mw'
                        ? `${op.cap_mw ? `${op.cap_mw} MW · ` : ''}${op.count} campus${op.count !== 1 ? 'es' : ''}`
                        : `${op.count} campus${op.count !== 1 ? 'es' : ''}${op.cap_mw ? ` · ${op.cap_mw} MW` : ''}`}
                    </span>
                  </div>
                </div>
                <span className="rank-fly">↗</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Capacity pipeline */}
      {pipeline && (
        <div className="panel-section">
          <SectionLabel>Capacity Pipeline</SectionLabel>
          <PipelineBar pipeline={pipeline} />
        </div>
      )}
    </div>
  );
}

// ── Europe panel content ──────────────────────────────────────────────────────

function EuropeContent({ europe, onSelectCountry, totalCampuses, countryDCStats }) {
  const [sort, setSort] = useState('twh');
  const sorted = [...europe.countries].sort((a, b) =>
    sort === 'twh' ? b.twh - a.twh : b.pct_national - a.pct_national
  );
  const maxVal = sorted[0]?.[sort === 'twh' ? 'twh' : 'pct_national'] ?? 1;

  // Aggregate type counts across all countries for the legend
  const totalByType = {};
  for (const t of TYPE_ORDER) {
    totalByType[t] = sorted.reduce((s, c) => s + (countryDCStats?.[c.code]?.type_counts?.[t] ?? 0), 0);
  }
  const grandTotal = Object.values(totalByType).reduce((s, n) => s + n, 0);

  return (
    <div className="cm-body">
      <div className="panel-section">
        <SectionLabel>Data Centers · Totals</SectionLabel>
        <div className="card-grid">
          <div className="metric-card"><BigNumber value={totalCampuses.toLocaleString()} unit="campuses" sub="mapped in OSM" /></div>
          <div className="metric-card"><BigNumber value={europe.totalTwh} unit="TWh/yr" sub="est. DC electricity" /></div>
          <div className="metric-card"><BigNumber value={europe.totalCO2Megatonnes} unit="Mt CO₂/yr" sub="est. emissions" /></div>
          <div className="metric-card"><BigNumber value={europe.avgCarbonIntensity} unit="gCO₂/kWh" sub="weighted avg. grid intensity" /></div>
        </div>
        {grandTotal > 0 && (
          <div className="europe-type-legend">
            {TYPE_ORDER.filter(t => (totalByType[t] ?? 0) > 0).map(t => (
              <span key={t} className="europe-type-item">
                <span className="europe-type-dot" style={{ background: TYPE_COLOR[t] }} />
                {TYPE_LABEL[t]}
                <span className="europe-type-count">{totalByType[t]}</span>
              </span>
            ))}
          </div>
        )}
        <p className="member-note" style={{ marginTop: 8 }}>
          Sums national estimates (JRC 2023 / EirGrid / NESO + derived). Actual 2024 consumption is likely 20–40% higher due to AI buildout.
        </p>
      </div>

      <div className="panel-section">
        <div className="section-label-row">
          <SectionLabel>Countries by DC electricity</SectionLabel>
          <div className="sort-toggle">
            <button className={`sort-btn ${sort === 'twh' ? 'active' : ''}`} onClick={() => setSort('twh')}>by TWh</button>
            <button className={`sort-btn ${sort === 'pct' ? 'active' : ''}`} onClick={() => setSort('pct')}>by % grid</button>
          </div>
        </div>
        <div className="campus-ranking">
          {sorted.map((c, i) => {
            const widthPct = Math.round((sort === 'twh' ? c.twh : c.pct_national) / maxVal * 100);
            const tc = countryDCStats?.[c.code]?.type_counts ?? {};
            return (
              <div key={c.code} className="campus-rank-row campus-rank-row--link"
                onClick={() => onSelectCountry?.(c.code)} title={`View ${c.name}`}>
                <span className="rank-num">{i + 1}</span>
                <div className="rank-info">
                  <div className="rank-name-row">
                    <span className="rank-name">{c.name}</span>
                  </div>
                  <div className="rank-bar-row">
                    <TypeStackBar typeCounts={tc} widthPct={widthPct} />
                    <span className="rank-mw">
                      {c.twh} TWh · {c.pct_national}%
                      {c.wattsPerCapita != null ? ` · ${c.wattsPerCapita} W/cap` : ''}
                    </span>
                  </div>
                </div>
                <span className="rank-fly">↗</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function CountryModal({ country, europe, onClose, onFlyTo, onSelectCountry, totalCampuses, countryDCStats }) {
  const [operatorName, setOperatorName] = useState(null);

  useEffect(() => { setOperatorName(null); }, [country?.countryCode]);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const isCountry = country && !europe;
  const title = isCountry ? (country.carbon.name ?? country.countryCode) : 'Europe';
  const subtitle = isCountry ? 'Country overview' : 'Continent overview';

  return (
    <div className="country-modal-overlay" onClick={handleOverlayClick}>
      <div className="country-modal" role="dialog" aria-modal="true">
        <div className="cm-header">
          <div>
            <h2 className="cm-title">{title}</h2>
            <span className="cm-subtitle">{subtitle}</span>
          </div>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        {operatorName ? (
          <div className="cm-body">
            <OperatorPanel
              name={operatorName}
              onBack={() => setOperatorName(null)}
              onFlyTo={(coords) => { onClose(); setTimeout(() => onFlyTo?.(coords), 50); }}
            />
          </div>
        ) : isCountry ? (
          <CountryContent
            country={country}
            onFlyTo={(coords) => { onClose(); setTimeout(() => onFlyTo?.(coords), 50); }}
            onOperatorClick={setOperatorName}
          />
        ) : (
          <EuropeContent
            europe={europe}
            onSelectCountry={(code) => { onClose(); setTimeout(() => onSelectCountry?.(code), 50); }}
            totalCampuses={totalCampuses ?? 0}
            countryDCStats={countryDCStats}
          />
        )}
      </div>
    </div>
  );
}
