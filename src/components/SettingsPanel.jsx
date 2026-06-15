import { useEffect, useCallback } from 'react';

export const DENSITY_OPTIONS = [
  {
    id: 'full',
    label: 'Compact',
    desc: 'Merged rankings, single-line rows, top 5 with show-more, and a condensed stat strip header. Densest.',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    desc: 'Merged rankings and single-line rows, but keeps the large stat cards and full pipeline breakdown.',
  },
  {
    id: 'merge',
    label: 'Comfortable',
    desc: 'Original spacious rows; only change is campuses and operators share one toggle instead of stacking.',
  },
];

export function SettingsPanel({ density, onDensity, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleBackdrop = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div className="settings-overlay" onClick={handleBackdrop}>
      <div className="settings-panel" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Panel density</div>
          <p className="settings-section-hint">How tightly the country and Europe panels pack information.</p>
          <div className="settings-density-options">
            {DENSITY_OPTIONS.map(opt => (
              <label key={opt.id} className={`settings-density-opt ${density === opt.id ? 'checked' : ''}`}>
                <input
                  type="radio"
                  name="panel-density"
                  value={opt.id}
                  checked={density === opt.id}
                  onChange={() => onDensity(opt.id)}
                />
                <span className="settings-radio-dot" />
                <span className="settings-opt-text">
                  <span className="settings-opt-label">{opt.label}</span>
                  <span className="settings-opt-desc">{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
