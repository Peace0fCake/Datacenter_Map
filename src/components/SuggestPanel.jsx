import { useState } from 'react';

const FACILITY_TYPES  = ['unknown', 'campus', 'building'];
const OPERATOR_TYPES  = ['unknown', 'hyperscaler', 'cloud', 'colocation', 'carrier', 'enterprise'];

const EMPTY_FORM = { capacity_mw: '', pue: '', wue: '', facility_type: 'unknown', operator_type: 'unknown', source_url: '', note: '' };

function fmt(val, unit) {
  return val != null ? `${val} ${unit}` : null;
}

function TypeChip({ value, palette }) {
  if (!value || value === 'unknown') return null;
  return <span className={`suggest-type-chip suggest-type-chip--${palette}`}>{value}</span>;
}

function SuggestionCard({ s, onVote }) {
  const score = s.votes;
  const date  = new Date(s.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const stats = [fmt(s.capacity_mw, 'MW'), fmt(s.pue, 'PUE'), fmt(s.wue, 'WUE L/kWh')].filter(Boolean);

  return (
    <div className="suggest-card">
      <div className="suggest-card-top">
        <div className="suggest-card-types">
          <TypeChip value={s.facility_type}  palette="facility" />
          <TypeChip value={s.operator_type}  palette="operator" />
        </div>
        <div className="suggest-card-stats">
          {stats.length > 0
            ? stats.map(t => <span key={t} className="suggest-stat-chip">{t}</span>)
            : <span className="suggest-no-stats">No numeric values</span>
          }
        </div>
      </div>
      {s.note && <p className="suggest-note">{s.note}</p>}
      <div className="suggest-card-footer">
        <div className="suggest-votes">
          <button className="suggest-vote-btn up"   onClick={() => onVote(s.id, 'up')}   title="Upvote">▲</button>
          <span className={`suggest-score ${score > 0 ? 'pos' : score < 0 ? 'neg' : ''}`}>{score > 0 ? `+${score}` : score}</span>
          <button className="suggest-vote-btn down" onClick={() => onVote(s.id, 'down')} title="Downvote">▼</button>
        </div>
        <div className="suggest-meta">
          {s.source_url
            ? <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="suggest-source-link">Source ↗</a>
            : <span className="suggest-source-none">No source</span>
          }
          <span className="suggest-date">{date}</span>
        </div>
      </div>
    </div>
  );
}

export function SuggestPanel({ dcId, dcName, suggestions, submit, vote }) {
  const [open, setOpen]       = useState(false);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    submit(dcId, dcName, {
      capacity_mw:   form.capacity_mw !== '' ? +form.capacity_mw : null,
      pue:           form.pue         !== '' ? +form.pue         : null,
      wue:           form.wue         !== '' ? +form.wue         : null,
      facility_type: form.facility_type  || 'unknown',
      operator_type: form.operator_type  || 'unknown',
      source_url:    form.source_url.trim()  || null,
      note:          form.note.trim()         || null,
    });
    setForm(EMPTY_FORM);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
    setOpen(false);
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="suggest-panel">
      <div className="suggest-header" onClick={() => setOpen(v => !v)}>
        <span className="suggest-title">
          Community data
          {suggestions.length > 0 && <span className="suggest-count">{suggestions.length}</span>}
        </span>
        <span className="suggest-chevron">{open ? '▲' : '▼'}</span>
      </div>

      {suggestions.length > 0 && !open && (
        <div className="suggest-preview">
          {suggestions.slice(0, 2).map(s => <SuggestionCard key={s.id} s={s} onVote={vote} />)}
          {suggestions.length > 2 && (
            <button className="suggest-show-more" onClick={() => setOpen(true)}>
              Show {suggestions.length - 2} more…
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="suggest-body">
          {suggestions.length > 0 && (
            <div className="suggest-list">
              {suggestions.map(s => <SuggestionCard key={s.id} s={s} onVote={vote} />)}
            </div>
          )}

          <form className="suggest-form" onSubmit={handleSubmit}>
            <div className="suggest-form-title">Suggest data for this facility</div>

            <div className="suggest-form-selects">
              <label>Facility type
                <select value={form.facility_type} onChange={set('facility_type')}>
                  {FACILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label>Operator type
                <select value={form.operator_type} onChange={set('operator_type')}>
                  {OPERATOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>

            <div className="suggest-form-row">
              <label>Capacity (MW)
                <input type="number" step="any" min="0" value={form.capacity_mw} onChange={set('capacity_mw')} />
              </label>
              <label>PUE
                <input type="number" step="0.01" min="1" max="4" value={form.pue} onChange={set('pue')} />
              </label>
              <label>WUE (L/kWh)
                <input type="number" step="0.01" min="0" value={form.wue} onChange={set('wue')} />
              </label>
            </div>

            <label className="suggest-form-full">Source URL
              <input type="url" placeholder="https://…" value={form.source_url} onChange={set('source_url')} />
            </label>
            <label className="suggest-form-full">Note
              <input type="text" maxLength={200} placeholder="Sustainability report, press release, etc." value={form.note} onChange={set('note')} />
            </label>

            <div className="suggest-form-actions">
              <button type="submit" className="suggest-submit">Submit</button>
              {submitted && <span className="suggest-success">Saved locally ✓</span>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
