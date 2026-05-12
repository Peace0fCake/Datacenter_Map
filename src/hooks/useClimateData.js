import { useState, useCallback, useRef } from 'react';

// Open-Meteo historical climate API — no key required
// We fetch the 10-year average of daily mean temperature and compute annual average
const BASE_URL = 'https://archive-api.open-meteo.com/v1/archive';

// Simple in-memory cache keyed by "lat,lng" (rounded to 2dp)
const cache = new Map();

function cacheKey(lat, lng) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

async function fetchAvgTemp(lat, lng, signal) {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key);

  const url = new URL(BASE_URL);
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lng.toFixed(4));
  url.searchParams.set('start_date', '2014-01-01');
  url.searchParams.set('end_date', '2023-12-31');
  url.searchParams.set('daily', 'temperature_2m_mean');
  url.searchParams.set('timezone', 'UTC');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);

  const json = await res.json();
  const temps = json.daily?.temperature_2m_mean ?? [];
  const validTemps = temps.filter((t) => t !== null);

  if (validTemps.length === 0) throw new Error('No temperature data returned');

  const avg = validTemps.reduce((a, b) => a + b, 0) / validTemps.length;
  const result = +avg.toFixed(1);
  cache.set(key, result);
  return result;
}

export function useClimateData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  const getAvgTemp = useCallback(async (lat, lng) => {
    // Cancel any in-flight request
    if (controllerRef.current) controllerRef.current.abort();
    controllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const temp = await fetchAvgTemp(lat, lng, controllerRef.current.signal);
      return temp;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      setError(err.message);
      // Return a latitude-based fallback estimate
      return latitudeFallbackTemp(lat);
    } finally {
      setLoading(false);
    }
  }, []);

  return { getAvgTemp, loading, error };
}

// Rough fallback: temperature decreases ~0.6°C per degree of latitude above 35°N
function latitudeFallbackTemp(lat) {
  return +(20 - (lat - 35) * 0.6).toFixed(1);
}
