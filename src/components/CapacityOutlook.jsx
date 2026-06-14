import { useState, useEffect } from 'react';

// ── Tiny SVG helpers ─────────────────────────────────────────────────────────

function linePath(pts) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}
function areaPath(topPts, botPts) {
  const top = topPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const bot = [...botPts].reverse().map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `${top} ${bot} Z`;
}

// ── Inline citation link ──────────────────────────────────────────────────────

function Cite({ href, label = 'src' }) {
  return (
    <a className="outlook-cite" href={href} target="_blank" rel="noopener noreferrer">[{label}]</a>
  );
}

// ── Chart 1: IPCC-style scenario lines ───────────────────────────────────────

function ScenarioChart({ history, scenarios }) {
  const W = 640, H = 310;
  const pad = { l: 52, r: 10, t: 18, b: 36 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const allYears  = [...history.years, ...scenarios.years.slice(1)];
  const minYear   = allYears[0];
  const maxYear   = allYears[allYears.length - 1];
  const maxTwh    = 540;
  const yTicks    = [0, 100, 200, 300, 400, 500];

  const xS = y  => pad.l + (y - minYear) / (maxYear - minYear) * cW;
  const yS = v  => pad.t + cH - (v / maxTwh) * cH;

  const histPts   = history.years.map((yr, i) => [xS(yr), yS(history.twh[i])]);
  const presentX  = xS(scenarios.base_year);

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
          <line x1={pad.l} x2={W - pad.r} y1={yS(t)} y2={yS(t)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          <text x={pad.l - 5} y={yS(t) + 4} textAnchor="end" className="chart-tick">{t}</text>
        </g>
      ))}
      {allYears.filter(y => y % 2 === 0).map(yr => (
        <g key={yr}>
          <line x1={xS(yr)} x2={xS(yr)} y1={pad.t} y2={pad.t + cH} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={xS(yr)} y={H - 8} textAnchor="middle" className="chart-tick">{yr}</text>
        </g>
      ))}

      <line x1={presentX} x2={presentX} y1={pad.t} y2={pad.t + cH} stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="4,3" />
      <text x={presentX + 4} y={pad.t + 11} className="chart-present-label">2024</text>

      {[...scenarios.variants].reverse().map(v => {
        const highPts = scenarios.years.map((yr, i) => [xS(yr), yS(v.high[i])]);
        const lowPts  = scenarios.years.map((yr, i) => [xS(yr), yS(v.low[i])]);
        return (
          <path key={`band-${v.id}`} d={areaPath(highPts, lowPts)}
            fill={`url(#grad-${v.id})`} stroke="none" />
        );
      })}

      {scenarios.variants.map(v => {
        const pts = scenarios.years.map((yr, i) => [xS(yr), yS(v.twh[i])]);
        return (
          <path key={`line-${v.id}`} d={linePath(pts)}
            stroke={v.color} strokeWidth="2" fill="none" strokeDasharray="6,3"
            strokeLinecap="round" />
        );
      })}

      <path d={linePath(histPts)} stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {histPts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="white" />
      ))}

      <text x={pad.l - 38} y={pad.t + cH / 2} className="chart-axis-label" transform={`rotate(-90,${pad.l - 38},${pad.t + cH / 2})`}>TWh / year</text>
    </svg>
  );
}

// ── Chart 2: Source-comparison dot-range ─────────────────────────────────────

function SourceCompareChart({ data }) {
  const W = 640, H = 230;
  const pad = { l: 170, r: 30, t: 16, b: 34 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const minV = 70, maxV = 160;
  const xS   = v  => pad.l + (v - minV) / (maxV - minV) * cW;
  const rowH  = cH / data.estimates.length;
  const yS    = i  => pad.t + rowH * i + rowH / 2;

  const xTicks = [80, 100, 120, 140];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="outlook-svg" aria-label="Source comparison">
      {xTicks.map(t => (
        <g key={t}>
          <line x1={xS(t)} x2={xS(t)} y1={pad.t} y2={pad.t + cH} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          <text x={xS(t)} y={H - 8} textAnchor="middle" className="chart-tick">{t}</text>
        </g>
      ))}

      {data.estimates.map((est, i) => {
        const cy = yS(i);
        return (
          <g key={est.source}>
            <text x={pad.l - 8} y={cy + 4} textAnchor="end" className="chart-source-label">{est.source}</text>
            <line x1={xS(est.low)} x2={xS(est.high)} y1={cy} y2={cy}
              stroke="rgba(99,102,241,0.35)" strokeWidth="6" strokeLinecap="round" />
            <line x1={xS(est.low)}  x2={xS(est.low)}  y1={cy - 6} y2={cy + 6} stroke="#6366f1" strokeWidth="2" />
            <line x1={xS(est.high)} x2={xS(est.high)} y1={cy - 6} y2={cy + 6} stroke="#6366f1" strokeWidth="2" />
            <circle cx={xS(est.twh)} cy={cy} r="5.5" fill="#818cf8" stroke="var(--bg,#0f1117)" strokeWidth="1.5" />
            <text x={xS(est.twh)} y={cy - 10} textAnchor="middle" className="chart-dot-label">{est.twh}</text>
          </g>
        );
      })}

      <text x={pad.l + cW / 2} y={H - 4} textAnchor="middle" className="chart-axis-label">TWh / year</text>
    </svg>
  );
}

// ── Chart 3: Country pipeline horizontal bars ─────────────────────────────────

function PipelineChart({ pipeline }) {
  const W = 640, H = 340;
  const pad = { l: 118, r: 20, t: 16, b: 36 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const maxMw  = 4800;
  const xS     = v => pad.l + (v / maxMw) * cW;
  const rowH   = cH / pipeline.countries.length;
  const barH   = Math.min(rowH * 0.55, 14);
  const yC     = i => pad.t + rowH * i + rowH / 2;

  const xTicks = [0, 1000, 2000, 3000, 4000];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="outlook-svg" aria-label="Country pipeline">
      {xTicks.map(t => (
        <g key={t}>
          <line x1={xS(t)} x2={xS(t)} y1={pad.t} y2={pad.t + cH} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          <text x={xS(t)} y={H - 8} textAnchor="middle" className="chart-tick">{t === 0 ? '' : `${t / 1000}k`}</text>
        </g>
      ))}

      {pipeline.countries.map((c, i) => {
        const cy     = yC(i);
        const total  = c.current_mw + c.construction_mw + c.planned_mw;
        const x0     = xS(0);
        const x1     = xS(c.current_mw);
        const x2     = xS(c.current_mw + c.construction_mw);
        const x3     = xS(total);

        return (
          <g key={c.code}>
            <text x={pad.l - 6} y={cy + 4} textAnchor="end" className="chart-country-label">{c.name}</text>
            <rect x={x0} y={cy - barH / 2} width={x1 - x0} height={barH} fill="#6366f1" rx="2" />
            <rect x={x1} y={cy - barH / 2} width={x2 - x1} height={barH} fill="#eab308" rx="2" />
            <rect x={x2} y={cy - barH / 2} width={x3 - x2} height={barH} fill="rgba(234,179,8,0.28)" rx="2"
              stroke="#eab308" strokeWidth="0.8" strokeDasharray="3,2" />
            <text x={x3 + 5} y={cy + 4} className="chart-bar-label">{(total / 1000).toFixed(1)}k MW</text>
          </g>
        );
      })}

      <text x={pad.l + cW / 2} y={H - 4} textAnchor="middle" className="chart-axis-label">IT load capacity (MW)</text>
    </svg>
  );
}

// ── Legend helpers ────────────────────────────────────────────────────────────

function ScenarioLegend({ variants }) {
  return (
    <div className="outlook-legend">
      <div className="legend-entry">
        <svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" /></svg>
        <span>Historical (IEA / JRC)</span>
      </div>
      {variants.map(v => (
        <div key={v.id} className="legend-entry">
          <svg width="22" height="10">
            <line x1="0" y1="5" x2="22" y2="5" stroke={v.color} strokeWidth="2" strokeDasharray="5,3" />
          </svg>
          <span style={{ color: v.color }}>{v.label}</span>
          <span className="legend-sub"> — {v.source}</span>
        </div>
      ))}
      <div className="legend-entry">
        <div className="legend-band" />
        <span className="legend-sub">Shaded = published estimate range</span>
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

// ── Reusable section header ───────────────────────────────────────────────────

function ChallengeHeader({ n, title, color = 'var(--accent)' }) {
  return (
    <div className="outlook-challenge-title">
      <span className="outlook-challenge-num" style={{ background: color }}>{n}</span>
      {title}
    </div>
  );
}

// ── Stat card with optional source link ──────────────────────────────────────

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

// ── Main overlay panel ────────────────────────────────────────────────────────

export function CapacityOutlook({ onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/data/capacityOutlook.json')
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <div className="outlook-overlay" role="dialog" aria-label="Data Centre Explainer">
      <div className="outlook-panel">
        <div className="outlook-header">
          <div>
            <h2 className="outlook-title">Data Centres &amp; the Environment</h2>
            <p className="outlook-subtitle">
              The infrastructure behind the internet, AI, and cloud computing — and what it costs the planet
            </p>
          </div>
          <button className="outlook-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="outlook-body">

          {/* ── Introduction ─────────────────────────────────────────────── */}
          <div className="outlook-intro">
            <p>
              A <strong>data centre</strong> is a building (or campus of buildings) packed with servers, storage, and
              networking equipment. Every email, stream, search, and AI response you send or receive passes through
              one. The servers generate enormous amounts of heat, so a large share of a facility's power goes
              straight to cooling — not computation. That ratio is captured by the{' '}
              <strong>Power Usage Effectiveness (PUE)</strong>: a PUE of 1.5 means half a watt of overhead
              for every watt of compute.{' '}
              <Cite href="https://uptimeinstitute.com/resources/research-and-reports/uptime-institute-global-data-center-survey-results-2023" label="Uptime Institute 2023" />
            </p>
            <p style={{ marginTop: 8 }}>
              For decades, data centres grew steadily but quietly. Then came the AI boom. Training and running
              large language models requires orders of magnitude more compute than traditional workloads.
              A single ChatGPT query consumes roughly <strong>10× the energy</strong> of a Google
              search.{' '}
              <Cite href="https://www.iea.org/energy-system/buildings/data-centres-and-data-transmission-networks" label="IEA" />
              {' '}Training a frontier model like GPT-4 is estimated at roughly <strong>50 GWh</strong> —
              enough to power ~14,000 European homes for a year.{' '}
              <Cite href="https://www.iea.org/reports/electricity-2024" label="IEA Electricity 2024" />
              {' '}As AI moves from experiment to infrastructure, the demands on the grid, water, and land
              are becoming a measurable constraint.
            </p>
          </div>

          {/* ── Key numbers ──────────────────────────────────────────────── */}
          <div className="outlook-stat-strip">
            <StatCard
              num="~100" unit="TWh / yr"
              label="European data centre electricity in 2023 — roughly equal to the Netherlands' entire national grid"
              href="https://www.iea.org/reports/electricity-2024" srcLabel="IEA 2024"
            />
            <StatCard
              num="21 %" unit="of Irish grid"
              label="Share of Ireland's electricity consumed by data centres in 2023, up from 5% in 2015"
              href="https://www.eirgrid.ie/grid-your-home/electricity-network/grid-statistics" srcLabel="EirGrid 2023"
            />
            <StatCard
              num="1–5 M" unit="litres / day"
              label="Water evaporated by a single 100 MW data centre using evaporative cooling for heat rejection"
              href="https://arxiv.org/abs/2304.03271" srcLabel="Li et al. 2023"
            />
            <StatCard
              num="1.58" unit="avg PUE"
              label="Industry-average Power Usage Effectiveness in 2023. For every 1 W of computing, 0.58 W is overhead"
              href="https://uptimeinstitute.com/resources/research-and-reports/uptime-institute-global-data-center-survey-results-2023" srcLabel="Uptime Institute 2023"
            />
          </div>

          {!data ? (
            <div className="outlook-loading"><span className="spinner" />Loading charts…</div>
          ) : (<>

            {/* ── Challenge 1: Energy ───────────────────────────────────── */}
            <section className="outlook-section outlook-challenge">
              <ChallengeHeader n="1" title="The energy explosion" color="#6366f1" />
              <p className="outlook-challenge-text">
                European data centres used around 77 TWh in 2018.{' '}
                <Cite href="https://publications.jrc.ec.europa.eu/repository/handle/JRC135926" label="JRC 2023" />
                {' '}By 2023 that had grown to ~100 TWh, and nearly every credible forecast
                sees it accelerating sharply through 2030.{' '}
                <Cite href="https://www.iea.org/reports/electricity-2024" label="IEA 2024" />
                {' '}The primary driver is AI: hyperscalers (Microsoft, Google, Amazon, Meta) announced
                over <strong>$200 billion</strong> in combined global data centre capital expenditure for
                2024 alone, with a significant portion targeting Europe.
                {' '}(Goldman Sachs AI Power Surge, April 2024; Bloomberg 2024.)
                The chart below shows four published growth pathways.
                Even the most optimistic — driven by strong efficiency policy — still implies 27% more electricity
                by 2030. High-growth AI scenarios approach double today's demand within six years.
              </p>
              <ScenarioChart history={data.history} scenarios={data.scenarios} />
              <ScenarioLegend variants={data.scenarios.variants} />
              <p className="outlook-note">
                Sources:{' '}
                <a className="outlook-cite-inline" href="https://www.iea.org/reports/electricity-2024" target="_blank" rel="noopener noreferrer">IEA Electricity 2024</a>
                {' · '}
                <a className="outlook-cite-inline" href="https://publications.jrc.ec.europa.eu/repository/handle/JRC135926" target="_blank" rel="noopener noreferrer">JRC European Data Centres 2023</a>
                {' · Goldman Sachs AI Power Surge April 2024 · Rystad Energy Data Centre Outlook 2024. '}
                Figures are estimates; different methodologies and country scopes produce a ~25–30% spread between sources for the same year.
              </p>
            </section>

            {/* ── Challenge 2: Grid strain ──────────────────────────────── */}
            <section className="outlook-section outlook-challenge">
              <ChallengeHeader n="2" title="Grid saturation &amp; the location trap" color="#f97316" />
              <p className="outlook-challenge-text">
                Data centres must be near population centres for low latency, yet those same areas have
                the most congested transmission grids. As their share of national electricity grows, they
                are reshaping infrastructure investment priorities and triggering planning restrictions across Europe.
              </p>
              <div className="outlook-topic-grid">
                <div className="outlook-topic-card">
                  <div className="outlook-topic-card-title">Ireland — near saturation</div>
                  <div className="outlook-topic-card-stat">21 % of national grid</div>
                  <p className="outlook-topic-card-text">
                    EirGrid projects data centres could reach <strong>28–32%</strong> of Irish electricity demand
                    by 2031.{' '}
                    <Cite href="https://www.eirgrid.ie/industry/tomorrows-energy-scenarios" label="EirGrid TES 2023" />
                    {' '}The grid operator has started rejecting Dublin connection requests until new
                    transmission lines are built — the earliest these arrive is 2027–2028.
                    Ireland's share was just 5% in 2015.{' '}
                    <Cite href="https://www.seai.ie/publications/Energy-in-Ireland-2023.pdf" label="SEAI 2023" />
                  </p>
                </div>
                <div className="outlook-topic-card">
                  <div className="outlook-topic-card-title">Netherlands — moratorium</div>
                  <div className="outlook-topic-card-stat">5.6 % of national grid</div>
                  <p className="outlook-topic-card-text">
                    Amsterdam imposed a temporary ban on new data centre construction in 2019, citing grid
                    and water pressure. The ban was partially lifted with sustainability conditions, but
                    Netbeheer Nederland warned in 2023 that industrial power connection requests cannot be
                    fulfilled in several provinces before 2028 due to substation backlogs.{' '}
                    <Cite href="https://www.netbeheernederland.nl/publicaties/capaciteitsplannen" label="Netbeheer NL 2023" />
                  </p>
                </div>
                <div className="outlook-topic-card">
                  <div className="outlook-topic-card-title">Spain — new frontier</div>
                  <div className="outlook-topic-card-stat">~6 GW planned in Madrid</div>
                  <p className="outlook-topic-card-text">
                    As saturated northern markets slow approvals, operators are targeting Spain's cheaper
                    land, abundant solar generation, and Atlantic cable landing points. The Madrid region
                    alone has over 6 GW of announced capacity — several times its current operational total.{' '}
                    (CBRE European Data Centre MarketView H1 2024.)
                    Grid upgrade timelines lag announced projects by years.
                  </p>
                </div>
                <div className="outlook-topic-card">
                  <div className="outlook-topic-card-title">Nordic advantage</div>
                  <div className="outlook-topic-card-stat">Cool air + near-zero-carbon power</div>
                  <p className="outlook-topic-card-text">
                    Sweden, Finland, and Norway offer near-zero-carbon hydro/wind power, cool ambient air
                    that cuts cooling costs, and available land.
                    Meta's Odense campus (Denmark) supplies surplus waste heat to 11,000 homes via district heating.{' '}
                    <Cite href="https://sustainability.fb.com/" label="Meta Sustainability" />
                    {' '}Bulk Infrastructure (Norway) co-locates with aluminium smelters to share renewable power contracts.{' '}
                    <Cite href="https://bulk.no/" label="Bulk Infrastructure" />
                  </p>
                </div>
              </div>
            </section>

            {/* ── Challenge 3: Water ────────────────────────────────────── */}
            <section className="outlook-section outlook-challenge">
              <ChallengeHeader n="3" title="Hidden water consumption" color="#0ea5e9" />
              <p className="outlook-challenge-text">
                <strong>Water Usage Effectiveness (WUE)</strong> measures litres of water consumed per kWh of IT
                load — the standard metric defined by{' '}
                <a className="outlook-cite-inline" href="https://uptimeinstitute.com/" target="_blank" rel="noopener noreferrer">The Green Grid / Uptime Institute</a>.
                {' '}Evaporative cooling — spraying water into warm air to cool it — is the most common and
                energy-efficient method, but it consumes significant water at scale. A 100 MW facility
                with a WUE of 1.5 L/kWh uses roughly 1.3 billion litres per year — about the same as
                370 Olympic swimming pools. That water evaporates and does not return to the local watershed.
              </p>
              <div className="outlook-topic-grid">
                <div className="outlook-topic-card">
                  <div className="outlook-topic-card-title">Industry average WUE</div>
                  <div className="outlook-topic-card-stat" style={{ color: '#f97316' }}>~1.8 L / kWh</div>
                  <p className="outlook-topic-card-text">
                    Uptime Institute 2022 Annual Survey.{' '}
                    <Cite href="https://uptimeinstitute.com/" label="Uptime Institute" />
                    {' '}Best-in-class hyperscalers report 0.5–1.1 L/kWh.
                    Older facilities can exceed 3 L/kWh. Training GPT-3 is estimated to have evaporated
                    ~700,000 litres of water; ChatGPT generates roughly 500 ml of water consumption
                    per 20–50 queries.{' '}
                    <Cite href="https://arxiv.org/abs/2304.03271" label="Li et al. 2023" />
                  </p>
                </div>
                <div className="outlook-topic-card">
                  <div className="outlook-topic-card-title">Cooling technology tradeoffs</div>
                  <div className="outlook-topic-card-stat" style={{ color: '#22c55e' }}>PUE vs WUE tradeoff</div>
                  <p className="outlook-topic-card-text">
                    Dry coolers reject heat to air without consuming water — but use more electricity,
                    raising PUE. Free-air / adiabatic cooling (Nordic DCs) achieves WUE near 0 by
                    drawing cold outside air directly.{' '}
                    Liquid cooling and immersion cooling bring heat directly to the chip,
                    approaching PUE 1.0 with minimal water, but require purpose-built server hardware.
                    High-density AI GPUs are accelerating adoption of liquid cooling.{' '}
                    <Cite href="https://uptimeinstitute.com/resources/research-and-reports/uptime-institute-global-data-center-survey-results-2023" label="Uptime Institute 2023" />
                  </p>
                </div>
                <div className="outlook-topic-card">
                  <div className="outlook-topic-card-title">Local water stress</div>
                  <div className="outlook-topic-card-stat" style={{ color: '#eab308' }}>Conflict with climate change</div>
                  <p className="outlook-topic-card-text">
                    The water stress layer on this map (WRI Aqueduct 3.0{' '}
                    <Cite href="https://www.wri.org/data/aqueduct-water-risk-atlas" label="WRI" />
                    ) shows where scarcity is already acute. Southern Spain and Portugal — now targeted
                    for large campuses — have among the highest stress scores in Europe.
                    Amsterdam has banned the use of drinking water for DC cooling.
                    Climate change will reduce summer river flows across central Europe, sharpening
                    this conflict through the 2030s.{' '}
                    <Cite href="https://www.eea.europa.eu/en/topics/in-depth/water" label="EEA" />
                  </p>
                </div>
                <div className="outlook-topic-card">
                  <div className="outlook-topic-card-title">Waste heat recovery</div>
                  <div className="outlook-topic-card-stat" style={{ color: '#22c55e' }}>70–80 % of input power as heat</div>
                  <p className="outlook-topic-card-text">
                    For every megawatt of computing, 0.7–0.8 MW of low-grade heat is expelled.
                    Stockholm Exergi captures DC waste heat to warm 10% of the city.{' '}
                    <Cite href="https://www.stockholmexergi.se/" label="Stockholm Exergi" />
                    {' '}Munich's Stadtwerke plans to use a Google campus to heat 50,000 homes by 2030.
                    The EU Energy Efficiency Directive now requires new large data centres to
                    report waste heat and, where technically feasible, connect to district heating.{' '}
                    <Cite href="https://energy.ec.europa.eu/topics/energy-efficiency/energy-efficiency-targets-directive-and-rules/energy-efficiency-directive_en" label="EU EED" />
                  </p>
                </div>
              </div>
            </section>

            {/* ── Challenge 4: Measurement ──────────────────────────────── */}
            <section className="outlook-section outlook-challenge">
              <ChallengeHeader n="4" title="Why we don't know the real numbers" color="#8b5cf6" />
              <p className="outlook-challenge-text">
                There is no single authoritative count of European data centre energy use. Six major
                institutions that study the same question reach answers differing by ~30%.
                The gap comes from different country scopes, whether edge computing and telecom
                equipment is included, and whether estimates are built bottom-up (count every facility){' '}
                <Cite href="https://publications.jrc.ec.europa.eu/repository/handle/JRC135926" label="JRC" />
                {' '}or top-down (fraction of national electricity statistics).{' '}
                <Cite href="https://www.iea.org/reports/electricity-2024" label="IEA" />
                {' '}Operators are rarely required to publicly disclose consumption — the EU's{' '}
                <a className="outlook-cite-inline" href="https://energy.ec.europa.eu/topics/energy-efficiency/energy-efficiency-targets-directive-and-rules/energy-efficiency-directive_en" target="_blank" rel="noopener noreferrer">Energy Efficiency Directive (recast 2023)</a>
                {' '}mandates disclosure and registration for facilities above 500 kW from 2024 onwards.
                This should significantly improve data quality over the next few years.
              </p>
              <SourceCompareChart data={data.source_comparison} />
              <p className="outlook-note">
                {data.source_comparison.note}
                {' Sources: '}
                <a className="outlook-cite-inline" href="https://publications.jrc.ec.europa.eu/repository/handle/JRC135926" target="_blank" rel="noopener noreferrer">JRC 2023</a>
                {' · '}
                <a className="outlook-cite-inline" href="https://www.iea.org/reports/electricity-2024" target="_blank" rel="noopener noreferrer">IEA Electricity 2024</a>
                {' · IRENA 2023 · EPRI 2024 · Goldman Sachs April 2024 · Rystad Energy 2024.'}
              </p>
            </section>

            {/* ── Pipeline ──────────────────────────────────────────────── */}
            <section className="outlook-section outlook-challenge">
              <ChallengeHeader n="5" title="Where is the growth going?" color="#eab308" />
              <p className="outlook-challenge-text">
                The pipeline of announced and under-construction capacity dwarfs what exists today.
                The United Kingdom leads Europe in both operational capacity and announced projects,
                with London concentrating demand near the largest financial and population centre.{' '}
                <Cite href="https://www.cbre.com/insights/figures/european-data-centres-figures-h1-2024" label="CBRE H1 2024" />
                {' '}Ireland and the Netherlands are already constrained by grid capacity; growth is rotating
                toward Spain, Poland, and the Nordics. Announced capacity is highly uncertain — projects
                are regularly cancelled, delayed, or expanded.
              </p>
              <PipelineChart pipeline={data.pipeline} />
              <PipelineLegend />
              <p className="outlook-note">
                Sources:{' '}
                <a className="outlook-cite-inline" href="https://www.cbre.com/insights/figures/european-data-centres-figures-h1-2024" target="_blank" rel="noopener noreferrer">CBRE European Data Centre MarketView H1 2024</a>
                {' · Data Center Dynamics Pipeline Tracker 2024 · Cushman &amp; Wakefield 2024. '}
                Figures are estimates; planned capacity is particularly uncertain as projects are frequently cancelled, delayed, or expanded.
              </p>
            </section>

            {/* ── What's being done ─────────────────────────────────────── */}
            <section className="outlook-section outlook-challenge">
              <div className="outlook-challenge-title" style={{ color: '#22c55e' }}>
                Responses &amp; what to watch
              </div>
              <p className="outlook-challenge-text">
                The sector is not standing still. Several policy and technical trends are reshaping the trajectory.
              </p>
              <div className="outlook-solutions">
                {[
                  {
                    title: 'EU Energy Efficiency Directive',
                    href: 'https://energy.ec.europa.eu/topics/energy-efficiency/energy-efficiency-targets-directive-and-rules/energy-efficiency-directive_en',
                    text: 'From 2024, data centres ≥500 kW must register and disclose energy use, PUE, and temperature setpoints in the EU. From 2026, waste heat reporting is mandatory. This will dramatically improve data quality and create regulatory pressure to improve efficiency.',
                  },
                  {
                    title: 'Efficiency gains',
                    href: 'https://uptimeinstitute.com/resources/research-and-reports/uptime-institute-global-data-center-survey-results-2023',
                    text: 'Industry-average PUE fell from ~2.0 in 2010 to ~1.58 in 2023 (Uptime Institute). Hyperscalers average ~1.2. Liquid cooling, AI-driven thermal management, and higher server inlet temperatures are pushing it lower — but AI workload intensity growth may offset gains.',
                  },
                  {
                    title: '24/7 Clean Energy',
                    href: 'https://goo.gl/maps',
                    text: 'PPAs (Power Purchase Agreements) let operators claim renewable energy on an annual basis, but grid carbon varies hour by hour. Google, Microsoft, and others now pursue "24/7 clean energy" — matching consumption to renewable generation in the same hour and grid zone.',
                  },
                  {
                    title: 'Grid co-investment',
                    href: 'https://www.iea.org/reports/electricity-2024',
                    text: 'Some operators now fund grid infrastructure directly. Microsoft contributed to substation upgrades in Sweden; Amazon co-funded undersea cable projects in Norway. This is likely to become a standard condition of planning approval in grid-constrained markets.',
                  },
                  {
                    title: 'Modular & remote siting',
                    href: 'https://bulk.no/',
                    text: 'Pre-fabricated data centre containers can be deployed near generation sources — offshore wind, hydro — rather than population centres, reducing grid load in congested areas. Several Nordic operators use this model. Edge computing reduces latency requirements, enabling more remote siting.',
                  },
                  {
                    title: 'EU data sovereignty rules',
                    href: 'https://digital-strategy.ec.europa.eu/en/policies/eu-data-strategy',
                    text: 'GDPR, NIS2, and DORA push operators to keep certain data within Europe. This limits offshoring to lower-cost regions but also fragments the market, making it harder to optimise where data centres locate for best renewable energy access.',
                  },
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
      </div>
    </div>
  );
}
