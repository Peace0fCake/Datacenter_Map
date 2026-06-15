export function Legend({ activeLayer, showHeatmap, showIris, showDots }) {
  const anyOverlay = activeLayer !== 'none' || showHeatmap || showIris;
  if (!anyOverlay) return null;

  return (
    <div className="legend">
      {activeLayer === 'water' && (
        <div className="legend-section">
          <h4>Watershed Water Stress</h4>
          <div className="legend-gradient-bar">
            <div className="legend-gradient-fill" style={{
              background: 'linear-gradient(to right, #22c55e, #84cc16, #eab308, #f97316, #ef4444, #b91c1c)',
            }} />
            <div className="legend-gradient-labels">
              <span>Low</span>
              <span>Medium</span>
              <span>Extreme</span>
            </div>
          </div>
        </div>
      )}

      {activeLayer === 'carbon' && (
        <div className="legend-section">
          <h4>Grid Carbon Intensity <span className="legend-unit">gCO₂/kWh</span></h4>
          <div className="legend-gradient-bar">
            <div className="legend-gradient-fill" style={{
              background: 'linear-gradient(to right, #166534, #16a34a, #ca8a04, #ea580c, #dc2626, #7f1d1d)',
            }} />
            <div className="legend-gradient-labels">
              <span>&lt;80</span>
              <span>200</span>
              <span>320</span>
              <span>&gt;450</span>
            </div>
          </div>
        </div>
      )}

      {showHeatmap && (
        <div className="legend-section">
          <h4>DC Power Density <span className="legend-unit">MW · log · viewport-scaled</span></h4>
          <div className="legend-gradient-bar">
            <div className="legend-gradient-fill" style={{
              background: 'linear-gradient(to right, rgba(99,102,241,0.2), #4f46e5, #818cf8, #f97316, #ef4444, #b91c1c)',
            }} />
            <div className="legend-gradient-labels">
              <span>sparse</span>
              <span>medium</span>
              <span>peak</span>
            </div>
          </div>
          <p className="legend-note">Weights mapped campuses only — see country panels for national totals.</p>
        </div>
      )}

      {showIris && (
        <div className="legend-section">
          <h4>France — Annual electricity</h4>
          <div className="legend-gradient-bar">
            <div className="legend-gradient-fill" style={{
              background: 'linear-gradient(to right, #fef9c3, #fde047, #fb923c, #dc2626, #7f1d1d)',
            }} />
            <div className="legend-gradient-labels">
              <span>Low</span>
              <span>High MWh/yr</span>
            </div>
          </div>
        </div>
      )}

      {showDots && (
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#6366f1' }} />
          <span>Data centre (OSM)</span>
        </div>
      )}
    </div>
  );
}
