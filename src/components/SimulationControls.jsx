export function SimulationControls({ active, onToggle }) {
  return (
    <div className={`sim-controls ${active ? 'active' : ''}`}>
      <div className="sim-header">
        <div className="sim-title-block">
          <h2>Simulate</h2>
          <span className="sim-sub">Model a hypothetical data centre</span>
        </div>
        <button className={`sim-toggle ${active ? 'on' : ''}`} onClick={onToggle}>
          {active ? 'Cancel' : 'Place DC'}
        </button>
      </div>
      {active ? (
        <p className="sim-hint">Click the map to place, then adjust capacity below.</p>
      ) : (
        <p className="sim-hint sim-hint-idle">Place a hypothetical DC and model its impact.</p>
      )}
    </div>
  );
}
