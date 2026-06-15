import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// Central glossary — add new terms here
export const GLOSSARY = {
  pue: {
    term: 'PUE — Power Usage Effectiveness',
    body: 'Total facility power divided by IT equipment power. PUE 1.0 = perfect (all power goes to compute). PUE 1.5 means 50% extra is spent on cooling, lighting, and infrastructure. Industry average is around 1.55; hyperscalers typically achieve 1.1–1.2.',
  },
  wue: {
    term: 'WUE — Water Usage Effectiveness',
    body: 'Litres of water consumed per kWh of IT load. Water is used in cooling towers and evaporative chillers. WUE 1.0 L/kWh is efficient; values above 2 indicate heavy evaporative cooling, common in warm climates.',
  },
  carbonIntensity: {
    term: 'Carbon intensity (gCO₂/kWh)',
    body: 'Grams of CO₂ equivalent emitted per kilowatt-hour of electricity consumed. Depends on the national grid mix. Norway (hydro) is ~20 gCO₂/kWh; Poland (coal) is ~700. A data center in Poland emits 35× more CO₂ per kWh than one in Norway.',
  },
  waterStress: {
    term: 'Baseline Water Stress',
    body: 'WRI Aqueduct metric: the ratio of annual water withdrawals to available renewable supply in the watershed. Score ≥ 1 = demand already exceeds replenishment. Score 4–5 (Extremely High) means the local area is under severe structural water scarcity.',
  },
  hyperscaler: {
    term: 'Hyperscaler',
    body: 'A cloud provider operating at planetary scale — AWS, Microsoft Azure, Google Cloud, Meta, Apple, Oracle. They build campus-scale facilities of 100–500+ MW, typically with the best PUEs (1.1–1.2) and increasingly 100% renewable energy commitments. Collectively they consume an estimated 15–20 GW in Europe alone.',
  },
  cloud: {
    term: 'Cloud / Regional cloud provider',
    body: "Large-scale cloud and hosting providers that own their own infrastructure but operate at regional rather than planetary scale — OVH, Hetzner, Scaleway, IONOS. OVH is Europe's largest by server count (~400k servers). Distinct from hyperscalers in scale; distinct from colos in that they sell compute, not just space.",
  },
  colocation: {
    term: 'Colocation (Colo)',
    body: 'A data center where multiple tenants rent space, power, and connectivity. The operator (Equinix, Digital Realty, NTT…) owns the building and infrastructure; the tenant brings their own servers. Colos sit at the centre of internet exchange points and are critical for interconnection.',
  },
  carrier: {
    term: 'Carrier / Telco data center',
    body: 'A facility operated by a telecommunications carrier — Deutsche Telekom, Orange, Telefónica, Telia, BT. Originally built to house network and switching equipment, many now also offer colocation. They sit at network junctions and tend to run higher PUEs than purpose-built modern colos.',
  },
  enterprise: {
    term: 'Enterprise data center',
    body: 'A private facility built and run by a single organisation for its own workloads — a bank, hospital, government body, or manufacturer. Often older, smaller, and less efficient (PUE 1.7–2.5+). Many enterprises are migrating to cloud, but regulated sectors keep on-premises infrastructure for compliance.',
  },
  campus: {
    term: 'Campus',
    body: 'A group of data center buildings operated as a single logical site — typically by one operator on one land parcel. Campuses allow operators to scale incrementally: they add buildings as demand grows rather than constructing one massive structure.',
  },
  totalEnergyMWh: {
    term: 'Annual electricity (MWh/yr)',
    body: 'Total electrical energy consumed in one year — IT load plus cooling, lighting, and all facility infrastructure. 1 MWh = 1,000 kWh. An average EU household uses ~3,500 kWh/yr, so a 100 MWh/yr data center powers ~28 homes.',
  },
  itLoad: {
    term: 'IT load vs. cooling',
    body: 'IT load is the power actually used by servers, storage, and networking. Cooling is the overhead required to remove that heat. A PUE of 1.4 means for every 100 W of server load, 40 W extra is spent on mechanical cooling. Reducing PUE is the primary lever for cutting data center energy use.',
  },
  allocatedPower: {
    term: 'Area-based power allocation',
    body: "When a data center's IT capacity is unknown, this tool estimates its share of national DC electricity (from JRC/IEA data) proportional to its mapped footprint area. Larger buildings are assumed to consume more. This is an approximation — actual consumption depends on server density and workload intensity.",
  },
};

const POPOVER_WIDTH = 240;

export function InfoTip({ id, children }) {
  const [pos, setPos]       = useState(null); // { top, left } in viewport coords, or null = closed
  const btnRef              = useRef(null);
  const timerRef            = useRef(null);

  const def = GLOSSARY[id];
  if (!def) return children ?? null;

  const calcPos = useCallback(() => {
    if (!btnRef.current) return null;
    const rect   = btnRef.current.getBoundingClientRect();
    const above  = rect.bottom > window.innerHeight * 0.6;
    const left   = Math.min(
      Math.max(rect.left, 6),                      // don't clip left edge
      window.innerWidth - POPOVER_WIDTH - 6,       // don't clip right edge
    );
    return {
      left,
      top:   above ? rect.top  - 8 : rect.bottom + 8,
      above,
    };
  }, []);

  const show = useCallback(() => {
    clearTimeout(timerRef.current);
    setPos(calcPos());
  }, [calcPos]);

  const hide = useCallback(() => {
    timerRef.current = setTimeout(() => setPos(null), 120);
  }, []);

  const keepOpen = useCallback(() => clearTimeout(timerRef.current), []);

  // Close on outside click
  useEffect(() => {
    if (!pos) return;
    const handler = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target)) setPos(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pos]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const popover = pos && createPortal(
    <div
      className={`infotip-popover ${pos.above ? 'above' : 'below'}`}
      style={{ position: 'fixed', top: pos.above ? undefined : pos.top, bottom: pos.above ? window.innerHeight - pos.top : undefined, left: pos.left }}
      onMouseEnter={keepOpen}
      onMouseLeave={hide}
      role="tooltip"
    >
      <div className="infotip-term">{def.term}</div>
      <div className="infotip-body">{def.body}</div>
    </div>,
    document.body,
  );

  return (
    <span className="infotip-wrap">
      {children}
      <button
        ref={btnRef}
        className={`infotip-btn ${pos ? 'active' : ''}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={() => pos ? setPos(null) : setPos(calcPos())}
        aria-label={`Definition: ${def.term}`}
        tabIndex={0}
      >?</button>
      {popover}
    </span>
  );
}

/**
 * HoverDef — the wrapped element IS the trigger (no "?" button).
 * Hover to preview the definition; click to pin it open until dismissed.
 * Use for short inline definitions on tags/terms (e.g. operator-type chips).
 */
export function HoverDef({ id, children, className = '' }) {
  const [pos, setPos]   = useState(null);
  const [pinned, setPinned] = useState(false);
  const ref             = useRef(null);
  const timerRef        = useRef(null);

  const def = GLOSSARY[id];

  const calcPos = useCallback(() => {
    if (!ref.current) return null;
    const rect  = ref.current.getBoundingClientRect();
    const above = rect.bottom > window.innerHeight * 0.6;
    const left  = Math.min(Math.max(rect.left, 6), window.innerWidth - POPOVER_WIDTH - 6);
    return { left, top: above ? rect.top - 8 : rect.bottom + 8, above };
  }, []);

  const show = useCallback(() => { clearTimeout(timerRef.current); setPos(calcPos()); }, [calcPos]);
  const hide = useCallback(() => {
    if (pinned) return;
    timerRef.current = setTimeout(() => setPos(null), 120);
  }, [pinned]);

  // Close pinned popover on outside click
  useEffect(() => {
    if (!pinned) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setPinned(false); setPos(null); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pinned]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!def) return children ?? null;

  const popover = pos && createPortal(
    <div
      className={`infotip-popover ${pos.above ? 'above' : 'below'}`}
      style={{ position: 'fixed', top: pos.above ? undefined : pos.top, bottom: pos.above ? window.innerHeight - pos.top : undefined, left: pos.left }}
      onMouseEnter={() => clearTimeout(timerRef.current)}
      onMouseLeave={hide}
      role="tooltip"
    >
      <div className="infotip-term">{def.term}</div>
      <div className="infotip-body">{def.body}</div>
    </div>,
    document.body,
  );

  return (
    <span
      ref={ref}
      className={`hoverdef ${pinned ? 'pinned' : ''} ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={(e) => { e.stopPropagation(); setPinned(p => { const np = !p; setPos(np ? calcPos() : null); return np; }); }}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
    >
      {children}
      {popover}
    </span>
  );
}
