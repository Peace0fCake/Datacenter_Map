import { useState } from 'react';
import { getCarbonData, getDCWattsPerCapita, fmtEnergyMWh, HOURS_PER_YEAR } from '../lib/model';
import { HoverDef } from './InfoTip';

// ── Density presets ───────────────────────────────────────────────────────────
const DENSITY = {
  full:     { compactRows: true,  statStrip: true,  topN: 5,    countryTopN: 8,   compactPipeline: true  },
  moderate: { compactRows: true,  statStrip: false, topN: null, countryTopN: null, compactPipeline: false },
  merge:    { compactRows: false, statStrip: false, topN: null, countryTopN: null, compactPipeline: false },
};
const cfgFor = (d) => DENSITY[d] ?? DENSITY.full;
const kMW = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

// Fallback when no precomputed energy: capacity (MW, footprint-derived ≈ avg power) × hours.
const mwToEnergy = (mw) => (mw != null ? fmtEnergyMWh(mw * HOURS_PER_YEAR) : null);

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

// Compact horizontal stat strip (used in `full` density)
function StatStrip({ items }) {
  return (
    <div className="stat-strip">
      {items.filter(Boolean).map((it, i) => (
        <span key={i} className="stat-strip-item">
          <span className="stat-strip-val">{it.value}</span>
          {it.unit && <span className="stat-strip-unit">{it.unit}</span>}
          <span className="stat-strip-label">{it.label}</span>
        </span>
      ))}
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

function PipelineBar({ pipeline, compact }) {
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
      {compact ? (
        <div className="pipeline-caption">
          <span><span className="pipeline-dot pipeline-construction" />{mwToEnergy(pipeline.construction_mw)} building</span>
          <span><span className="pipeline-dot pipeline-planned" />{mwToEnergy(pipeline.planned_mw)} planned</span>
          <span><span className="pipeline-dot pipeline-current" />{mwToEnergy(pipeline.current_mw)} operating</span>
          <span className="pipeline-caption-total">CBRE/DCD ’24</span>
        </div>
      ) : (
        <>
          <div className="pipeline-rows">
            <div className="pipeline-row"><span className="pipeline-dot pipeline-construction" /><span className="pipeline-row-label">Under construction</span><span className="pipeline-row-mw">{mwToEnergy(pipeline.construction_mw)}/yr</span></div>
            <div className="pipeline-row"><span className="pipeline-dot pipeline-planned" /><span className="pipeline-row-label">Announced / planned</span><span className="pipeline-row-mw">{mwToEnergy(pipeline.planned_mw)}/yr</span></div>
            <div className="pipeline-row"><span className="pipeline-dot pipeline-current" /><span className="pipeline-row-label">Operating today</span><span className="pipeline-row-mw">{mwToEnergy(pipeline.current_mw)}/yr</span></div>
          </div>
          <div className="pipeline-total">{mwToEnergy(pipeline.construction_mw + pipeline.planned_mw)}/yr of new demand coming · <span className="pipeline-src">CBRE / DCD 2024</span></div>
        </>
      )}
    </div>
  );
}

const TYPE_LABEL = { hyperscaler: 'Hyperscaler', cloud: 'Cloud', colocation: 'Colo', carrier: 'Carrier', enterprise: 'Enterprise' };
const TYPE_CLASS = { hyperscaler: 'type-hyper', cloud: 'type-cloud', colocation: 'type-colo', carrier: 'type-carrier', enterprise: 'type-enterprise' };
const TYPE_COLOR = { hyperscaler: '#a855f7', cloud: '#22c55e', colocation: '#0ea5e9', carrier: '#eab308', enterprise: '#64748b' };
const TYPE_ORDER = ['hyperscaler', 'cloud', 'colocation', 'carrier', 'enterprise'];

// Operator-type chip with a hover/click definition
function TypeChip({ typeId, typeLabel, typeClass }) {
  if (!typeLabel) return null;
  const chip = <span className={`rank-type ${typeClass}`}>{typeLabel}</span>;
  return typeId ? <HoverDef id={typeId}>{chip}</HoverDef> : chip;
}

// Unified ranked row — single-line (compact) or two-line (spacious)
function RankRow({ rank, name, typeId, typeLabel, typeClass, barPct, value, onClick, compact, fly }) {
  const linkCls = onClick ? 'rank-row--link' : '';
  if (compact) {
    return (
      <div className={`rank-row-compact ${linkCls}`} onClick={onClick} title={onClick ? name : undefined}>
        <span className="rank-num">{rank}</span>
        <span className="rank-name">{name}</span>
        <TypeChip typeId={typeId} typeLabel={typeLabel} typeClass={typeClass} />
        <div className="rank-mini-track"><div className={`rank-mini-fill ${typeClass}`} style={{ width: `${barPct}%` }} /></div>
        <span className="rank-val">{value}</span>
        {fly && <span className="rank-fly">↗</span>}
      </div>
    );
  }
  return (
    <div className={`campus-rank-row ${linkCls}`} onClick={onClick} title={onClick ? name : undefined}>
      <span className="rank-num">{rank}</span>
      <div className="rank-info">
        <div className="rank-name-row">
          <span className="rank-name">{name}</span>
          <TypeChip typeId={typeId} typeLabel={typeLabel} typeClass={typeClass} />
        </div>
        <div className="rank-bar-row">
          <div className="rank-bar-track"><div className={`rank-bar-fill ${typeClass}`} style={{ width: `${barPct}%` }} /></div>
          <span className="rank-mw">{value}</span>
        </div>
      </div>
      {fly && <span className="rank-fly">↗</span>}
    </div>
  );
}

// Stacked operator-type bar for the Europe country ranking
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

// "Show N more / less" expander
function ShowMore({ hidden, expanded, onToggle }) {
  if (hidden <= 0) return null;
  return (
    <button className="rank-showmore" onClick={onToggle}>
      {expanded ? 'Show less' : `Show ${hidden} more`}
      <span className={`chevron ${expanded ? 'open' : ''}`}>›</span>
    </button>
  );
}

// ── Country panel content ─────────────────────────────────────────────────────

function CountryContent({ country, onOperatorClick, onOpenCampus, campusMetrics, density }) {
  const cfg = cfgFor(density);
  const [rankView, setRankView] = useState('campuses');   // 'campuses' | 'operators'
  const [opSort, setOpSort]     = useState('mw');
  const [expanded, setExpanded] = useState(false);

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

  const lowCarbon = (country.carbon.renewables_pct ?? 0) + (country.carbon.nuclear_pct ?? 0);

  // Active ranking list (campuses or operators), with optional top-N limit + expand
  const activeList = rankView === 'campuses' ? topCampuses : topOperators;
  const limit = cfg.topN;
  const visible = (limit && !expanded) ? activeList.slice(0, limit) : activeList;
  const hidden  = limit ? Math.max(0, activeList.length - limit) : 0;

  return (
    <div className="cm-body">
      {/* 1. DC stats */}
      <div className="panel-section">
        <SectionLabel>Data Centers · OSM</SectionLabel>
        {cfg.statStrip ? (
          <>
            <StatStrip items={[
              { value: (osm?.campus_count ?? country.dcCount).toLocaleString(), label: 'campuses' },
              footprintHa ? { value: footprintHa, unit: 'ha', label: 'footprint' } : null,
              dcPower ? { value: dcPower.twh, unit: 'TWh/yr', label: 'DC power' } : null,
              wattsPerCapita != null ? { value: wattsPerCapita, unit: 'W', label: 'per capita' } : null,
            ]} />
            {dcPower && (
              <div className="country-power-meta country-power-meta--strip">
                <span>{dcPower.pct_national}% of national grid</span>
                {dcPower.url
                  ? <a href={dcPower.url} target="_blank" rel="noopener noreferrer" className={`data-badge data-badge-link ${dcPower.confidence === 'high' ? 'reported' : 'est'}`}>{dcPower.source} ↗</a>
                  : <span className={`data-badge ${dcPower.confidence === 'high' ? 'reported' : 'est'}`}>{dcPower.source}</span>}
              </div>
            )}
          </>
        ) : (
          <>
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
                    : <span className={`data-badge ${dcPower.confidence === 'high' ? 'reported' : 'est'}`}>{dcPower.source}</span>}
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
          </>
        )}
      </div>

      {/* 2. Grid */}
      <div className="panel-section">
        <SectionLabel>Grid · <a href="https://ember-climate.org/insights/research/global-electricity-review-2024/" target="_blank" rel="noopener noreferrer" className="source-link">Ember 2024</a> (2023 data)</SectionLabel>
        <div className="co2-card">
          <BigNumber value={country.carbon.intensity_gco2_kwh} unit="gCO₂/kWh" />
          <div className="clean-bar-wrap" style={{ marginTop: 10 }}>
            <div className="clean-bar-header">
              <span>Low-carbon share</span>
              <span style={{ color: '#22c55e' }}>{lowCarbon}%</span>
            </div>
            <div className="clean-bar"><div className="clean-fill" style={{ width: `${lowCarbon}%` }} /></div>
          </div>
          <ElectricityMixBar renewablesPct={country.carbon.renewables_pct ?? 0} nuclearPct={country.carbon.nuclear_pct ?? 0} fossilPct={fossilPct} />
        </div>
      </div>

      {/* 3. Merged rankings — campuses / operators behind one toggle */}
      {(topCampuses.length > 0 || topOperators.length > 0) && (
        <div className="panel-section">
          <div className="section-label-row">
            <div className="rank-segmented">
              <button className={`seg-btn ${rankView === 'campuses' ? 'active' : ''}`}
                onClick={() => { setRankView('campuses'); setExpanded(false); }}>Campuses</button>
              <button className={`seg-btn ${rankView === 'operators' ? 'active' : ''}`}
                onClick={() => { setRankView('operators'); setExpanded(false); }}>Operators</button>
            </div>
            {rankView === 'operators' && (
              <div className="sort-toggle">
                <button className={`sort-btn ${opSort === 'mw' ? 'active' : ''}`} onClick={() => setOpSort('mw')}>by energy</button>
                <button className={`sort-btn ${opSort === 'count' ? 'active' : ''}`} onClick={() => setOpSort('count')}>by campuses</button>
              </div>
            )}
          </div>

          <div className="campus-ranking">
            {rankView === 'campuses'
              ? visible.map((c, i) => {
                  const mwh = campusMetrics?.[c.id]?.total_mwh_yr;
                  const value = mwh != null ? `${fmtEnergyMWh(mwh)}/yr`
                    : c.cap_mw != null ? `${mwToEnergy(c.cap_mw)}/yr`
                    : `${(c.fp_m2 / 10000).toFixed(1)} ha`;
                  return (
                    <RankRow key={c.id ?? i} rank={i + 1} compact={cfg.compactRows}
                      name={c.name} typeId={c.type} typeLabel={TYPE_LABEL[c.type]} typeClass={TYPE_CLASS[c.type]}
                      barPct={Math.round((c.cap_mw ?? 0) / maxCap * 100)}
                      value={value}
                      onClick={() => onOpenCampus?.(c)}
                      fly={!!(c.lat && c.lon)} />
                  );
                })
              : visible.map((op, i) => (
                  <RankRow key={op.name} rank={i + 1} compact={cfg.compactRows}
                    name={op.name} typeId={op.type} typeLabel={TYPE_LABEL[op.type]} typeClass={TYPE_CLASS[op.type]}
                    barPct={Math.round((opSort === 'mw' ? (op.cap_mw ?? 0) : op.count) / maxOpVal * 100)}
                    value={opSort === 'mw'
                      ? (op.cap_mw ? `${mwToEnergy(op.cap_mw)}/yr` : `${op.count} site${op.count !== 1 ? 's' : ''}`)
                      : `${op.count} site${op.count !== 1 ? 's' : ''}`}
                    onClick={() => onOperatorClick?.(op.name)} fly />
                ))}
          </div>
          <ShowMore hidden={hidden} expanded={expanded} onToggle={() => setExpanded(v => !v)} />
        </div>
      )}

      {/* 4. Market outlook — forward-looking, not derived from mapped campuses */}
      {pipeline && (
        <div className="panel-section">
          <SectionLabel>Market outlook</SectionLabel>
          <p className="rank-caption" style={{ padding: '0 0 8px' }}>
            Forward-looking market intelligence — independent of the OSM-mapped campuses above.
          </p>
          <PipelineBar pipeline={pipeline} compact={cfg.compactPipeline} />
        </div>
      )}
    </div>
  );
}

// ── Europe panel content ──────────────────────────────────────────────────────

function EuropeContent({ europe, onSelectCountry, totalCampuses, countryDCStats, density }) {
  const cfg = cfgFor(density);
  const [sort, setSort] = useState('twh');
  const [expanded, setExpanded] = useState(false);

  const sorted = [...europe.countries].sort((a, b) =>
    sort === 'twh' ? b.twh - a.twh : b.pct_national - a.pct_national
  );
  const maxVal = sorted[0]?.[sort === 'twh' ? 'twh' : 'pct_national'] ?? 1;

  const totalByType = {};
  for (const t of TYPE_ORDER) {
    totalByType[t] = sorted.reduce((s, c) => s + (countryDCStats?.[c.code]?.type_counts?.[t] ?? 0), 0);
  }
  const grandTotal = Object.values(totalByType).reduce((s, n) => s + n, 0);

  const limit   = cfg.countryTopN;
  const visible = (limit && !expanded) ? sorted.slice(0, limit) : sorted;
  const hidden  = limit ? Math.max(0, sorted.length - limit) : 0;

  return (
    <div className="cm-body">
      <div className="panel-section">
        <SectionLabel>Data Centers · Totals</SectionLabel>
        {cfg.statStrip ? (
          <StatStrip items={[
            { value: totalCampuses.toLocaleString(), label: 'campuses' },
            { value: europe.totalTwh, unit: 'TWh/yr', label: 'DC power' },
            { value: europe.totalCO2Megatonnes, unit: 'Mt', label: 'CO₂/yr' },
            { value: europe.avgCarbonIntensity, unit: 'gCO₂', label: 'avg grid' },
          ]} />
        ) : (
          <div className="card-grid">
            <div className="metric-card"><BigNumber value={totalCampuses.toLocaleString()} unit="campuses" sub="mapped in OSM" /></div>
            <div className="metric-card"><BigNumber value={europe.totalTwh} unit="TWh/yr" sub="est. DC electricity" /></div>
            <div className="metric-card"><BigNumber value={europe.totalCO2Megatonnes} unit="Mt CO₂/yr" sub="est. emissions" /></div>
            <div className="metric-card"><BigNumber value={europe.avgCarbonIntensity} unit="gCO₂/kWh" sub="weighted avg. grid intensity" /></div>
          </div>
        )}
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
        {!cfg.statStrip && (
          <p className="member-note" style={{ marginTop: 8 }}>
            Sums national estimates (JRC 2023 / EirGrid / NESO + derived). Actual 2024 consumption is likely 20–40% higher due to AI buildout.
          </p>
        )}
      </div>

      <div className="panel-section">
        <div className="section-label-row">
          <SectionLabel>Countries by DC electricity</SectionLabel>
          <div className="sort-toggle">
            <button className={`sort-btn ${sort === 'twh' ? 'active' : ''}`} onClick={() => { setSort('twh'); setExpanded(false); }}>by TWh</button>
            <button className={`sort-btn ${sort === 'pct' ? 'active' : ''}`} onClick={() => { setSort('pct'); setExpanded(false); }}>by % grid</button>
          </div>
        </div>
        <div className="campus-ranking">
          {visible.map((c, i) => {
            const widthPct = Math.round((sort === 'twh' ? c.twh : c.pct_national) / maxVal * 100);
            const tc = countryDCStats?.[c.code]?.type_counts ?? {};
            const value = `${c.twh} TWh · ${c.pct_national}%${c.wattsPerCapita != null ? ` · ${c.wattsPerCapita} W/cap` : ''}`;
            return (
              <div key={c.code}
                className={`${cfg.compactRows ? 'rank-row-compact' : 'campus-rank-row'} rank-row--link`}
                onClick={() => onSelectCountry?.(c.code)} title={`View ${c.name}`}>
                <span className="rank-num">{i + 1}</span>
                {cfg.compactRows ? (
                  <>
                    <span className="rank-name">{c.name}</span>
                    <TypeStackBar typeCounts={tc} widthPct={widthPct} />
                    <span className="rank-val">{c.twh} TWh</span>
                    <span className="rank-fly">↗</span>
                  </>
                ) : (
                  <>
                    <div className="rank-info">
                      <div className="rank-name-row"><span className="rank-name">{c.name}</span></div>
                      <div className="rank-bar-row">
                        <TypeStackBar typeCounts={tc} widthPct={widthPct} />
                        <span className="rank-mw">{value}</span>
                      </div>
                    </div>
                    <span className="rank-fly">↗</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <ShowMore hidden={hidden} expanded={expanded} onToggle={() => setExpanded(v => !v)} />
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function CountryModal({ country, europe, onClose, onBack, canBack, onSelectCountry, onOpenOperator, onOpenCampus, campusMetrics, totalCampuses, countryDCStats, density = 'full' }) {
  const isCountry = country && !europe;
  const title = isCountry ? (country.carbon.name ?? country.countryCode) : 'Europe';
  const subtitle = isCountry ? 'Country overview' : 'Continent overview';

  return (
    <div className="details-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          {canBack && <button className="panel-back" onClick={onBack}>← Back</button>}
          <h2 title={title}>{title}</h2>
          <span className="panel-operator">{subtitle}</span>
        </div>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>

      {isCountry ? (
        <CountryContent
          country={country}
          density={density}
          onOperatorClick={onOpenOperator}
          onOpenCampus={onOpenCampus}
          campusMetrics={campusMetrics}
        />
      ) : (
        <EuropeContent
          europe={europe}
          density={density}
          onSelectCountry={onSelectCountry}
          totalCampuses={totalCampuses ?? 0}
          countryDCStats={countryDCStats}
        />
      )}
    </div>
  );
}
