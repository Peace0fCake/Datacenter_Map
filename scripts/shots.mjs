import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const DIR = 'scripts/.ux-shots';
mkdirSync(DIR, { recursive: true });
const URL = process.env.URL || 'http://localhost:5174/';

const shot = async (page, name, ms = 0) => {
  if (ms) await page.waitForTimeout(ms);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  console.log('shot:', name);
};
const clickText = async (page, text) => {
  try { await page.getByText(text, { exact: false }).first().click({ timeout: 4000 }); return true; }
  catch { console.log('  (could not click:', text, ')'); return false; }
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', m => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 160)); });
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));

console.log('loading', URL);
await page.goto(URL, { waitUntil: 'networkidle' }).catch(() => {});
await shot(page, '01-cold-load', 4000);

// Europe panel
await page.locator('.outlook-btn', { hasText: 'Europe' }).click({ timeout: 4000 }).catch(e => console.log('  europe btn:', e.message));
await shot(page, '06-europe-modal', 2200);

// Country panel — click a ranked country row (France if present, else first)
try {
  const fr = page.locator('.rank-row--link', { hasText: 'France' }).first();
  if (await fr.count()) await fr.click({ timeout: 4000 });
  else await page.locator('.rank-row--link').first().click({ timeout: 4000 });
  await shot(page, '07-country-panel', 2500);
  await page.locator('.cm-body').evaluate(el => el.scrollTo(0, el.scrollHeight)).catch(() => {});
  await shot(page, '08-country-panel-scrolled', 1500);
} catch (e) { console.log('  country panel failed:', e.message); }

await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(400);

// Learn More explainer
await page.locator('.outlook-btn', { hasText: 'Learn More' }).click({ timeout: 4000 }).catch(e => console.log('  learn btn:', e.message));
await shot(page, '09-learnmore', 2000);
await page.keyboard.press('Escape').catch(() => {});

// Carbon overlay + sidebar
await clickText(page, 'Grid carbon intensity');
await shot(page, '02-carbon', 2500);

await browser.close();
console.log('done -> ' + DIR);
