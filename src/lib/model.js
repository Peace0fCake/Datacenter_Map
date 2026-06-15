import carbonData    from '../data/carbonIntensity.json';
import dcPowerData  from '../data/dcPowerByCountry.json';

// ── Country populations (2024 estimates) ────────────────────────────────────
const COUNTRY_POPULATION = {
  AT: 9_100_000,  BE: 11_600_000, BG:  6_500_000, CH:  8_700_000,
  CY: 1_200_000,  CZ: 10_900_000, DE: 84_000_000, DK:  5_900_000,
  EE: 1_400_000,  ES: 47_000_000, FI:  5_600_000, FR: 68_000_000,
  GB: 67_000_000, GR: 10_700_000, HR:  3_900_000, HU:  9_700_000,
  IE: 5_100_000,  IS:    380_000, IT: 60_000_000, LT:  2_800_000,
  LU:   660_000,  LV:  1_800_000, NL: 17_800_000, NO:  5_500_000,
  PL: 38_000_000, PT: 10_300_000, RO: 19_000_000, RS:  6_800_000,
  SE: 10_500_000, SI:  2_100_000, SK:  5_500_000, TR: 85_000_000,
  UA: 44_000_000,
};

export function getCountryPopulation(code) {
  return COUNTRY_POPULATION[code] ?? null;
}

// Average watts attributed to data centres per person (TWh → W per capita)
export function getDCWattsPerCapita(code) {
  const power = dcPowerData[code];
  const pop   = COUNTRY_POPULATION[code];
  if (!power || !pop) return null;
  return Math.round(power.twh * 1e12 / 8760 / pop);
}

// Aggregate stats across all countries in dcPowerByCountry
export function getEuropeStats() {
  let totalTwh = 0;
  let weightedIntensityNum = 0;
  const countries = [];

  for (const [code, power] of Object.entries(dcPowerData)) {
    if (code.startsWith('_')) continue;
    const carbon = getCarbonData(code);
    const co2Megatonnes = +(power.twh * carbon.intensity_gco2_kwh * 1e3 / 1e6).toFixed(2);
    const pop = COUNTRY_POPULATION[code] ?? null;
    const wattsPerCapita = pop ? Math.round(power.twh * 1e12 / 8760 / pop) : null;
    totalTwh += power.twh;
    weightedIntensityNum += power.twh * carbon.intensity_gco2_kwh;
    countries.push({ code, name: carbon.name ?? code, twh: power.twh, pct_national: power.pct_national, co2Megatonnes, wattsPerCapita, carbonIntensity: carbon.intensity_gco2_kwh, confidence: power.confidence });
  }

  return {
    totalTwh: +totalTwh.toFixed(1),
    totalCO2Megatonnes: +(countries.reduce((s, c) => s + c.co2Megatonnes, 0)).toFixed(1),
    avgCarbonIntensity: Math.round(weightedIntensityNum / totalTwh),
    countries: [...countries].sort((a, b) => b.twh - a.twh),
  };
}

// ── Operator calibration ─────────────────────────────────────────────────────
// Real PUE and WUE from publicly available CSR / sustainability reports.
// These override the temperature-based model when an operator is matched.
// WUE null = not publicly disclosed; model estimate is used instead.
const OPERATOR_CALIBRATION = {
  // ── Colocation ────────────────────────────────────────────────────────────
  'equinix':        { pue: 1.45, wue: 1.07, source: 'Equinix 2023 Global Sustainability Report', url: 'https://sustainability.equinix.com/' },
  'data4':          { pue: 1.30, wue: 0.50, source: 'Data4 CSR Report 2022',                      url: 'https://www.data4group.com/en/sustainability/' },
  'interxion':      { pue: 1.35, wue: null,  source: 'Digital Realty / Interxion 2022 SR',        url: 'https://www.digitalrealty.com/esg-reports' },
  'digital realty': { pue: 1.47, wue: null,  source: 'Digital Realty 2022 Sustainability Report', url: 'https://www.digitalrealty.com/esg-reports' },
  'global switch':  { pue: 1.39, wue: null,  source: 'Global Switch 2023 Annual Report',           url: 'https://www.globalswitch.com/sustainability/' },
  'globalswitch':   { pue: 1.39, wue: null,  source: 'Global Switch 2023 Annual Report',           url: 'https://www.globalswitch.com/sustainability/' },
  'ntt':            { pue: 1.30, wue: null,  source: 'NTT 2023 Sustainability Data',               url: 'https://www.ntt.com/en/sustainability/' },
  'cyrusone':       { pue: 1.45, wue: null,  source: 'CyrusOne 2022 ESG Report',                  url: 'https://cyrusone.com/esg/' },
  'iron mountain':  { pue: 1.47, wue: null,  source: 'Iron Mountain FY2023 Sustainability Report',url: 'https://www.ironmountain.com/about/responsibility/sustainability' },
  'vantage':        { pue: 1.35, wue: null,  source: 'Vantage Data Centers 2023 ESG Report',      url: 'https://vantage-dc.com/sustainability/' },

  // ── Cloud / regional ──────────────────────────────────────────────────────
  // OVH Group: French public company required to publish DPEF (Déclaration de
  // Performance Extra-Financière). Fleet-average PUE ~1.40 from 2022/2023 DPEF.
  // Their Gravelines (GRA) campus uses proprietary water cooling and claims
  // PUE 1.09–1.15 — significantly better than the fleet average used here.
  'ovh':            { pue: 1.40, wue: null,  source: 'OVH Group DPEF 2023 (fleet average; Gravelines site ~1.15)', url: 'https://corporate.ovhcloud.com/en/sustainability/environment/' },
  'ovhcloud':       { pue: 1.40, wue: null,  source: 'OVH Group DPEF 2023 (fleet average; Gravelines site ~1.15)', url: 'https://corporate.ovhcloud.com/en/sustainability/environment/' },

  // Hetzner: publishes environmental data; uses adiabatic / outside-air cooling
  // in Germany. Cites PUE 1.2 for Falkenstein and Nuremberg campuses.
  'hetzner':        { pue: 1.20, wue: null,  source: 'Hetzner Environmental Report 2023',         url: 'https://www.hetzner.com/unternehmen/umweltschutz/' },

  // ── Hyperscalers ─────────────────────────────────────────────────────────
  // Microsoft: reported global average 1.12 in FY2023 Sustainability Report.
  'microsoft':      { pue: 1.12, wue: null,  source: 'Microsoft FY2023 Sustainability Report',    url: 'https://www.microsoft.com/en-us/sustainability' },
  'azure':          { pue: 1.12, wue: null,  source: 'Microsoft FY2023 Sustainability Report',    url: 'https://www.microsoft.com/en-us/sustainability' },
  // Google: reported 1.10 global average in 2023 Environmental Report.
  'google':         { pue: 1.10, wue: 1.10,  source: 'Google 2023 Environmental Report',         url: 'https://sustainability.google/reports/' },
  // AWS: reported weighted average 1.15 in 2022 Sustainability Report.
  'amazon':         { pue: 1.15, wue: null,  source: 'AWS 2022 Sustainability Report',            url: 'https://sustainability.aboutamazon.com/' },
  'aws':            { pue: 1.15, wue: null,  source: 'AWS 2022 Sustainability Report',            url: 'https://sustainability.aboutamazon.com/' },
};

export function getOperatorCalibration(operatorName) {
  if (!operatorName) return null;
  const lower = operatorName.toLowerCase();
  for (const [key, data] of Object.entries(OPERATOR_CALIBRATION)) {
    if (lower.includes(key)) return data;
  }
  return null;
}

// ── Size / utilization ───────────────────────────────────────────────────────
export function utilizationFromMW(mw) {
  if (mw <= 5)  return 0.55;
  if (mw <= 25) return 0.60;
  return 0.65;
}

// ── DC type inference from operator name ─────────────────────────────────────
const TYPE_KEYWORDS = {
  hyperscaler: ['microsoft', 'azure', 'google', 'amazon', 'aws', 'meta ', 'facebook', 'apple ', 'alibaba', 'baidu', 'tencent'],
  cloud:       ['ovh', 'hetzner', 'scaleway', 'ionos', 'linode', 'vultr', 'leaseweb', 'contabo', 'fastly', 'cloudflare', 'serverius', 'previder', 'hosteurope'],
  colocation:  ['equinix', 'digital realty', 'interxion', 'ntt ', 'cyrusone', 'iron mountain', 'global switch', 'globalswitch', 'vantage', 'data4', 'colt ', 'stack infra', 'ase', 'nldc', 'nabiax', 'ascenty'],
  carrier:     ['telekom', 'telecom', 'telia', 'swisscom', 'bt data', 'orange', 'vodafone', 'telefonica', 'kddi', 'tele2', 'proximus', 'kcell', 'teliasonera'],
};

export function inferDCType(operatorName) {
  if (!operatorName) return null;
  const lower = operatorName.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return type;
  }
  return null;
}

// ── PUE / WUE model (used when no reported value is available) ───────────────
// Research basis:
//   Type adjustment: hyperscale facilities target PUE 1.1-1.2 (IEA/Uptime Institute);
//   enterprise DCs average PUE 1.7-2.0 (Uptime Institute Global Survey 2024).
//   Area adjustment: larger footprint → better cooling economy of scale (~0.05 per decade of m²).
//   Ref: ASHRAE TC 9.9, JRC 2023, Uptime Institute Global DC Survey 2024.
const DC_TYPE_PUE_DELTA = {
  hyperscaler: -0.22,
  cloud:       -0.08,
  colocation:  +0.02,
  carrier:     +0.14,
  enterprise:  +0.30,
};
const DC_TYPE_WUE_DELTA = {
  hyperscaler: -0.45,
  cloud:       -0.15,
  colocation:  +0.00,
  carrier:     +0.20,
  enterprise:  +0.55,
};

function footprintPUEDelta(footprintM2) {
  if (!footprintM2 || footprintM2 <= 0) return 0;
  // Neutral at 10,000 m²; ±0.05 per order of magnitude
  return -0.05 * (Math.log10(footprintM2) - 4);
}
function footprintWUEDelta(footprintM2) {
  if (!footprintM2 || footprintM2 <= 0) return 0;
  return -0.08 * (Math.log10(footprintM2) - 4);
}

export function estimatePUE(avgTempC, dcType = null, footprintM2 = null) {
  const base = 1.40 + 0.012 * avgTempC;
  const typeDelta = DC_TYPE_PUE_DELTA[dcType] ?? 0;
  const sizeDelta = footprintPUEDelta(footprintM2);
  return +Math.min(Math.max(base + typeDelta + sizeDelta, 1.05), 2.2).toFixed(3);
}

export function estimateWUE(avgTempC, dcType = null, footprintM2 = null) {
  const base = 1.2 + 0.04 * Math.max(0, avgTempC - 10);
  const typeDelta = DC_TYPE_WUE_DELTA[dcType] ?? 0;
  const sizeDelta = footprintWUEDelta(footprintM2);
  return +Math.min(Math.max(base + typeDelta + sizeDelta, 0.1), 3.5).toFixed(2);
}

// ── Country fallback (only used when Nominatim fails AND no OSM tag) ─────────
// Checks from smallest / most specific bounding boxes to largest.
export function getCountryFromCoords(lat, lng) {
  // Microstates / islands first to avoid being swallowed by neighbours
  if (lat > 47.5 && lat < 47.8 && lng > 8.5  && lng < 9.6)   return 'LI'; // Liechtenstein
  if (lat > 46.1 && lat < 47.1 && lng > 14.1  && lng < 15.7)  return 'SI'; // Slovenia
  if (lat > 46.8 && lat < 47.5 && lng > 13.8  && lng < 17.2)  return 'AT'; // Austria (partial)
  // Iberian peninsula
  if (lat > 36.0 && lat < 44.0 && lng > -9.5  && lng < -6.2)  return 'PT';
  if (lat > 36.0 && lat < 43.8 && lng > -9.5  && lng < 4.3)   return 'ES';
  // British Isles
  if (lat > 51.4 && lat < 58.7 && lng > -8.2  && lng < -5.5)  return 'IE';
  if (lat > 49.8 && lat < 61.0 && lng > -8.0  && lng < 1.8)   return 'GB';
  // Scandinavia (ordered north→south to avoid overlaps)
  if (lat > 70.0 && lat < 72.0 && lng > 18.0  && lng < 32.0)  return 'NO';
  if (lat > 60.0 && lat < 70.5 && lng > 27.0  && lng < 32.0)  return 'FI';
  if (lat > 60.5 && lat < 70.5 && lng > 4.0   && lng < 27.0)  return 'NO';
  if (lat > 55.3 && lat < 69.0 && lng > 11.0  && lng < 24.5)  return 'SE';
  if (lat > 56.0 && lat < 68.0 && lng > 24.0  && lng < 32.0)  return 'FI';
  // Low countries / DACH
  if (lat > 49.5 && lat < 53.6 && lng > 3.3   && lng < 7.3)   return 'NL';
  if (lat > 49.4 && lat < 51.6 && lng > 2.5   && lng < 6.5)   return 'BE';
  if (lat > 47.3 && lat < 55.1 && lng > 5.9   && lng < 15.1)  return 'DE';
  if (lat > 46.4 && lat < 47.9 && lng > 5.9   && lng < 10.5)  return 'CH';
  if (lat > 46.4 && lat < 49.1 && lng > 9.5   && lng < 17.2)  return 'AT';
  // France
  if (lat > 42.3 && lat < 51.1 && lng > -4.8  && lng < 8.3)   return 'FR';
  // Italy
  if (lat > 36.6 && lat < 47.1 && lng > 6.6   && lng < 18.6)  return 'IT';
  // Iberian catch-all
  if (lat > 35.9 && lat < 43.9 && lng > -9.5  && lng < 4.5)   return 'ES';
  // Poland / Baltic
  if (lat > 53.9 && lat < 56.0 && lng > 20.9  && lng < 26.9)  return 'LT';
  if (lat > 55.6 && lat < 57.6 && lng > 21.0  && lng < 28.3)  return 'LV';
  if (lat > 57.5 && lat < 59.7 && lng > 21.8  && lng < 28.2)  return 'EE';
  if (lat > 49.0 && lat < 54.9 && lng > 14.1  && lng < 24.2)  return 'PL';
  // South-east
  if (lat > 47.0 && lat < 51.0 && lng > 16.1  && lng < 22.9)  return 'HU';
  if (lat > 45.9 && lat < 48.7 && lng > 22.1  && lng < 29.7)  return 'RO';
  if (lat > 42.1 && lat < 45.0 && lng > 22.4  && lng < 28.7)  return 'BG';
  if (lat > 41.0 && lat < 43.0 && lng > 19.3  && lng < 28.4)  return 'GR';
  if (lat > 44.0 && lat < 46.6 && lng > 13.4  && lng < 25.3)  return 'HR';
  if (lat > 43.9 && lat < 46.2 && lng > 19.2  && lng < 22.9)  return 'RS';
  // Denmark
  if (lat > 54.5 && lat < 58.0 && lng > 8.0   && lng < 15.3)  return 'DK';
  // Norway / Sweden remaining
  if (lat > 57.0 && lat < 60.0 && lng > 4.6   && lng < 11.0)  return 'NO';
  return 'EU';
}

// ── Carbon data lookup ───────────────────────────────────────────────────────
export function getCarbonData(countryCode) {
  return carbonData[countryCode] ?? { name: countryCode, intensity_gco2_kwh: 300, renewables_pct: 35, nuclear_pct: 0 };
}

// ── National DC power data (JRC 2023 / IEA) ─────────────────────────────────
export function getCountryDCPower(countryCode) {
  return dcPowerData[countryCode] ?? null;
}

/**
 * Allocate a share of country-level DC electricity to one DC by footprint area.
 * Returns MWh/year, or null if data is unavailable.
 *
 * @param {number}      footprintM2        This DC's footprint in m²
 * @param {string}      countryCode        ISO 3166-1 alpha-2
 * @param {object|null} countryStats       { total_footprint_m2 } from country_dc_stats.json
 */
export function allocateDCPower(footprintM2, countryCode, countryStats) {
  if (!footprintM2 || !countryStats?.total_footprint_m2) return null;
  const power = getCountryDCPower(countryCode);
  if (!power) return null;
  const share = footprintM2 / countryStats.total_footprint_m2;
  return Math.round(power.twh * 1e6 * share);   // MWh/year
}

// ── Core model ───────────────────────────────────────────────────────────────
/**
 * @param {object} params
 * @param {number}  params.capacityMW
 * @param {number}  params.utilizationRate  0–1
 * @param {number}  params.avgTempC         annual average temperature
 * @param {string}  params.countryCode      ISO 3166-1 alpha-2
 * @param {number|null} params.reportedPUE  from CSR report; overrides model
 * @param {number|null} params.reportedWUE  from CSR report; overrides model
 */
export function computeMetrics({ capacityMW, utilizationRate, avgTempC, countryCode, reportedPUE = null, reportedWUE = null, totalEnergyMWhOverride = null, dcType = null, footprintM2 = null }) {
  const pue = reportedPUE ?? estimatePUE(avgTempC, dcType, footprintM2);
  const wue = reportedWUE ?? estimateWUE(avgTempC, dcType, footprintM2);

  // If we have a country-level allocation, use it as total energy directly.
  // Otherwise estimate from capacity × utilization × hours.
  const itEnergyMWh   = totalEnergyMWhOverride
    ? Math.round(totalEnergyMWhOverride / pue)
    : capacityMW * utilizationRate * 8760;
  const itEnergyKWh   = itEnergyMWh * 1000;
  const totalEnergyKWh = totalEnergyMWhOverride
    ? totalEnergyMWhOverride * 1000
    : itEnergyKWh * pue;
  const totalEnergyMWh = totalEnergyKWh / 1000;
  const coolingEnergyKWh = totalEnergyKWh - itEnergyKWh;
  const coolingRatio   = coolingEnergyKWh / totalEnergyKWh;

  const carbon = getCarbonData(countryCode);
  const co2TonnesPerYear = (totalEnergyKWh * carbon.intensity_gco2_kwh) / 1e6;
  const waterM3PerYear   = (coolingEnergyKWh * wue) / 1000;
  const euHouseholds     = Math.round(totalEnergyKWh / 3500);

  return {
    capacityMW, utilizationRate, avgTempC, dcType,
    pue:  +pue.toFixed(3),
    wue:  +wue.toFixed(2),
    pueReported: reportedPUE !== null,
    wueReported: reportedWUE !== null,
    itEnergyMWh:     Math.round(itEnergyMWh),
    totalEnergyMWh:  Math.round(totalEnergyMWh),
    coolingEnergyKWh: Math.round(coolingEnergyKWh),
    coolingRatio:    +coolingRatio.toFixed(3),
    co2TonnesPerYear: Math.round(co2TonnesPerYear),
    waterM3PerYear:  Math.round(waterM3PerYear),
    euHouseholds,
    countryCode,
    carbonIntensity: carbon.intensity_gco2_kwh,
    renewablesPct:   carbon.renewables_pct,
    nuclearPct:      carbon.nuclear_pct ?? 0,
    fossilPct:       100 - carbon.renewables_pct - (carbon.nuclear_pct ?? 0),
    countryName:     carbon.name,
  };
}

// ── WRI Aqueduct water stress labels ────────────────────────────────────────
export function waterStressLabel(score) {
  if (score === null || score === undefined) return { label: 'Unknown',        color: '#94a3b8', level: -1 };
  if (score < 1) return { label: 'Low',              color: '#22c55e', level:  0 };
  if (score < 2) return { label: 'Low–Medium',       color: '#84cc16', level:  1 };
  if (score < 3) return { label: 'Medium–High',      color: '#eab308', level:  2 };
  if (score < 4) return { label: 'High',             color: '#f97316', level:  3 };
  return                 { label: 'Extremely High',  color: '#ef4444', level:  4 };
}
