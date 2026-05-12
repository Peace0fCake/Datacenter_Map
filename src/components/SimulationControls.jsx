export function SimulationControls({ active, onToggle }) {
  return (
    <div className={`sim-controls ${active ? 'active' : ''}`}>
      <div className="sim-header">
        <h2>Simulate</h2>
        <button className={`sim-toggle ${active ? 'on' : ''}`} onClick={onToggle}>
          {active ? 'Cancel' : 'Place DC'}
        </button>
      </div>
      {active && (
        <p className="sim-hint">Click anywhere on the map. Adjust capacity in the panel.</p>
      )}
    </div>
  );
}
