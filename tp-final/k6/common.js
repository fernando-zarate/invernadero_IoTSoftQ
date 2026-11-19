import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

export { API, WEB, channels, payload, deviceId, report, latest, numberEnv } from '../../tp-k8s/k6/common.js';
import { WEB } from '../../tp-k8s/k6/common.js';

export const stableCount = new Counter('stable_samples');
export const canaryCount = new Counter('canary_samples');
export const unknownCount = new Counter('unknown_samples');
export const stableLatency = new Trend('stable_latency', true);
export const canaryLatency = new Trend('canary_latency', true);
export const stableErrors = new Rate('stable_errors');
export const canaryErrors = new Rate('canary_errors');
export const identities = new Rate('identity_ok');

export const versionThresholds = {
  stable_samples: ['count>=200'], canary_samples: ['count>=200'],
  unknown_samples: ['count==0'],
  stable_latency: ['p(95)<300'], canary_latency: ['p(95)<300'],
  stable_errors: ['rate<0.01'], canary_errors: ['rate<0.01'],
  identity_ok: ['rate>0.99'], checks: ['rate>0.99'],
  dropped_iterations: ['count==0'],
};

export function visit(force) {
  // One new session per observation. Forced QA traffic never enters the natural split.
  http.cookieJar().clear(WEB);
  const response = http.get(`${WEB}/dashboard`, {
    headers: force ? { 'X-Canary': force } : {},
    timeout: '5s', redirects: 0, tags: { name: 'GET /dashboard' },
  });
  const version = response.headers['X-App-Version'];
  const document = response.status === 200 ? response.html() : null;
  const banner = document ? document.find('[data-testid="app-version"]').text() : '';
  const valid = response.status === 200 &&
    document.find('meta[name="app-version"]').attr('content') === version &&
    banner.includes('TerraSense') && banner.includes(`v${version}`);
  unknownCount.add(0);
  stableCount.add(0);
  canaryCount.add(0);
  if (version === '1.0.0') {
    stableCount.add(1); stableLatency.add(response.timings.duration); stableErrors.add(!valid);
  } else if (version === '1.1.0') {
    canaryCount.add(1); canaryLatency.add(response.timings.duration); canaryErrors.add(!valid);
  } else { unknownCount.add(1); }
  identities.add(valid && ['1.0.0', '1.1.0'].includes(version));
  check(response, { 'HTTP banner/meta/header agree': () => valid && ['1.0.0', '1.1.0'].includes(version),
    'forced version respected': () => !force || version === (force === 'always' ? '1.1.0' : '1.0.0') });
  return version;
}
