import http from 'k6/http';
import { check } from 'k6';
import { WEB } from './common.js';

if (!['always', 'never'].includes(__ENV.FORCE)) throw new Error('FORCE=never or always required');
const version = __ENV.FORCE === 'always' ? '1.1.0' : '1.0.0';
export const options = {
  scenarios: { capacity: { executor: 'ramping-arrival-rate', startRate: 10, timeUnit: '1s',
    preAllocatedVUs: 50, maxVUs: 300,
    stages: [{ target: 20, duration: '1m' }, { target: 50, duration: '2m' },
      { target: 100, duration: '2m' }, { target: 200, duration: '2m' }, { target: 0, duration: '1m' }] } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<300'], checks: ['rate>0.99'], dropped_iterations: ['count==0'] },
};
export default function () {
  http.cookieJar().clear(WEB);
  const response = http.get(`${WEB}/dashboard`, { headers: { 'X-Canary': __ENV.FORCE }, timeout: '5s', redirects: 0 });
  check(response, { 'expected version and rendered server banner': r => r.status === 200 &&
    r.headers['X-App-Version'] === version &&
    r.html().find('[data-testid="app-version"]').text().includes(`v${version}`) });
}
