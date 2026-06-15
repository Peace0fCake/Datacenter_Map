import { useState, useEffect, useCallback } from 'react';
import { GLOSSARY } from './InfoTip';

// ── Tiny SVG helpers (shared across charts) ──────────────────────────────────

function linePath(pts) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}
function areaPath(topPts, botPts) {
  const top = topPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const bot = [...botPts].reverse().map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `${top} ${bot} Z`;
}

function Cite({ href, label = 'src' }) {
  return (
    <a className="outlook-cite" href={href} target="_blank" rel="noopener noreferrer">[{label}]</a>
  );
}

function CiteInline({ href, children }) {
  return <a className="outlook-cite-inline" href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ num, unit, label, href, srcLabel }) {
  return (
    <div className="outlook-stat-card">
      <div className="outlook-stat-num">{num}</div>
      <div className="outlook-stat-unit">{unit}</div>
      <div className="outlook-stat-label">
        {label}
        {href && <>{' '}<a className="outlook-cite" href={href} target="_blank" rel="noopener noreferrer">[{srcLabel ?? 'src'}]</a></>}
      </div>
    </div>
  );
}

// ── Charts from Capacity Outlook ─────────────────────────────────────────────

function ScenarioChart({ history, scenarios }) {
  const W = 640, H = 310;
  const pad = { l: 52, r: 10, t: 18, b: 36 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  const allYears = [...history.years, ...scenarios.years.slice(1)];
  const minYear = allYears[0], maxYear = allYears[allYears.length - 1];
  const maxTwh = 600;
  const yTicks = [0, 100, 200, 300, 400, 500, 600];
  const xS = y => pad.l + (y - minYear) / (maxYear - minYear) * cW;
  const yS = v => pad.t + cH - (v / maxTwh) * cH;
  const histPts = history.years.map((yr, i) => [xS(yr), yS(history.twh[i])]);
  const presentX = xS(scenarios.base_year);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="outlook-svg" aria-label="Scenario chart">
      <defs>
        {scenarios.variants.map(v => (
          <linearGradient key={v.id} id={`grad-${v.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={v.color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={v.color} stopOpacity="0.04" />
          </linearGradient>
        ))}
      </defs>
      {yTicks.map(t => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={yS(t)} y2={yS(t)} stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
          <text x={pad.l - 5} y={yS(t) + 4} textAnchor="end" className="chart-tick">{t}</text>
        </g>
      ))}
      {allYears.filter(y => y % 2 === 0).map(yr => (
        <g key={yr}>
          <line x1={xS(yr)} x2={xS(yr)} y1={pad.t} y2={pad.t + cH} stroke="rgba(128,128,128,0.08)" strokeWidth="1" />
          <text x={xS(yr)} y={H - 8} textAnchor="middle" className="chart-tick">{yr}</text>
        </g>
      ))}
      <line x1={presentX} x2={presentX} y1={pad.t} y2={pad.t + cH} stroke="rgba(128,128,128,0.4)" strokeWidth="1" strokeDasharray="4,3" />
      <text x={presentX + 4} y={pad.t + 11} className="chart-present-label">{scenarios.base_year}</text>
      {[...scenarios.variants].reverse().map(v => {
        const highPts = scenarios.years.map((yr, i) => [xS(yr), yS(v.high[i])]);
        const lowPts  = scenarios.years.map((yr, i) => [xS(yr), yS(v.low[i])]);
        return <path key={`band-${v.id}`} d={areaPath(highPts, lowPts)} fill={`url(#grad-${v.id})`} stroke="none" />;
      })}
      {scenarios.variants.map(v => {
        const pts = scenarios.years.map((yr, i) => [xS(yr), yS(v.twh[i])]);
        return <path key={`line-${v.id}`} d={linePath(pts)} stroke={v.color} strokeWidth="2" fill="none" strokeDasharray="6,3" strokeLinecap="round" />;
      })}
      <path d={linePath(histPts)} stroke="var(--text)" strokeOpacity="0.85" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {histPts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="var(--text)" />)}
      <text x={pad.l - 38} y={pad.t + cH / 2} className="chart-axis-label" transform={`rotate(-90,${pad.l - 38},${pad.t + cH / 2})`}>TWh / year</text>
    </svg>
  );
}

function SourceCompareChart({ data }) {
  const W = 640, H = 230;
  const pad = { l: 170, r: 30, t: 16, b: 34 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  const minV = 70, maxV = 160;
  const xS = v => pad.l + (v - minV) / (maxV - minV) * cW;
  const rowH = cH / data.estimates.length;
  const yS = i => pad.t + rowH * i + rowH / 2;
  const xTicks = [80, 100, 120, 140];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="outlook-svg" aria-label="Source comparison">
      {xTicks.map(t => (
        <g key={t}>
          <line x1={xS(t)} x2={xS(t)} y1={pad.t} y2={pad.t + cH} stroke="rgba(128,128,128,0.1)" strokeWidth="1" />
          <text x={xS(t)} y={H - 8} textAnchor="middle" className="chart-tick">{t}</text>
        </g>
      ))}
      {data.estimates.map((est, i) => {
        const cy = yS(i);
        return (
          <g key={est.source}>
            <text x={pad.l - 8} y={cy + 4} textAnchor="end" className="chart-source-label">{est.source}</text>
            <line x1={xS(est.low)} x2={xS(est.high)} y1={cy} y2={cy} stroke="rgba(99,102,241,0.35)" strokeWidth="6" strokeLinecap="round" />
            <line x1={xS(est.low)}  x2={xS(est.low)}  y1={cy - 6} y2={cy + 6} stroke="#6366f1" strokeWidth="2" />
            <line x1={xS(est.high)} x2={xS(est.high)} y1={cy - 6} y2={cy + 6} stroke="#6366f1" strokeWidth="2" />
            <circle cx={xS(est.twh)} cy={cy} r="5.5" fill="#818cf8" stroke="var(--bg)" strokeWidth="1.5" />
            <text x={xS(est.twh)} y={cy - 10} textAnchor="middle" className="chart-dot-label">{est.twh}</text>
          </g>
        );
      })}
      <text x={pad.l + cW / 2} y={H - 4} textAnchor="middle" className="chart-axis-label">TWh / year</text>
    </svg>
  );
}

function PipelineChart({ pipeline }) {
  const W = 640, H = 340;
  const pad = { l: 118, r: 20, t: 16, b: 36 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  const maxMw = 7000;
  const xS = v => pad.l + (v / maxMw) * cW;
  const rowH = cH / pipeline.countries.length;
  const barH = Math.min(rowH * 0.55, 14);
  const yC = i => pad.t + rowH * i + rowH / 2;
  const xTicks = [0, 2000, 4000, 6000];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="outlook-svg" aria-label="Country pipeline">
      {xTicks.map(t => (
        <g key={t}>
          <line x1={xS(t)} x2={xS(t)} y1={pad.t} y2={pad.t + cH} stroke="rgba(128,128,128,0.1)" strokeWidth="1" />
          <text x={xS(t)} y={H - 8} textAnchor="middle" className="chart-tick">{t === 0 ? '' : `${t / 1000}k`}</text>
        </g>
      ))}
      {pipeline.countries.map((c, i) => {
        const cy = yC(i);
        const total = c.current_mw + c.construction_mw + c.planned_mw;
        const x0 = xS(0), x1 = xS(c.current_mw), x2 = xS(c.current_mw + c.construction_mw), x3 = xS(total);
        return (
          <g key={c.code}>
            <text x={pad.l - 6} y={cy + 4} textAnchor="end" className="chart-country-label">{c.name}</text>
            <rect x={x0} y={cy - barH / 2} width={x1 - x0} height={barH} fill="#6366f1" rx="2" />
            <rect x={x1} y={cy - barH / 2} width={x2 - x1} height={barH} fill="#eab308" rx="2" />
            <rect x={x2} y={cy - barH / 2} width={x3 - x2} height={barH} fill="rgba(234,179,8,0.28)" rx="2" stroke="#eab308" strokeWidth="0.8" strokeDasharray="3,2" />
            <text x={x3 + 5} y={cy + 4} className="chart-bar-label">{(total / 1000).toFixed(1)}k MW</text>
          </g>
        );
      })}
      <text x={pad.l + cW / 2} y={H - 4} textAnchor="middle" className="chart-axis-label">IT load capacity (MW)</text>
    </svg>
  );
}

function ScenarioLegend({ variants }) {
  return (
    <div className="scenario-legend">
      <div className="scenario-legend-meta">
        <div className="legend-entry">
          <svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="var(--text)" strokeOpacity="0.85" strokeWidth="2.5" /></svg>
          <span>Historical (IEA / JRC)</span>
        </div>
        <div className="legend-entry">
          <div className="legend-band" />
          <span className="legend-sub">Shaded = published estimate range</span>
        </div>
      </div>
      <div className="scenario-legend-grid">
        {variants.map(v => (
          <div key={v.id} className="scenario-legend-item">
            <svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke={v.color} strokeWidth="2" strokeDasharray="5,3" /></svg>
            <div>
              <span style={{ color: v.color, fontWeight: 600 }}>{v.label}</span>
              <span className="legend-sub"> — {v.sublabel}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineLegend() {
  return (
    <div className="outlook-legend">
      {[
        { color: '#6366f1', dash: false, label: 'In operation' },
        { color: '#eab308', dash: false, label: 'Under construction' },
        { color: '#eab308', dash: true,  label: 'Announced / planned' },
      ].map(({ color, dash, label }) => (
        <div key={label} className="legend-entry">
          <svg width="22" height="12">
            <rect x="0" y="2" width="22" height="8" fill={dash ? 'rgba(234,179,8,0.28)' : color} rx="2"
              stroke={dash ? color : 'none'} strokeWidth="0.8" strokeDasharray={dash ? '3,2' : ''} />
          </svg>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function ChallengeHeader({ n, title, color = 'var(--accent)' }) {
  return (
    <div className="outlook-challenge-title">
      <span className="outlook-challenge-num" style={{ background: color }}>{n}</span>
      {title}
    </div>
  );
}

// ── Tab 0: What is a Data Center ─────────────────────────────────────────────

const ANATOMY_ITEMS = [
  { label: 'Servers', desc: 'Compute, memory, and storage in standardised rack-mounted units. AI workloads use GPU or TPU accelerators that draw 5–10× more power per unit than CPU servers.' },
  { label: 'Cooling', desc: 'Computer room air handlers (CRAHs), cooling towers, or liquid cold plates. Accounts for 20–50% of total power — the main target for efficiency improvement.' },
  { label: 'Power', desc: 'Utility grid feeds UPS systems and backup generators. A typical campus needs two independent grid connections for redundancy.' },
  { label: 'Networking', desc: 'Fibre links, switches, and routers connecting servers to each other and to internet exchange points. Latency to users drives location decisions.' },
];

const DC_TYPES = [
  {
    name: 'Hyperscale',
    color: 'var(--accent)',
    size: '100 – 1,000+ MW',
    examples: 'AWS, Microsoft Azure, Google, Meta',
    desc: 'Massive campuses built and operated by cloud giants. They run their own servers, serving billions of users. Typically the most energy-efficient (PUE 1.1–1.2) and largest buyers of renewable energy. A single campus can span dozens of buildings.',
  },
  {
    name: 'Colocation',
    color: '#f97316',
    size: '10 – 200 MW',
    examples: 'Equinix, Digital Realty, NTT, Global Switch',
    desc: 'Multi-tenant facilities where companies rent floor space, power, and cooling. The operator builds and maintains the building; tenants bring their own servers. Colos sit at internet exchange points — the physical hubs where networks interconnect.',
  },
  {
    name: 'Cloud / Regional',
    color: '#eab308',
    size: '5 – 100 MW',
    examples: 'OVH, Hetzner, Scaleway, IONOS',
    desc: 'Like hyperscalers in model — they own their servers and sell compute — but at regional scale. OVH is Europe\'s largest by server count (~400k servers). Often more price-competitive than hyperscalers for European customers.',
  },
  {
    name: 'Enterprise',
    color: '#22c55e',
    size: '< 10 MW',
    examples: 'Banks, hospitals, government agencies',
    desc: 'Private facilities run by and for a single organisation. Legacy hardware, older buildings, and often poor efficiency (PUE 1.8–2.5+). Many enterprises are migrating to cloud, but regulated industries retain on-premises infrastructure for compliance.',
  },
];

function WhatIsADC() {
  return (
    <div className="learn-tab-content">
      <div className="outlook-intro">
        <p>
          A <strong>data centre</strong> is a building — or campus of buildings — purpose-built to house
          thousands of servers, storage systems, and networking equipment.
          Every email, stream, video call, web search, and AI response you send passes through one.
        </p>
        <p style={{ marginTop: 8 }}>
          Despite the abstract-sounding name, the physics is mundane: servers run hot, and keeping them
          cool is the core engineering challenge. A large share of every facility's electricity goes
          straight to cooling — not computation. Managing that overhead is what separates an efficient
          modern data centre (PUE 1.1) from an ageing corporate server room (PUE 2.5+).
        </p>
      </div>

      <section className="outlook-section">
        <h3 className="learn-section-title">Inside a data centre</h3>
        <div className="learn-anatomy-grid">
          {ANATOMY_ITEMS.map(({ label, desc }) => (
            <div key={label} className="learn-anatomy-card">
              <div className="learn-anatomy-name">{label}</div>
              <div className="learn-anatomy-desc">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="outlook-section">
        <h3 className="learn-section-title">Types of data centres</h3>
        <div className="outlook-topic-grid">
          {DC_TYPES.map(({ name, color, size, examples, desc }) => (
            <div key={name} className="outlook-topic-card">
              <div className="outlook-topic-card-title" style={{ color }}>{name}</div>
              <div className="outlook-topic-card-stat">{size}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>{examples}</div>
              <p className="outlook-topic-card-text">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="outlook-section">
        <h3 className="learn-section-title">Why location matters</h3>
        <div className="learn-location-list">
          {[
            { factor: 'Power availability', desc: 'The primary constraint. A 500 MW campus needs a dedicated substation — equivalent to powering a small city. Grid-constrained regions like Dublin and Amsterdam now turn away new applications.' },
            { factor: 'Cooling & water', desc: 'Cold climates reduce cooling energy costs dramatically (Nordic data centres use outside air year-round). Water-stressed regions face growing conflicts with evaporative cooling.' },
            { factor: 'Latency to users', desc: 'Milliseconds matter for interactive applications. Most European demand concentrates in a triangle: London–Frankfurt–Amsterdam, near the largest user populations.' },
            { factor: 'Regulations', desc: 'GDPR and sector-specific rules (DORA, NIS2) push operators to keep certain data within specific jurisdictions. The EU AI Act adds compliance requirements for AI inference.' },
            { factor: 'Land & fibre', desc: 'Hyperscale campuses need 50–500 ha. Available land near major internet exchange points (London, Frankfurt, Amsterdam, Paris) is increasingly scarce and expensive.' },
          ].map(({ factor, desc }) => (
            <div key={factor} className="learn-location-row">
              <div className="learn-location-factor">{factor}</div>
              <div className="learn-location-desc">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="outlook-section" style={{ borderBottom: 'none' }}>
        <h3 className="learn-section-title">Key metrics used on this map</h3>
        <div className="learn-metrics-grid">
          {[
            { term: 'IT Capacity (MW)', def: 'The maximum power the servers can draw. 1 MW ≈ enough compute for a mid-size enterprise. Hyperscale campuses reach 500–1,000+ MW.' },
            { term: 'PUE', def: 'Power Usage Effectiveness. Total facility power ÷ IT power. PUE 1.0 = perfect. PUE 1.5 = 50% overhead on cooling. Industry average ~1.58.' },
            { term: 'WUE (L/kWh)', def: 'Water Usage Effectiveness. Litres of water consumed per kWh of IT load. WUE 0 = air-cooled. WUE 2+ = heavy evaporative cooling.' },
            { term: 'Footprint (ha)', def: 'Total roof area of data centre buildings, from OpenStreetMap mapping. Used to allocate a share of national DC electricity to each campus.' },
          ].map(({ term, def }) => (
            <div key={term} className="learn-metric-card">
              <div className="learn-metric-term">{term}</div>
              <div className="learn-metric-def">{def}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Tab 1: The AI Boom ────────────────────────────────────────────────────────

const AI_TIMELINE = [
  { year: '2017', event: 'Attention is All You Need', desc: 'Google researchers publish the Transformer architecture — the foundation for all modern large language models.' },
  { year: '2020', event: 'GPT-3', desc: 'OpenAI\'s 175-billion-parameter model demonstrates emergent capabilities. Training cost: ~$5M, ~350 MWh.' },
  { year: '2022', event: 'ChatGPT launches', desc: '100 million users in two months — the fastest product adoption in history. Inference demand scales overnight.' },
  { year: '2023', event: 'GPT-4 & the race', desc: 'Microsoft, Google, Meta and Amazon each accelerate AI infrastructure spending by billions. EU passes the AI Act.' },
  { year: '2024', event: '$500B+ capex wave (Stargate)', desc: 'The US Stargate project announces $500B in AI infrastructure over four years. Microsoft, Google, Amazon and Meta each individually commit $50B+ for 2024. GPU cluster campuses reshape which European sites get built.' },
  { year: '2025', event: 'DeepSeek & the efficiency debate', desc: 'DeepSeek R1 demonstrates competitive LLM performance at a fraction of frontier US compute costs, briefly sparking optimism that AI demand would plateau. Hyperscaler capex accelerated regardless — Microsoft and Google each exceeded $80B in committed 2025 spend. European grids begin formally rationing industrial connections.' },
  { year: '2026', event: 'Power crunch & regulatory enforcement', desc: 'EU AI Act enforcement begins. EirGrid and grid operators in the Netherlands, Germany, and parts of Spain report connection queue backlogs of 5–10 years. Spain, Poland, and the Nordics absorb growth as saturated hubs restrict further builds. EU EED mandatory waste-heat reporting takes effect.' },
];

function TheAIBoom() {
  return (
    <div className="learn-tab-content">
      <div className="outlook-intro">
        <p>
          For two decades, data centre electricity grew slowly — roughly tracking internet usage.
          Then came large language models. The compute needed to train and run AI at scale
          is orders of magnitude larger than traditional workloads, and it is arriving faster
          than the grid can absorb it.
        </p>
      </div>

      <section className="outlook-section">
        <h3 className="learn-section-title">What changed: power density</h3>
        <div className="outlook-topic-grid">
          <div className="outlook-topic-card">
            <div className="outlook-topic-card-title">Traditional server rack</div>
            <div className="outlook-topic-card-stat">5 – 10 kW</div>
            <p className="outlook-topic-card-text">
              A rack of CPU servers running web, database, or storage workloads draws 5–10 kW.
              Standard cooling infrastructure — raised floors, computer room air handlers — is
              designed around this density.
            </p>
          </div>
          <div className="outlook-topic-card">
            <div className="outlook-topic-card-title">AI GPU rack</div>
            <div className="outlook-topic-card-stat" style={{ color: '#f97316' }}>50 – 130 kW</div>
            <p className="outlook-topic-card-text">
              A rack of NVIDIA H100 or H200 GPUs draws 50–130 kW — up to 13× more.
              Standard air cooling cannot remove this heat fast enough.
              Liquid cooling and direct-to-chip cooling are now mandatory for high-density AI deployments.
              <Cite href="https://www.nvidianews.nvidia.com/news/nvidia-accelerated-computing-platform" label="NVIDIA" />
            </p>
          </div>
          <div className="outlook-topic-card">
            <div className="outlook-topic-card-title">Training vs. Inference</div>
            <div className="outlook-topic-card-stat" style={{ color: '#eab308' }}>Two distinct workloads</div>
            <p className="outlook-topic-card-text">
              <strong>Training</strong>: compute-intensive, runs for weeks or months on thousands of GPUs,
              produces the model. GPT-4 training: estimated ~50 GWh — enough to power ~14,000 EU homes for a year.{' '}
              <Cite href="https://www.iea.org/reports/electricity-2024" label="IEA 2024" />{' '}
              <strong>Inference</strong>: runs continuously to answer queries, uses less power per request
              but aggregates to much more total energy across billions of daily interactions.
            </p>
          </div>
          <div className="outlook-topic-card">
            <div className="outlook-topic-card-title">A single query's footprint</div>
            <div className="outlook-topic-card-stat" style={{ color: '#ef4444' }}>10× a Google search</div>
            <p className="outlook-topic-card-text">
              One ChatGPT response consumes roughly <strong>0.001–0.01 kWh</strong> — about 10× the energy
              of a Google search.{' '}
              <Cite href="https://www.iea.org/energy-system/buildings/data-centres-and-data-transmission-networks" label="IEA" />{' '}
              Multiplied across billions of daily queries, inference is already a measurable fraction
              of global electricity demand — and growing.
            </p>
          </div>
        </div>
      </section>

      <section className="outlook-section">
        <h3 className="learn-section-title">Timeline</h3>
        <div className="learn-timeline">
          {AI_TIMELINE.map(({ year, event, desc }) => (
            <div key={year} className="learn-timeline-row">
              <div className="learn-timeline-year">{year}</div>
              <div className="learn-timeline-dot" />
              <div className="learn-timeline-body">
                <div className="learn-timeline-event">{event}</div>
                <div className="learn-timeline-desc">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="outlook-section">
        <h3 className="learn-section-title">Europe specifically</h3>
        <div className="outlook-solutions">
          {[
            {
              title: 'Hyperscaler investments',
              text: 'Microsoft pledged €3.2B in Germany, €4.3B in France, and €14.8B across the Nordics and UK through 2025–2026. Google committed €1B+ in Finland and is building new campuses in Poland and Belgium. Amazon is expanding across 10+ European markets. These aren\'t incremental upgrades — they are purpose-built GPU cluster campuses.',
            },
            {
              title: 'Sovereign AI',
              text: 'France (Mistral), Germany (Aleph Alpha), the UK (various), and the EU Commission are funding domestic AI compute to reduce dependence on US hyperscalers. The EU AI Act and GDPR pressure also push companies to keep AI inference within European borders, driving a parallel public-sector data centre investment track.',
            },
            {
              title: 'DeepSeek & the efficiency question',
              text: 'In early 2025, DeepSeek R1 showed that frontier-grade AI could be achieved at a fraction of assumed compute costs. This sparked debate about whether demand growth would slow. In practice, hyperscalers treated efficiency gains as an opportunity to serve more users at the same cost — capex did not decrease.',
            },
            {
              title: 'Grid rationing',
              text: 'Ireland, the Netherlands, and parts of Germany are now formally rationing grid connections. EirGrid has placed Dublin in a moratorium for new large connections. The next wave is rotating to Spain (solar-rich), Poland (cheaper land), and the Nordics (clean power) — wherever grid capacity still exists.',
            },
          ].map(({ title, text }) => (
            <div key={title} className="outlook-solution-card">
              <div className="outlook-solution-title">{title}</div>
              <p className="outlook-solution-text">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="outlook-section" style={{ borderBottom: 'none' }}>
        <div className="outlook-stat-strip">
          <StatCard num="$500B+" unit="Stargate" label="US AI infrastructure commitment announced Jan 2025, targeting 20+ new campuses over 4 years" />
          <StatCard num="~50 GWh" unit="per model" label="Estimated energy to train GPT-4 — equivalent to 14,000 EU homes powered for a year" href="https://www.iea.org/reports/electricity-2024" srcLabel="IEA" />
          <StatCard num="10×" unit="per query" label="Energy cost of a ChatGPT response versus a Google search" href="https://www.iea.org/energy-system/buildings/data-centres-and-data-transmission-networks" srcLabel="IEA" />
        </div>
      </section>
    </div>
  );
}

// ── Tab 2: Environmental Impact (was Capacity Outlook) ───────────────────────

function EnvironmentalImpact({ data }) {
  return (
    <div className="learn-tab-content">
      <div className="outlook-intro">
        <p>
          Data centres already consume roughly <strong>1–2% of global electricity</strong>.
          The AI boom is accelerating that share sharply. The impacts span energy, carbon, water, land, and hardware.
          Below is a structured look at each dimension — with the numbers to back it up.
        </p>
      </div>

      <div className="outlook-stat-strip">
        <StatCard num="~158" unit="TWh/yr" label="European data centre electricity in 2025 (preliminary) — up 58% since 2022, driven by AI buildout" href="https://www.iea.org/reports/electricity-2025" srcLabel="IEA 2025" />
        <StatCard num="29%" unit="of Irish grid" label="Share of Ireland's electricity consumed by data centres in 2025, up from 5% in 2015" href="https://www.eirgrid.ie/grid-your-home/electricity-network/grid-statistics" srcLabel="EirGrid 2025" />
        <StatCard num="1–5 M" unit="litres/day" label="Water evaporated by a single 100 MW data centre using evaporative cooling" href="https://arxiv.org/abs/2304.03271" srcLabel="Li et al. 2023" />
        <StatCard num="1.58" unit="avg PUE" label="Industry-average Power Usage Effectiveness in 2023. For every 1 W of computing, 0.58 W is overhead" href="https://uptimeinstitute.com/resources/research-and-reports/uptime-institute-global-data-center-survey-results-2023" srcLabel="Uptime Institute 2023" />
      </div>

      {!data ? (
        <div className="outlook-loading"><span className="spinner" />Loading charts…</div>
      ) : (<>

        <section className="outlook-section outlook-challenge">
          <ChallengeHeader n="1" title="The energy explosion" color="#6366f1" />
          <p className="outlook-challenge-text">
            European data centres used around 77 TWh in 2018.{' '}
            <Cite href="https://publications.jrc.ec.europa.eu/repository/handle/JRC135926" label="JRC 2023" />
            {' '}By 2025 that had reached ~158 TWh — a 58% jump in three years driven almost entirely by AI infrastructure.{' '}
            <Cite href="https://www.iea.org/reports/electricity-2025" label="IEA 2025" />
            {' '}The primary driver is the Stargate and equivalent hyperscaler programmes: over <strong>$500 billion</strong> in committed global
            data centre investment through 2029. Even the most optimistic efficiency scenario implies a further 20% increase by 2030.
            Unconstrained AI buildout scenarios approach 3× today's demand within five years.
          </p>
          <ScenarioChart history={data.history} scenarios={data.scenarios} />
          <ScenarioLegend variants={data.scenarios.variants} />
          <p className="outlook-note">
            Sources: <CiteInline href="https://www.iea.org/reports/electricity-2024">IEA Electricity 2024</CiteInline>
            {' · '}<CiteInline href="https://publications.jrc.ec.europa.eu/repository/handle/JRC135926">JRC European Data Centres 2023</CiteInline>
            {' · Goldman Sachs AI Power Surge April 2024 · Rystad Energy Data Centre Outlook 2024.'}
          </p>
        </section>

        <section className="outlook-section outlook-challenge">
          <ChallengeHeader n="2" title="Grid saturation & the location trap" color="#f97316" />
          <p className="outlook-challenge-text">
            Data centres must be near population centres for low latency, yet those same areas have the most
            congested transmission grids. As their share of national electricity grows, they are reshaping
            infrastructure investment priorities and triggering planning restrictions across Europe.
          </p>
          <div className="outlook-topic-grid">
            <div className="outlook-topic-card">
              <div className="outlook-topic-card-title">Ireland — saturated</div>
              <div className="outlook-topic-card-stat">~29% of national grid</div>
              <p className="outlook-topic-card-text">
                EirGrid formally placed Dublin in a moratorium for new large grid connections.{' '}
                <Cite href="https://www.eirgrid.ie/industry/tomorrows-energy-scenarios" label="EirGrid TES 2024" />
                {' '}Data centres now consume nearly a third of Ireland's electricity — up from 5% in 2015. New projects are diverting to Cork and other regional sites.
              </p>
            </div>
            <div className="outlook-topic-card">
              <div className="outlook-topic-card-title">Netherlands — moratorium</div>
              <div className="outlook-topic-card-stat">5.6% of national grid</div>
              <p className="outlook-topic-card-text">
                Amsterdam imposed a temporary ban on new data centre construction in 2019. Netbeheer Nederland warned
                in 2023 that industrial power connection requests cannot be fulfilled in several provinces before 2028.{' '}
                <Cite href="https://www.netbeheernederland.nl/publicaties/capaciteitsplannen" label="Netbeheer NL 2023" />
              </p>
            </div>
            <div className="outlook-topic-card">
              <div className="outlook-topic-card-title">Spain — new frontier</div>
              <div className="outlook-topic-card-stat">~6 GW planned in Madrid</div>
              <p className="outlook-topic-card-text">
                As saturated northern markets slow approvals, operators are targeting Spain's cheaper land and abundant
                solar. The Madrid region alone has over 6 GW of announced capacity. Grid upgrade timelines lag announced
                projects by years.
              </p>
            </div>
            <div className="outlook-topic-card">
              <div className="outlook-topic-card-title">Nordic advantage</div>
              <div className="outlook-topic-card-stat">Cool air + near-zero-carbon power</div>
              <p className="outlook-topic-card-text">
                Sweden, Finland, and Norway offer near-zero-carbon hydro/wind, cool ambient air that cuts cooling
                costs, and available land. Meta's Odense campus (Denmark) supplies waste heat to 11,000 homes.{' '}
                <Cite href="https://sustainability.fb.com/" label="Meta Sustainability" />
              </p>
            </div>
          </div>
        </section>

        <section className="outlook-section outlook-challenge">
          <ChallengeHeader n="3" title="Hidden water consumption" color="#0ea5e9" />
          <p className="outlook-challenge-text">
            <strong>Water Usage Effectiveness (WUE)</strong> measures litres of water consumed per kWh of IT load.
            Evaporative cooling — the most common and energy-efficient method — sprays water into warm air to cool it,
            but consumes significant water at scale. A 100 MW facility with WUE 1.5 uses roughly 1.3 billion litres
            per year — about 370 Olympic swimming pools. That water evaporates and does not return to the local watershed.
          </p>
          <div className="outlook-topic-grid">
            <div className="outlook-topic-card">
              <div className="outlook-topic-card-title">Industry average WUE</div>
              <div className="outlook-topic-card-stat" style={{ color: '#f97316' }}>~1.8 L/kWh</div>
              <p className="outlook-topic-card-text">
                Best-in-class hyperscalers report 0.5–1.1 L/kWh. Older facilities can exceed 3 L/kWh.
                Training GPT-3 is estimated to have evaporated ~700,000 litres of water.{' '}
                <Cite href="https://arxiv.org/abs/2304.03271" label="Li et al. 2023" />
              </p>
            </div>
            <div className="outlook-topic-card">
              <div className="outlook-topic-card-title">Cooling technology tradeoffs</div>
              <div className="outlook-topic-card-stat" style={{ color: '#22c55e' }}>PUE vs WUE</div>
              <p className="outlook-topic-card-text">
                Dry coolers reject heat to air without consuming water — but use more electricity (higher PUE).
                Free-air cooling achieves WUE near 0 but only in cool climates.
                Liquid cooling (high-density AI racks) approaches PUE 1.0 with minimal water, but requires
                purpose-built server hardware.
              </p>
            </div>
            <div className="outlook-topic-card">
              <div className="outlook-topic-card-title">Local water stress</div>
              <div className="outlook-topic-card-stat" style={{ color: '#eab308' }}>Conflict with climate change</div>
              <p className="outlook-topic-card-text">
                Southern Spain and Portugal — now targeted for large campuses — have among the highest water
                stress scores in Europe. Amsterdam has banned drinking water use for DC cooling. Climate change
                will reduce summer river flows across central Europe through the 2030s.{' '}
                <Cite href="https://www.eea.europa.eu/en/topics/in-depth/water" label="EEA" />
              </p>
            </div>
            <div className="outlook-topic-card">
              <div className="outlook-topic-card-title">Waste heat recovery</div>
              <div className="outlook-topic-card-stat" style={{ color: '#22c55e' }}>70–80% as recoverable heat</div>
              <p className="outlook-topic-card-text">
                Stockholm Exergi captures DC waste heat to warm 10% of the city.{' '}
                <Cite href="https://www.stockholmexergi.se/" label="Stockholm Exergi" />
                {' '}Munich's Stadtwerke plans to use a Google campus to heat 50,000 homes by 2030.
                The EU Energy Efficiency Directive now requires new large DCs to report and, where feasible,
                connect waste heat to district heating.
              </p>
            </div>
          </div>
        </section>

        <section className="outlook-section outlook-challenge">
          <ChallengeHeader n="4" title="Land use & hardware" color="#8b5cf6" />
          <div className="outlook-topic-grid">
            <div className="outlook-topic-card">
              <div className="outlook-topic-card-title">Land footprint</div>
              <div className="outlook-topic-card-stat">50 – 500 ha per hyperscale campus</div>
              <p className="outlook-topic-card-text">
                Large campuses displace agricultural land, green space, or industrial zones. Planning
                systems in saturated markets now require environmental impact assessments specifically
                addressing land use, habitat, and visual impact alongside grid and water.
              </p>
            </div>
            <div className="outlook-topic-card">
              <div className="outlook-topic-card-title">Hardware lifecycle & e-waste</div>
              <div className="outlook-topic-card-stat">3 – 5 year refresh cycles</div>
              <p className="outlook-topic-card-text">
                AI hardware (GPUs, HBM memory) is expensive and rare — rare-earth minerals, advanced
                chips fabricated on 4–3 nm processes. Refresh cycles of 3–5 years generate significant
                e-waste. The upstream manufacturing footprint (energy for chip fab, mining) can rival
                the operational carbon over a server's lifetime.
              </p>
            </div>
          </div>
        </section>

        <section className="outlook-section outlook-challenge">
          <ChallengeHeader n="5" title="Why we don't know the real numbers" color="#8b5cf6" />
          <p className="outlook-challenge-text">
            There is no single authoritative count of European data centre energy use. Six major institutions
            studying the same question reach answers differing by ~30%. The gap comes from different country
            scopes, whether edge computing is included, and whether estimates are built bottom-up or top-down.
            The EU Energy Efficiency Directive (recast 2023) mandates disclosure for facilities above 500 kW
            from 2024 — this should significantly improve data quality over the next few years.
          </p>
          <SourceCompareChart data={data.source_comparison} />
          <p className="outlook-note">
            {data.source_comparison.note}
            {' Sources: '}
            <CiteInline href="https://publications.jrc.ec.europa.eu/repository/handle/JRC135926">JRC 2024</CiteInline>
            {' · '}
            <CiteInline href="https://www.iea.org/reports/electricity-2025">IEA Electricity 2025</CiteInline>
            {' · IRENA 2024 · EPRI 2024 · Goldman Sachs 2025 · Rystad Energy 2025.'}
          </p>
        </section>

        <section className="outlook-section outlook-challenge">
          <ChallengeHeader n="6" title="Where is the growth going?" color="#eab308" />
          <p className="outlook-challenge-text">
            The pipeline of announced and under-construction capacity dwarfs what exists today.
            The United Kingdom leads Europe in both operational capacity and announced projects.{' '}
            <Cite href="https://www.cbre.com/insights/figures/european-data-centres-figures-h1-2024" label="CBRE H1 2024" />
            {' '}Ireland and the Netherlands are already constrained; growth is rotating toward Spain,
            Poland, and the Nordics.
          </p>
          <PipelineChart pipeline={data.pipeline} />
          <PipelineLegend />
          <p className="outlook-note">
            Sources: <CiteInline href="https://www.cbre.com/insights/figures/european-data-centres-figures-h2-2024">CBRE European Data Centre MarketView H2 2024</CiteInline>
            {' · Data Center Dynamics Pipeline Tracker Q1 2025 · Cushman & Wakefield 2025.'}
          </p>
        </section>

        <section className="outlook-section outlook-challenge" style={{ borderBottom: 'none' }}>
          <div className="outlook-challenge-title" style={{ color: '#22c55e' }}>Responses & what to watch</div>
          <div className="outlook-solutions">
            {[
              { title: 'EU Energy Efficiency Directive', href: 'https://energy.ec.europa.eu/topics/energy-efficiency/energy-efficiency-targets-directive-and-rules/energy-efficiency-directive_en', text: 'From 2024, data centres ≥500 kW must register and disclose energy use, PUE, and temperature setpoints in the EU. From 2026, waste heat reporting is mandatory. This will dramatically improve data quality and create regulatory pressure to improve efficiency.' },
              { title: 'Efficiency gains', href: 'https://uptimeinstitute.com/resources/research-and-reports/uptime-institute-global-data-center-survey-results-2023', text: 'Industry-average PUE fell from ~2.0 in 2010 to ~1.58 in 2023. Hyperscalers average ~1.2. Liquid cooling, AI-driven thermal management, and higher server inlet temperatures are pushing it lower.' },
              { title: 'Grid co-investment', href: 'https://www.iea.org/reports/electricity-2024', text: 'Some operators now fund grid infrastructure directly. Microsoft contributed to substation upgrades in Sweden; Amazon co-funded undersea cable projects in Norway. This is likely to become a standard condition of planning approval in grid-constrained markets.' },
              { title: 'Modular & remote siting', href: 'https://bulk.no/', text: 'Pre-fabricated data centre containers can be deployed near generation sources — offshore wind, hydro — rather than population centres, reducing grid load in congested areas.' },
            ].map(({ title, href, text }) => (
              <div key={title} className="outlook-solution-card">
                <div className="outlook-solution-title">
                  <a href={href} target="_blank" rel="noopener noreferrer" className="outlook-solution-link">{title}</a>
                </div>
                <p className="outlook-solution-text">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </>)}
    </div>
  );
}

// ── Tab 3: Glossary ───────────────────────────────────────────────────────────

const EXTENDED_GLOSSARY = [
  ...Object.entries(GLOSSARY).map(([, def]) => ({ term: def.term, body: def.body })),
  {
    term: 'MW — Megawatt',
    body: 'The unit of IT capacity used in this map. 1 MW = 1,000 kW = 1,000,000 W. A small edge data centre might be 0.1–1 MW. A hyperscale campus can reach 500–1,000 MW. Power (MW) × time (hours) = energy (MWh).',
  },
  {
    term: 'TWh — Terawatt-hour',
    body: 'Unit of energy: 1 TWh = 1,000,000 MWh = 1 billion kWh. Used to express national or continental electricity production and consumption. European data centres together consume ~100 TWh/yr — roughly the Netherlands\' total annual electricity use.',
  },
  {
    term: 'gCO₂eq/kWh — Carbon intensity',
    body: 'Grams of CO₂ equivalent per kilowatt-hour. Measures how much carbon is embedded in each unit of electricity, given the generation mix. Norway (near-100% hydro): ~23 g. Poland (coal-heavy): ~600 g. A data centre in Poland emits ~26× more CO₂ per kWh than one in Norway.',
  },
  {
    term: 'PPA — Power Purchase Agreement',
    body: 'A long-term contract between a data centre operator and a renewable energy producer. PPAs let operators claim renewable energy on an annual matching basis. Importantly, the actual electrons running the servers still come from the local grid — which may be coal-heavy. For this reason, this map uses grid carbon intensity rather than PPA claims.',
  },
  {
    term: '24/7 CFE — Carbon-Free Energy',
    body: 'A more demanding standard than annual PPAs. 24/7 CFE means matching every hour of consumption with renewable generation in the same grid zone, in real time. Google, Microsoft, and others are pursuing this as a higher bar for genuine zero-carbon claims.',
  },
  {
    term: 'GPU — Graphics Processing Unit',
    body: 'The key hardware accelerator for AI training and inference. Unlike CPUs (few fast cores for sequential tasks), GPUs have thousands of smaller cores optimised for parallel matrix operations — exactly what neural network training requires. A single NVIDIA H100 GPU draws 700W; a rack of 8 draws 5.6 kW just for the GPUs, plus cooling overhead.',
  },
  {
    term: 'UPS — Uninterruptible Power Supply',
    body: 'Battery or flywheel systems that bridge the gap between grid power loss and diesel generator startup. Data centres require near-continuous uptime (99.99%+), so UPS systems are sized for 30 seconds to 10 minutes of full load. Their embodied carbon and replacement cycles add to operational impact.',
  },
  {
    term: 'IXP — Internet Exchange Point',
    body: 'Physical infrastructure where internet service providers and networks interconnect to exchange traffic directly, reducing latency and cost. Major European IXPs (AMS-IX in Amsterdam, DE-CIX in Frankfurt, LINX in London) drive co-location demand in those cities.',
  },
];

function GlossaryTab() {
  const [search, setSearch] = useState('');
  const filtered = EXTENDED_GLOSSARY.filter(g =>
    !search || g.term.toLowerCase().includes(search.toLowerCase()) || g.body.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="learn-tab-content">
      <div className="outlook-intro">
        <p>
          Definitions of the technical terms used throughout this map and the explainer sections.
          Hover or tap the <strong>?</strong> badges anywhere on the map panels to see these inline.
        </p>
      </div>
      <div style={{ padding: '0 24px 16px' }}>
        <input
          className="glossary-search"
          type="text"
          placeholder="Search terms…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="glossary-list">
        {filtered.map(({ term, body }) => (
          <div key={term} className="glossary-entry">
            <div className="glossary-term">{term}</div>
            <div className="glossary-body">{body}</div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '24px', color: 'var(--text-muted)', textAlign: 'center' }}>No terms match "{search}"</div>
        )}
      </div>
    </div>
  );
}

// ── Tab 4: Methodology ────────────────────────────────────────────────────────

function Methodology({ campusStats = null }) {
  // Live dataset figures (from campus_metrics.json) so displayed counts never drift.
  const totalCampuses = campusStats?.totalCampusCount;
  const noOpCount     = campusStats?.noOperatorCount;
  const noOpPct       = campusStats?.noOperatorPct;
  const fmtCount = n => (n != null ? n.toLocaleString() : '—');

  return (
    <div className="learn-tab-content">
      <div className="outlook-intro">
        <p>
          All energy, CO₂, and water figures on this map are <strong>estimates</strong>.
          Data centres rarely publish their electricity consumption. This page explains exactly
          how each figure is derived, what the uncertainty is, and where the data comes from.
        </p>
      </div>

      <section className="outlook-section">
        <h3 className="learn-section-title">Step 1 — DC locations from OpenStreetMap</h3>
        <p className="outlook-challenge-text">
          Data centre buildings and campuses are sourced from{' '}
          <CiteInline href="https://www.openstreetmap.org">OpenStreetMap (OSM)</CiteInline>{' '}
          via the Overpass API, using 24 tag combinations that capture facilities tagged as
          data centres, server rooms, or telecommunications infrastructure across 48 European countries.
          Buildings are clustered into campuses using a union-find algorithm on overlapping or adjacent polygons.
        </p>
        <p className="outlook-challenge-text" style={{ marginTop: 8 }}>
          <strong>Limitation:</strong> OSM coverage is uneven. Western Europe (UK, Germany, France, Netherlands)
          is well-mapped. Eastern Europe, Turkey, and the Balkans are under-represented.
          Hyperscale campuses are systematically under-represented because operators rarely tag their facilities
          in OSM. This map captures {fmtCount(totalCampuses)} campuses — a significant fraction of European capacity, but not all of it.
        </p>
      </section>

      <section className="outlook-section">
        <h3 className="learn-section-title">Step 2 — Power estimation</h3>
        <p className="outlook-challenge-text">
          For most facilities, no published capacity figure exists. Two methods are used:
        </p>
        <div className="outlook-topic-grid" style={{ marginTop: 12 }}>
          <div className="outlook-topic-card">
            <div className="outlook-topic-card-title" style={{ color: '#6366f1' }}>Area-based allocation (primary)</div>
            <div className="outlook-topic-card-stat">Used when footprint is known</div>
            <p className="outlook-topic-card-text">
              Each DC's share of its country's total mapped footprint determines its share of that
              country's total DC electricity (from JRC/IEA/national operator data). This is the
              primary method because it ties every campus back to measured national statistics.
              <br /><br />
              <code style={{ fontSize: 10, background: 'var(--surface2)', padding: '2px 4px', borderRadius: 3 }}>
                DC_energy = country_TWh × dc_footprint / country_total_footprint
              </code>
              <br /><br />
              Assumes power density is uniform across all DCs in a country — a simplification that
              ignores workload differences between old enterprise and modern hyperscale.
            </p>
          </div>
          <div className="outlook-topic-card">
            <div className="outlook-topic-card-title" style={{ color: '#f97316' }}>Capacity model (fallback)</div>
            <div className="outlook-topic-card-stat">Used when footprint allocation is unavailable</div>
            <p className="outlook-topic-card-text">
              When a campus has a capacity (MW) figure but no usable footprint share, energy is
              estimated from capacity and utilisation. Note: OSM capacity is itself derived from
              building footprint (~300 W/m²), so it is an estimate, not a measured value.
              <br /><br />
              <code style={{ fontSize: 10, background: 'var(--surface2)', padding: '2px 4px', borderRadius: 3 }}>
                IT_energy = capacity × utilisation × 8,760 h
              </code>
              <br /><br />
              Utilisation: 55% (&lt;5 MW), 60% (5–25 MW), 65% (&gt;25 MW) — conservative estimates from JRC 2023.
            </p>
          </div>
        </div>
      </section>

      <section className="outlook-section">
        <h3 className="learn-section-title">Step 3 — PUE &amp; WUE</h3>
        <div className="outlook-topic-grid">
          <div className="outlook-topic-card">
            <div className="outlook-topic-card-title">PUE model</div>
            <p className="outlook-topic-card-text">
              Base estimate from annual average temperature, then adjusted for operator type and campus size:
              <br /><br />
              <code style={{ fontSize: 10, background: 'var(--surface2)', padding: '2px 4px', borderRadius: 3 }}>
                PUE = 1.40 + 0.012 × T°C, clamped [1.05, 2.2]
              </code>
              <br /><br />
              <strong>Operator-type delta:</strong> hyperscaler −0.22, cloud −0.08, colocation +0.02, carrier +0.14, enterprise +0.30.
              Larger campuses also trend lower (−0.05 per decade of log footprint above 10,000 m²).
              Overridden by reported values for 15+ named operators (Microsoft 1.12, Google 1.10, Equinix 1.45, etc.).
            </p>
          </div>
          <div className="outlook-topic-card">
            <div className="outlook-topic-card-title">WUE model</div>
            <p className="outlook-topic-card-text">
              Base estimate from temperature, then adjusted for operator type and campus size:
              <br /><br />
              <code style={{ fontSize: 10, background: 'var(--surface2)', padding: '2px 4px', borderRadius: 3 }}>
                WUE = 1.2 + 0.04 × max(0, T − 10), clamped [0.1, 3.5]
              </code>
              <br /><br />
              <strong>Operator-type delta:</strong> hyperscaler −0.45, cloud −0.15, carrier +0.20, enterprise +0.55.
              Larger campuses also trend lower (−0.08 per decade of log footprint above 10,000 m²).
              WUE rises in warm climates where evaporative cooling is used more heavily.
              Fewer operators publish WUE than PUE, so model estimates are used more often.
            </p>
          </div>
        </div>
      </section>

      <section className="outlook-section">
        <h3 className="learn-section-title">Step 4 — CO₂ &amp; water</h3>
        <div className="learn-formula-list">
          <div className="learn-formula-row">
            <div className="learn-formula-label">Total energy</div>
            <code className="learn-formula-code">Total_energy = IT_energy × PUE</code>
          </div>
          <div className="learn-formula-row">
            <div className="learn-formula-label">CO₂ emissions</div>
            <code className="learn-formula-code">CO₂ = Total_energy_kWh × carbon_intensity_gCO₂/kWh ÷ 1,000,000</code>
          </div>
          <div className="learn-formula-row">
            <div className="learn-formula-label">Cooling energy</div>
            <code className="learn-formula-code">Cooling_energy = Total_energy − IT_energy</code>
          </div>
          <div className="learn-formula-row">
            <div className="learn-formula-label">Water consumption</div>
            <code className="learn-formula-code">Water_m³ = Cooling_energy_kWh × WUE_L/kWh ÷ 1,000</code>
          </div>
        </div>
        <p className="outlook-note" style={{ marginTop: 12 }}>
          Carbon intensity from <CiteInline href="https://ember-climate.org/insights/research/global-electricity-review-2024/">Ember Global Electricity Review 2024</CiteInline> (2023 calendar-year averages).
          Note: these are system-average intensities. Actual marginal intensity varies hourly and is tracked in real-time by ENTSO-E.
          PPAs and renewable energy claims are not reflected — the grid intensity is used as-is,
          reflecting the reality that energy on a shared grid is fungible.
        </p>
      </section>

      <section className="outlook-section">
        <h3 className="learn-section-title">National DC electricity data</h3>
        <div className="learn-source-table">
          {[
            { country: 'Ireland', source: 'EirGrid 2023', confidence: 'High', url: 'https://www.eirgrid.ie/grid-your-home/electricity-network/grid-statistics' },
            { country: 'United Kingdom', source: 'NESO / DESNZ 2023', confidence: 'Medium', url: 'https://www.gov.uk/government/statistics/digest-of-uk-energy-statistics-dukes' },
            { country: 'France', source: 'JRC Report JRC135926 2023', confidence: 'High', url: 'https://publications.jrc.ec.europa.eu/repository/handle/JRC135926' },
            { country: 'Germany', source: 'JRC 2023 + BDEW 2023', confidence: 'Medium', url: 'https://publications.jrc.ec.europa.eu/repository/handle/JRC135926' },
            { country: 'Sweden', source: 'Energimyndigheten 2023', confidence: 'Medium', url: 'https://www.energimyndigheten.se/statistik-och-uppfoljning/statistikdatabas/' },
            { country: 'Finland', source: 'Fingrid 2023', confidence: 'Medium', url: 'https://data.fingrid.fi/en/dataset' },
            { country: 'Netherlands', source: 'JRC 2023 + CBS 2023', confidence: 'Medium', url: 'https://publications.jrc.ec.europa.eu/repository/handle/JRC135926' },
            { country: 'All others', source: 'Derived from % of national electricity × IEA/Eurostat generation', confidence: 'Low', url: null },
          ].map(({ country, source, confidence, url }) => (
            <div key={country} className="learn-source-row">
              <div className="learn-source-country">{country}</div>
              <div className="learn-source-ref">
                {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="outlook-cite-inline">{source}</a> : source}
              </div>
              <div className={`learn-source-confidence ${confidence.toLowerCase()}`}>{confidence}</div>
            </div>
          ))}
        </div>
        <p className="outlook-note" style={{ marginTop: 8 }}>
          All national figures are 2022–2023 data. AI infrastructure growth means real 2024+ consumption is likely
          20–40% higher for major markets. Figures are intentionally conservative baselines.
        </p>
      </section>

      <section className="outlook-section" style={{ borderBottom: 'none' }}>
        <h3 className="learn-section-title">Known limitations</h3>
        <ul className="learn-limitations-list">
          <li>OSM coverage varies significantly — Eastern Europe and Turkey are under-mapped</li>
          <li>{noOpCount != null ? `${fmtCount(noOpCount)} campuses (${noOpPct}%)` : 'Many campuses'} have no operator attribution despite name-based inference</li>
          <li>Hyperscale campuses are systematically under-represented in OSM</li>
          <li>Area-based allocation assumes uniform power density — ignores workload differences</li>
          <li>PUE/WUE models use annual average temperature, not seasonal or hourly variation</li>
          <li>No renewable energy procurement tracking — grid intensity used for all operators</li>
          <li>National DC figures are 2022–2023; AI buildout since has likely increased consumption materially</li>
          <li>Sub-national grid variation not captured (marginal vs. average intensity)</li>
        </ul>
      </section>
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'what-is',     label: 'What is a Data Center?' },
  { id: 'ai-boom',     label: 'The AI Boom' },
  { id: 'environment', label: 'Environmental Impact' },
  { id: 'glossary',    label: 'Glossary' },
  { id: 'methodology', label: 'How we calculate this' },
];

// ── Main component ────────────────────────────────────────────────────────────

export function LearnMore({ onClose, initialTab = 0, campusStats = null }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [data, setData] = useState(null);

  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

  useEffect(() => {
    fetch('/data/capacityOutlook.json')
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleBackdrop = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div className="outlook-overlay" role="dialog" aria-label="Learn more about data centres" onClick={handleBackdrop}>
      <div className="outlook-panel learn-panel">
        <div className="learn-header">
          <div>
            <h2 className="outlook-title">Data Centers &amp; the AI Boom</h2>
            <p className="outlook-subtitle">What they are, why they matter, and what they cost the planet</p>
          </div>
          <button className="outlook-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="learn-body">
          <nav className="learn-nav">
            {TABS.map((tab, i) => (
              <button
                key={tab.id}
                className={`learn-nav-item ${activeTab === i ? 'active' : ''}`}
                onClick={() => setActiveTab(i)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="learn-content">
            {activeTab === 0 && <WhatIsADC />}
            {activeTab === 1 && <TheAIBoom />}
            {activeTab === 2 && <EnvironmentalImpact data={data} />}
            {activeTab === 3 && <GlossaryTab />}
            {activeTab === 4 && <Methodology campusStats={campusStats} />}
          </div>
        </div>
      </div>
    </div>
  );
}
