import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const DIR = 'scripts/.ux-shots';
mkdirSync(DIR, { recursive: true });
const URL = 'http://localhost:5173/';

const shot = async (page, name, ms = 0) => {
  if (ms) await page.waitForTimeout(ms);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  console.log('shot:', name);
};
const clickText = async (page, text) => {
  try { await page.getByText(text, { exact: false }).first().click({ timeout: 4000 }); return true; }
  catch { console.log('  (could not click:', text, ')'); return false; }
};

const browser = await chromium.launch({ headless: false, slowMo: 350 });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log('loading', URL);
await page.goto(URL, { waitUntil: 'networkidle' }).catch(() => {});
await shot(page, '01-cold-load', 4000);

// Layer overlays
await clickText(page, 'Grid carbon intensity');
await shot(page, '02-carbon', 2500);
await clickText(page, 'Watershed water stress');
await shot(page, '03-water', 2500);
// Additional layer: DC concentration (checkbox)
await clickText(page, 'DC concentration');
await shot(page, '04-heatmap', 2500);
await clickText(page, 'France electricity');
await shot(page, '05-iris', 2500);

// Europe panel (bar-chart heavy)
await clickText(page, 'Europe');
await shot(page, '06-europe-modal', 2000);

// Country panel — click first country row in the Europe ranking
try {
  await page.locator('.campus-rank-row--link').first().click({ timeout: 4000 });
  await shot(page, '07-country-panel', 2500);
  // scroll the country panel to capture operators + pipeline lower down
  await page.locator('.cm-body').evaluate(el => el.scrollTo(0, el.scrollHeight)).catch(() => {});
  await shot(page, '08-country-panel-scrolled', 1500);
} catch (e) { console.log('  country panel failed:', e.message); }

// Close modal, open Learn More
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(500);
await clickText(page, 'Learn More');
await shot(page, '09-learnmore', 2000);
await clickText(page, 'How we calculate this');
await shot(page, '10-methodology', 1500);
await page.keyboard.press('Escape').catch(() => {});

// Narrow viewport (mobile-ish)
await page.setViewportSize({ width: 420, height: 820 });
await shot(page, '11-narrow', 2500);

await browser.close();
console.log('done -> ' + DIR);
