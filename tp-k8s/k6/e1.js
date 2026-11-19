import { browser } from 'k6/browser';
import { check, sleep } from 'k6';
import { WEB, report, latest, validLatest, thresholds } from './common.js';

export const options = {
  scenarios: {
    steady: { executor: 'constant-arrival-rate', rate: 5, timeUnit: '1s', duration: '2m', preAllocatedVUs: 10, maxVUs: 30, exec: 'traffic' },
    recovery: { executor: 'shared-iterations', vus: 1, iterations: 1, maxDuration: '2m', exec: 'probe' },
    ux: { executor: 'shared-iterations', vus: 1, iterations: 1, maxDuration: '2m', exec: 'ux', options: { browser: { type: 'chromium' } } },
  },
  thresholds: { ...thresholds, 'checks{domain:browser}': ['rate==1'], dropped_iterations: ['count==0'] },
};

export function traffic() { report(0); }

// One sequential observer: recovery applies to this read path, not every client.
export function probe() {
  const end = Date.now() + 110000;
  let observedFailure = false;
  let recovering = false;
  let lastFailure = 0;
  let healthySince = 0;
  let previousSample = 0;
  let healthySamples = 0;
  while (Date.now() < end) {
    const { ok } = latest(0);
    const now = Date.now();
    if (!ok) {
      if (!recovering) console.log(`PROBE_FAILURE ${new Date(now).toISOString()}`);
      observedFailure = true;
      recovering = true;
      lastFailure = now;
      healthySince = 0;
      healthySamples = 0;
    } else if (recovering) {
      if (!healthySince || now - previousSample > 2000) {
        healthySince = now;
        healthySamples = 0;
      }
      healthySamples++;
      if (now - healthySince >= 10000 && healthySamples >= 10) {
        console.log(`PROBE_RECOVERY last_failure=${new Date(lastFailure).toISOString()} first_success=${new Date(healthySince).toISOString()} confirmed=${new Date(now).toISOString()} (single read observer, 10s healthy)`);
        recovering = false;
      }
    }
    previousSample = now;
    sleep(0.5);
  }
  if (!observedFailure) console.log('PROBE_RESULT no interruption observed; recovery is not measurable, not zero');
  else if (recovering) console.log('PROBE_RESULT recovery not confirmed before observation ended');
}

function browserCheck(name, ok, phase) {
  return check(ok, { [name]: (value) => value }, { domain: 'browser', phase });
}

function requireBaseline(name, ok) {
  if (!browserCheck(name, ok, 'baseline')) throw new Error(`Browser baseline failed: ${name}`);
}

export async function ux() {
  let page;
  let readyAt = 0;
  let lastFailure = 0;
  let lastSuccess = 0;
  let firstObservedFailure = 0;
  let failureCaptured = false;
  let fallbackCaptured = false;
  const observe = (ok, detail) => {
    const now = Date.now();
    console.log(`BROWSER_API ${new Date(now).toISOString()} ok=${ok} ${detail}`);
    if (ok) lastSuccess = now;
    else lastFailure = now;
    if (readyAt) {
      if (!ok && !firstObservedFailure) firstObservedFailure = now;
      browserCheck('browser API remains available after readiness', ok, 'availability');
    }
  };
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('response', async (response) => {
      if (!response.url().includes('/metrics/ESP32-INV-01/latest')) return;
      try { observe(response.status() === 200 && validLatest(await response.json()), `status=${response.status()}`); }
      catch (_) { observe(false, 'invalid JSON'); }
    });
    page.on('requestfailed', (request) => {
      if (request.url().includes('/metrics/ESP32-INV-01/latest')) observe(false, 'network failure');
    });
    const navigation = await page.goto(`${WEB}/dashboard`);
    requireBaseline('dashboard document is served', navigation !== null && navigation.status() === 200);
    await page.locator('h2').filter({ hasText: 'Panel de Monitoreo ESP32' }).waitFor();
    await page.waitForTimeout(7000);
    requireBaseline('browser received real four-channel API data', lastSuccess > lastFailure);
    const text = await page.locator('body').textContent();
    requireBaseline('dashboard renders actual sensor values', typeof text === 'string' && ['24.50', '60.00', '45.00', '90.00'].every((value) => text.includes(value)));
    await page.screenshot({ path: 'tp-k8s/ux-antes.png', fullPage: true });
    readyAt = Date.now();
    console.log(`BROWSER_READY ${new Date(readyAt).toISOString()} Delete ONE backend pod NOW in the second terminal; observation lasts 90s`);
    while (Date.now() < readyAt + 90000) {
      if (!failureCaptured && firstObservedFailure) {
        await page.screenshot({ path: 'tp-k8s/falla-ux.png', fullPage: true });
        failureCaptured = true;
        console.log(`SCREENSHOT ${new Date().toISOString()} falla-ux.png first observed API failure at ${new Date(firstObservedFailure).toISOString()}; UI may retain old data`);
      }
      if (!failureCaptured && !fallbackCaptured && Date.now() >= readyAt + 10000) {
        await page.screenshot({ path: 'tp-k8s/falla-ux.png', fullPage: true });
        fallbackCaptured = true;
        console.log(`SCREENSHOT ${new Date().toISOString()} falla-ux.png FALLBACK timed snapshot, NOT proof of failure; a later observed failure will replace it`);
      }
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: 'tp-k8s/ux-despues.png', fullPage: true });
    browserCheck('browser received valid data late in observation', lastSuccess >= readyAt + 80000, 'availability');
  } catch (error) {
    // An exception alone need not fail k6: preserve an independent failed UX check.
    browserCheck('browser observation completed', false, readyAt ? 'observation' : 'baseline');
    throw error;
  } finally { if (page) await page.close(); }
}
