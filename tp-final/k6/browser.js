import { browser } from 'k6/browser';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const failures = new Rate('browser_failures');
const web = (__ENV.WEB_URL || 'http://terrasense.local').replace(/\/$/, '');
const run = (__ENV.RUN_ID || 'unlabelled').replace(/[^a-zA-Z0-9_-]/g, '_');
if (__ENV.FORCE && !['always', 'never'].includes(__ENV.FORCE)) throw new Error('Invalid FORCE');
export const options = {
  scenarios: { ui: { executor: 'shared-iterations', vus: 1, iterations: Number(__ENV.VISITS || 20),
    maxDuration: '10m', options: { browser: { type: 'chromium' } } } },
  thresholds: { checks: ['rate==1'], browser_failures: ['rate==0'] },
};
export default async function () {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  if (__ENV.FORCE) {
    // URL-scoped, host-only cookie: never add a QA header to cross-origin API calls.
    await context.addCookies([{ name: 'TERRASENSE_QA', value: __ENV.FORCE, url: `${web}/` }]);
  }
  // k6 Page.on does not support Playwright's pageerror event. Install before app JS.
  await context.addInitScript(`
    window.__terrasenseErrors = [];
    window.addEventListener('error', event => window.__terrasenseErrors.push(String(event.message || 'resource error')));
    window.addEventListener('unhandledrejection', event => window.__terrasenseErrors.push(String(event.reason)));
  `);
  const page = await context.newPage();
  const issues = [];
  let apiReadings = [];
  page.on('console', message => { if (message.type() === 'error') issues.push(`CONSOLE ${message.text()}`); });
  page.on('requestfailed', request => issues.push(`NETWORK ${request.url()}`));
  page.on('response', async response => {
    if (response.status() >= 400) issues.push(`HTTP ${response.status()} ${response.url()}`);
    if (response.url().includes('/metrics/ESP32-INV-01/latest') && response.request().method() === 'GET') {
      try { apiReadings = await response.json(); }
      catch (error) { issues.push(`Invalid latest API JSON: ${error}`); }
    }
  });
  let version = 'unknown';
  let ok = false;
  try {
    const response = await page.goto(`${web}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
    // Also gives short directed visits enough samples for offline dashboard export.
    await page.waitForTimeout(4000);
    version = await page.locator('meta[name="app-version"]').getAttribute('content');
    const banner = await page.locator('[data-testid="app-version"]').textContent();
    let hydrated = true;
    for (const type of ['temp', 'airHum', 'soilHum', 'waterLevel']) {
      const card = page.locator(`[data-testid="metric-${type}"]`);
      await card.waitFor({ state: 'visible', timeout: 20000 });
      const value = await card.getAttribute('data-value');
      const persisted = Array.isArray(apiReadings) && apiReadings.find(item => item.sensorType === type);
      hydrated = hydrated && value !== null && Number.isFinite(Number(value)) &&
        persisted && typeof persisted.value === 'number' && Number.isFinite(Date.parse(persisted.date)) &&
        Number(value) === persisted.value && (await card.textContent()).includes(type === 'temp' ? '°C' : '%');
    }
    const expected = __ENV.FORCE === 'always' ? '1.1.0' : __ENV.FORCE === 'never' ? '1.0.0' : version;
    issues.push(...await page.evaluate(() => window.__terrasenseErrors || []));
    const versionHeader = Object.entries(response.headers()).find(([name]) => name.toLowerCase() === 'x-app-version');
    ok = response.status() === 200 && ['1.0.0', '1.1.0'].includes(version) && version === expected &&
      versionHeader && versionHeader[1] === version && banner.includes(`v${version}`) && hydrated && issues.length === 0;
    check(null, { 'hydrated four real readings, version and healthy assets/API': () => ok });
  } catch (error) {
    issues.push(String(error));
    check(null, { 'browser completed': () => false });
  } finally {
    failures.add(!ok);
    try {
      await page.screenshot({ path: `${__ENV.SHOTS || 'tp-final/evidencias/capturas'}/${run}-${__ITER}-${version}-${ok ? 'ok' : 'FAIL'}.png`, fullPage: true });
    } catch (error) {
      ok = false;
      issues.push(`Screenshot failed: ${error}`);
      failures.add(true);
      check(null, { 'screenshot saved': () => false });
    } finally {
      console.log(JSON.stringify({ run, iteration: __ITER, version, ok, issues }));
      await page.close();
      await context.close();
    }
  }
}
