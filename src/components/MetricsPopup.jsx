import { waterStressLabel } from '../lib/model';

function MetricRow({ icon, label, value, sub, highlight }) {
  return (
    <div className={`metric-row${highlight ? ' highlight' : ''}`}>
      <span className="metric-icon">{icon}</span>
      <div className="metric-body">
        <span className="metric-label">{label}</span>
        <span className="metric-value">{value}</span>
        {sub && <span className="metric-sub">{sub}</span>}
      </div>
    </div>
  );
}

export function MetricsPopup({ dc }) {
  if (!dc?.metrics) return null;
  const m = dc.metrics;
  const ws = waterStressLabel(dc.waterStress?.score);

  return (
    <div className="metrics-popup">
      <div className="popup-header">
        <h3>{dc.name}</h3>
        {dc.operator && <span className="popup-operator">{dc.operator}</span>}
        <div className="popup-tags">
          <span className="tag tag-country">{m.countryName}</span>
          {dc.source === 'fallback' && <span className="tag tag-fallback">OSM fallback</span>}
          {dc.source === 'simulation' && <span className="tag tag-sim">Simulation</span>}
        </div>
      </div>

      <div className="metrics-grid">
        <MetricRow
          icon="⚡"
          label="Total electricity"
          value={`${m.totalEnergyMWh.toLocaleString()} MWh/yr`}
          sub={`IT load: ${m.itEnergyMWh.toLocaleString()} MWh/yr`}
        />
        <MetricRow
          icon="🌡️"
          label="PUE"
          value={m.pue}
          sub={`Avg temp: ${m.avgTempC}°C · Cooling ratio: ${(m.coolingRatio * 100).toFixed(1)}%`}
        />
        <MetricRow
          icon="💧"
          label="Water consumption"
          value={`${m.waterM3PerYear.toLocaleString()} m³/yr`}
          sub={`WUE: ${m.wue} L/kWh`}
        />
        <MetricRow
          icon="🌍"
          label="CO₂ equivalent"
          value={`${m.co2TonnesPerYear.toLocaleString()} tCO₂eq/yr`}
          sub={`Grid intensity: ${m.carbonIntensity} gCO₂/kWh`}
        />
        <MetricRow
          icon="⚡"
          label="Renewables share"
          value={`${m.renewablesPct}%`}
          sub={`${m.countryName} grid mix`}
        />
        <MetricRow
          icon="🏠"
          label="Equivalent EU households"
          value={m.euHouseholds.toLocaleString()}
          sub="at 3,500 kWh/yr (Eurostat)"
        />
        <div className="metric-row water-stress" style={{ borderLeft: `4px solid ${ws.color}` }}>
          <span className="metric-icon">💧</span>
          <div className="metric-body">
            <span className="metric-label">Water stress risk (WRI Aqueduct)</span>
            <span className="metric-value" style={{ color: ws.color }}>
              {dc.waterStress === undefined ? 'Loading…' : ws.label}
            </span>
            {dc.waterStress?.score !== null && dc.waterStress?.score !== undefined && (
              <span className="metric-sub">Score: {dc.waterStress.score.toFixed(2)} / 5</span>
            )}
          </div>
        </div>
      </div>

      <div className="popup-footer">
        <span>Capacity: {m.capacityMW} MW · Utilization: {(m.utilizationRate * 100).toFixed(0)}%</span>
        <span className="model-note">~estimated values</span>
      </div>
    </div>
  );
}
