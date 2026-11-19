import http from 'k6/http';
import { check, sleep } from 'k6';
import { WEB, report, latest } from './common.js';

export const options = { vus: 1, iterations: 1, thresholds: { checks: ['rate==1'], http_req_failed: ['rate==0'] } };
export default function () {
  for (const [force, version] of [['never', '1.0.0'], ['always', '1.1.0']]) {
    http.cookieJar().clear(WEB);
    const params = { headers: { 'X-Canary': force }, timeout: '5s' };
    const page = http.get(`${WEB}/dashboard`, params);
    const file = http.get(`${WEB}/version.txt`, params);
    const document = page.html();
    check(page, {
      [`${version} banner, meta, header and file`]: () => page.status === 200 &&
        page.headers['X-App-Version'] === version &&
        document.find('[data-testid="app-version"]').text().includes(`v${version}`) &&
        document.find('meta[name="app-version"]').attr('content') === version &&
        file.status === 200 && file.body.trim() === version && file.headers['X-App-Version'] === version,
    });
  }
  for (const index of [0, 1999]) {
    const started = Date.now();
    report(index);
    const result = latest(index, started);
    console.log(`READBACK deviceIndex=${index} status=${result.response.status} persisted=${result.ok}`);
  }
  // At least four 1s dashboard samples even on a very fast local cluster.
  sleep(4);
}
