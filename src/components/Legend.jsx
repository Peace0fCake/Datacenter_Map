export function Legend() {
  const stressLevels = [
    { label: 'Low',          color: '#22c55e' },
    { label: 'Low–Medium',   color: '#84cc16' },
    { label: 'Medium–High',  color: '#eab308' },
    { label: 'High',         color: '#f97316' },
    { label: 'Extremely High', color: '#ef4444' },
  ];

  return (
    <div className="legend">
      <h4>Water Stress Risk</h4>
      <div className="legend-items">
        {stressLevels.map(({ label, color }) => (
          <div key={label} className="legend-item">
            <span className="legend-dot" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="legend-divider" />
      <div className="legend-item">
        <span className="legend-dot" style={{ background: '#6366f1' }} />
        <span>Existing (OSM)</span>
      </div>
      <div className="legend-item">
        <span className="legend-dot legend-dot-sim" />
        <span>Simulated</span>
      </div>
      <p className="legend-source">
        Sources: OSM · Ember Climate · WRI Aqueduct · Open-Meteo
      </p>
    </div>
  );
}
