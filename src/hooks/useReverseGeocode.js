// Nominatim reverse geocoding — free, no key required.
// Terms of use: https://operations.osmfoundation.org/policies/nominatim/
// Rate limit: 1 req/s max. In practice we only call on user click so this is fine.
const BASE = 'https://nominatim.openstreetmap.org/reverse';
const HEADERS = { 'User-Agent': 'AI-DataCenter-Environmental-Map/1.0 (educational project)' };

const cache = new Map();

function cacheKey(lat, lng) {
  // Round to 0.5° — enough precision for country-level, reduces duplicate calls
  return `${(Math.round(lat * 2) / 2)},${(Math.round(lng * 2) / 2)}`;
}

export async function reverseGeocodeCountry(lat, lng, signal) {
  // If already cached, return immediately
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key);

  const url = `${BASE}?format=json&lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}&zoom=3`;
  try {
    const res = await fetch(url, { headers: HEADERS, signal });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const json = await res.json();
    // country_code is lowercase ISO 3166-1 alpha-2
    const code = json.address?.country_code?.toUpperCase() ?? null;
    cache.set(key, code);
    return code;
  } catch (err) {
    if (err.name === 'AbortError') return null;
    console.warn('Reverse geocode failed for', lat, lng, '—', err.message);
    return null;
  }
}
