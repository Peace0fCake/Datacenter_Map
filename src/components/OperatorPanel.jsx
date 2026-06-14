import { useState, useEffect } from 'react';

const TYPE_LABEL = { hyperscaler: 'Hyperscaler', cloud: 'Cloud', colocation: 'Colo', carrier: 'Carrier', enterprise: 'Enterprise' };
const TYPE_CLASS  = { hyperscaler: 'type-hyper', cloud: 'type-cloud', colocation: 'type-colo', carrier: 'type-carrier', enterprise: 'type-enterprise' };

// Module-level cache — operators.json is 370 KB, fetch once
let _cache = null;
async function loadOperators() {
  if (_cache) return _cache;
  const r = await fetch('/data/operators.json');
  _cache = await r.json();
  return _cache;
}

function fmt(mw) {
  if (!mw) return null;
  return mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : `${mw.toFixed(0)} MW`;
}
function fmtHa(m2) {
  if (!m2) return null;
  return m2 >= 10_000 ? `${(m2 / 10_000).toFixed(1)} ha` : `${Math.round(m2).toLocaleString()} m²`;
}

function CampusRow({ campus, rank, maxMw, onFlyTo }) {
  const canFly = campus.lat && campus.lon;
  const displayMw = campus.cap_mw || 0;
  const pct = maxMw > 0 ? Math.round(displayMw / maxMw * 100) : 0;

  return (
    <div
      className={`campus-rank-row ${canFly ? 'campus-rank-row--link' : ''}`}
      onClick={canFly ? () => onFlyTo?.({ lat: campus.lat, lng: campus.lon, zoom: 15 }) : undefined}
      title={canFly ? `Zoom to ${campus.name}` : undefined}
    >
      <span className="rank-num">{rank}</span>
      <div className="rank-info">
        <div className="rank-name-row">
          <span className="rank-name">{campus.name}</span>
          {campus.building_count > 1 && (
            <span className="rank-buildings">{campus.building_count} bldgs</span>
          )}
        </div>
        <div className="rank-bar-row">
          <div className="rank-bar-track">
            <div className="rank-bar-fill type-hyper" style={{ width: `${pct}%` }} />
          </div>
          <span className="rank-mw">
            {displayMw ? fmt(displayMw) : fmtHa(campus.fp_m2)}
          </span>
        </div>
      </div>
      {canFly && <span className="rank-fly">↗</span>}
    </div>
  );
}

function CountrySection({ country, onFlyTo }) {
  const [open, setOpen] = useState(country === null || true);
  const maxMw = country.campuses[0]?.cap_mw || 1;

  return (
    <div className="op-country-section">
      <button className="op-country-header" onClick={() => setOpen(v => !v)}>
        <span className="op-country-name">{country.name}</span>
        <span className="op-country-meta">
          {country.campus_count} campus{country.campus_count !== 1 ? 'es' : ''}
          {country.cap_mw ? ` · ${fmt(country.cap_mw)}` : ''}
          {country.fp_m2 && !country.cap_mw ? ` · ${fmtHa(country.fp_m2)}` : ''}
        </span>
        <span className={`op-chevron ${open ? 'open' : ''}`}>›</span>
      </button>
      {open && (
        <div className="campus-ranking op-campus-list">
          {country.campuses.map((c, i) => (
            <CampusRow key={c.id || i} campus={c} rank={i + 1} maxMw={maxMw} onFlyTo={onFlyTo} />
          ))}
        </div>
      )}
    </div>
  );
}

export function OperatorPanel({ name, onBack, onFlyTo }) {
  const [op, setOp] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setOp(null);
    loadOperators()
      .then(d => setOp(d.operators.find(o => o.name === name) ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [name]);

  return (
    <>
      <div className="panel-header">
        <div className="panel-title-group">
          <button className="panel-back" onClick={onBack}>← Back</button>
          <h2>{name}</h2>
          {op && <span className="panel-operator">{TYPE_LABEL[op.type] ?? op.type}</span>}
        </div>
      </div>

      {loading && (
        <div className="panel-loading"><span className="spinner" />Loading operator data…</div>
      )}

      {!loading && !op && (
        <div className="no-capacity-notice">
          <span className="no-cap-icon">🔍</span>
          <div><strong>Operator not found</strong><p>No data for "{name}" in the operators index.</p></div>
        </div>
      )}

      {op && (
        <>
          {/* Type badge */}
          <div className="panel-tags">
            <span className={`tag dc-type-tag ${TYPE_CLASS[op.type]}`}>{TYPE_LABEL[op.type]}</span>
            <span className="tag tag-country">{op.country_count} countr{op.country_count === 1 ? 'y' : 'ies'}</span>
          </div>

          {/* Global stats pills */}
          <div className="operator-stats">
            <div className="op-stat">
              <span className="op-stat-val">{op.total_campuses}</span>
              <span className="op-stat-label">campus{op.total_campuses !== 1 ? 'es' : ''}</span>
            </div>
            <div className="op-stat-div" />
            <div className="op-stat">
              <span className="op-stat-val">{op.total_buildings}</span>
              <span className="op-stat-label">buildings</span>
            </div>
            <div className="op-stat-div" />
            <div className="op-stat">
              <span className="op-stat-val">{op.total_cap_mw ? fmt(op.total_cap_mw) : '—'}</span>
              <span className="op-stat-label">est. capacity</span>
            </div>
            <div className="op-stat-div" />
            <div className="op-stat">
              <span className="op-stat-val">{fmtHa(op.total_fp_m2) ?? '—'}</span>
              <span className="op-stat-label">footprint</span>
            </div>
          </div>

          <p className="op-note">
            Capacity figures are area-based estimates (JRC 2023 model). Actual consumption may differ significantly.
            {op.type === 'hyperscaler' && ' Hyperscalers routinely under-report OSM coverage — actual facilities far exceed what is mapped.'}
          </p>

          {/* Per-country sections — already sorted by cap_mw desc */}
          <div className="op-countries">
            {op.countries.map(c => (
              <CountrySection key={c.code} country={c} onFlyTo={onFlyTo} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
