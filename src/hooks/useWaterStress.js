import { useState, useCallback, useRef } from 'react';

// WRI Aqueduct 4.0 REST API
// Indicator: bws (Baseline Water Stress), score 0–5
const AQUEDUCT_URL = 'https://aqueduct-water-risk.appspot.com/api/v1/';

const cache = new Map();

function cacheKey(lat, lng) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

async function fetchWaterStress(lat, lng, signal) {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({
    indicators: 'bws',
    geogunit_unique_name: '',
    // Aqueduct accepts a GeoJSON point for arbitrary coordinate lookup
  });

  // Aqueduct point-based query
  const body = JSON.stringify({
    geojson: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {},
      }],
    },
    indicators: ['bws'],
    scenario: 'optimistic',
    year: 2030,
  });

  const res = await fetch(AQUEDUCT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  });

  if (!res.ok) throw new Error(`Aqueduct API error: ${res.status}`);

  const json = await res.json();

  // Parse score from response
  const score = json?.data?.[0]?.bws?.score ?? null;
  const label = json?.data?.[0]?.bws?.label ?? null;
  const result = { score, label };
  cache.set(key, result);
  return result;
}

export function useWaterStress() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  const getWaterStress = useCallback(async (lat, lng) => {
    if (controllerRef.current) controllerRef.current.abort();
    controllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await fetchWaterStress(lat, lng, controllerRef.current.signal);
      return result;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      setError(err.message);
      return { score: null, label: null };
    } finally {
      setLoading(false);
    }
  }, []);

  return { getWaterStress, loading, error };
}
