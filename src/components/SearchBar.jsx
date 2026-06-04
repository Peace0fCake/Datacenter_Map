import { useState, useRef, useCallback, useEffect } from 'react';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const HEADERS   = { 'Accept-Language': 'en' };

export function SearchBar({ mapRef }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [active,  setActive]  = useState(false);
  const debounce  = useRef(null);
  const wrapperRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    const params = new URLSearchParams({
      q, format: 'json', limit: 6,
      viewbox: '-25,72,60,30', bounded: '0',
    });
    try {
      const res = await fetch(`${NOMINATIM}?${params}`, { headers: HEADERS });
      const data = await res.json();
      setResults(data);
      setOpen(data.length > 0);
    } catch { /* network error — silently ignore */ }
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(q), 350);
  };

  const handleSelect = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    mapRef.current?.getMap()?.flyTo({ center: [lng, lat], zoom: 13, duration: 1200 });
    setQuery(result.display_name.split(',').slice(0, 2).join(','));
    setResults([]);
    setOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapperRef} className={`search-bar ${active ? 'focused' : ''}`}>
      <div className="search-input-row">
        <svg className="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <line x1="13" y1="13" x2="18" y2="18" />
        </svg>
        <input
          type="text"
          className="search-input"
          placeholder="Search address…"
          value={query}
          onChange={handleChange}
          onFocus={() => { setActive(true); if (results.length) setOpen(true); }}
          onBlur={() => setActive(false)}
          onKeyDown={(e) => e.key === 'Escape' && handleClear()}
        />
        {query && (
          <button className="search-clear" onClick={handleClear} tabIndex={-1}>✕</button>
        )}
      </div>

      {open && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.place_id} onMouseDown={() => handleSelect(r)}>
              <span className="search-result-main">
                {r.display_name.split(',')[0]}
              </span>
              <span className="search-result-sub">
                {r.display_name.split(',').slice(1, 3).join(',').trim()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
