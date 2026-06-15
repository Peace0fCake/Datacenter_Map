import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'dc_suggestions_v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function save(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function useSuggestions(dcId) {
  const [all, setAll] = useState(() => load());

  // Sync when storage changes in another tab
  useEffect(() => {
    const handler = () => setAll(load());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const forDC = all.filter(s => s.dcId === dcId);
  const topSuggestion = (() => {
    const sorted = [...forDC].sort((a, b) => b.votes - a.votes);
    return sorted[0]?.votes >= 2 ? sorted[0] : null;
  })();

  const submit = useCallback((dcId, dcName, fields) => {
    const entry = {
      id:          `sug_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      dcId, dcName,
      submittedAt: new Date().toISOString(),
      votes:       0,
      upvoters:    [],
      downvoters:  [],
      ...fields,
    };
    setAll(prev => {
      const next = [entry, ...prev];
      save(next);
      return next;
    });
  }, []);

  const vote = useCallback((suggestionId, direction) => {
    setAll(prev => {
      const voterId = 'anon'; // single-user for now
      const next = prev.map(s => {
        if (s.id !== suggestionId) return s;
        const alreadyUp   = s.upvoters.includes(voterId);
        const alreadyDown = s.downvoters.includes(voterId);
        let upvoters   = [...s.upvoters];
        let downvoters = [...s.downvoters];
        if (direction === 'up') {
          if (alreadyUp) { upvoters = upvoters.filter(v => v !== voterId); }
          else { upvoters.push(voterId); downvoters = downvoters.filter(v => v !== voterId); }
        } else {
          if (alreadyDown) { downvoters = downvoters.filter(v => v !== voterId); }
          else { downvoters.push(voterId); upvoters = upvoters.filter(v => v !== voterId); }
        }
        return { ...s, upvoters, downvoters, votes: upvoters.length - downvoters.length };
      });
      save(next);
      return next;
    });
  }, []);

  return { suggestions: forDC, topSuggestion, submit, vote };
}
