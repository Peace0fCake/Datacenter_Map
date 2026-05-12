import { useState, useEffect } from 'react';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const EU_BBOX = '34.0,-25.0,72.0,50.0';

// Source: OpenStreetMap contributors (ODbL) — https://www.openstreetmap.org/copyright
// Primary tag: telecom=data_center (used by ~95% of mapped DCs in Europe)
const QUERY = `
[out:json][timeout:60];
(
  node["telecom"="data_center"](${EU_BBOX});
  node["building"="data_center"](${EU_BBOX});
  node["building"="data_centre"](${EU_BBOX});
  node["facility"="data_centre"](${EU_BBOX});
  way["telecom"="data_center"](${EU_BBOX});
  way["building"="data_center"](${EU_BBOX});
  way["building"="data_centre"](${EU_BBOX});
  way["facility"="data_centre"](${EU_BBOX});
  relation["telecom"="data_center"](${EU_BBOX});
  relation["building"="data_centre"](${EU_BBOX});
  relation["facility"="data_centre"](${EU_BBOX});
);
out center tags;
`;

function extractCoords(element) {
  if (element.type === 'node') return { lat: element.lat, lng: element.lon };
  if (element.center) return { lat: element.center.lat, lng: element.center.lon };
  return null;
}

function osmSourceUrl(element) {
  return `https://www.openstreetmap.org/${element.type}/${element.id}`;
}

export function useDataCenters() {
  const [dataCenters, setDataCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchDataCenters() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(OVERPASS_URL, {
          method: 'POST',
          body: `data=${encodeURIComponent(QUERY)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`Overpass API error: ${response.status}`);

        const json = await response.json();

        const centers = json.elements
          .map((el) => {
            const coords = extractCoords(el);
            if (!coords) return null;
            return {
              id: `${el.type}-${el.id}`,
              ...coords,
              name: el.tags?.name || el.tags?.operator || 'Data Center',
              operator: el.tags?.operator || null,
              tags: el.tags || {},
              capacityMW: null,
              source: 'osm',
              sourceUrl: osmSourceUrl(el),
              country: el.tags?.['addr:country'] || null,
            };
          })
          .filter(Boolean);

        setDataCenters(centers);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setDataCenters(FALLBACK_DATA_CENTERS);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchDataCenters();
    return () => controller.abort();
  }, []);

  return { dataCenters, loading, error };
}

const FALLBACK_DATA_CENTERS = [
  { id: 'fallback-1',  lat: 48.878, lng: 2.357,  name: 'Equinix PA3 Paris',         operator: 'Equinix',       capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-2',  lat: 48.712, lng: 2.469,  name: 'Data4 Campus Paris-Saclay', operator: 'Data4',         capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-3',  lat: 48.896, lng: 2.251,  name: 'Interxion PAR7',            operator: 'Interxion',     capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-4',  lat: 45.750, lng: 4.871,  name: 'Interxion LYO1 Lyon',       operator: 'Interxion',     capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-5',  lat: 43.296, lng: 5.381,  name: 'SFR DC Marseille',          operator: 'SFR',           capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-6',  lat: 52.370, lng: 4.900,  name: 'Equinix AM1 Amsterdam',     operator: 'Equinix',       capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-7',  lat: 52.340, lng: 4.840,  name: 'Digital Realty AMS',        operator: 'Digital Realty',capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-8',  lat: 51.507, lng: -0.128, name: 'Equinix LD8 London',        operator: 'Equinix',       capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-9',  lat: 53.550, lng: 10.000, name: 'Equinix HH1 Hamburg',       operator: 'Equinix',       capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-10', lat: 52.520, lng: 13.405, name: 'Interxion BER1 Berlin',     operator: 'Interxion',     capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-11', lat: 41.390, lng: 2.154,  name: 'Equinix MD2 Madrid',        operator: 'Equinix',       capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-12', lat: 45.464, lng: 9.188,  name: 'Equinix ML1 Milan',         operator: 'Equinix',       capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-13', lat: 59.334, lng: 18.063, name: 'Equinix SK1 Stockholm',     operator: 'Equinix',       capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-14', lat: 50.850, lng: 4.352,  name: 'Interxion BRU1 Brussels',   operator: 'Interxion',     capacityMW: null, source: 'fallback', sourceUrl: null },
  { id: 'fallback-15', lat: 48.135, lng: 11.582, name: 'Equinix MU1 Munich',        operator: 'Equinix',       capacityMW: null, source: 'fallback', sourceUrl: null },
];
