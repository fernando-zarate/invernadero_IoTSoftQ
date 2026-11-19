import http from 'k6/http';
import exec from 'k6/execution';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { numberEnv, report, requestFor, verifyReport, thresholds } from './common.js';

const synchronized = __ENV.LOAD_MODE === 'synchronized';
if (__ENV.LOAD_MODE && !['smooth', 'synchronized'].includes(__ENV.LOAD_MODE)) throw new Error('Invalid LOAD_MODE');
const missedWindows = new Counter('missed_windows');
export const options = {
  batch: 20, batchPerHost: 20,
  scenarios: {
    fleet: synchronized ? {
      executor: 'constant-vus', vus: 100, duration: __ENV.LOAD_DURATION || '3m', gracefulStop: '30s',
    } : {
      executor: 'constant-arrival-rate', rate: 200, timeUnit: '3s',
      duration: __ENV.LOAD_DURATION || '3m',
      preAllocatedVUs: 30, maxVUs: numberEnv('MAX_VUS', 150, 30, 500), gracefulStop: '30s',
    },
  },
  thresholds: { ...thresholds, ...(synchronized ? { missed_windows: ['count==0'] } : { dropped_iterations: ['count==0'] }) },
};

export default function () {
  if (!synchronized) { report(); return; }
  // 100 workers x 20 distinct devices = 2000 reports per common 30-second window.
  const target = exec.scenario.startTime + exec.vu.iterationInScenario * 30000;
  sleep(Math.max(0, (target - Date.now()) / 1000));
  const first = (exec.vu.idInTest - 1) * 20;
  http.batch(Array.from({ length: 20 }, (_, offset) => requestFor(first + offset))).forEach((response) => verifyReport(response));
  const remaining = target + 30000 - Date.now();
  missedWindows.add(remaining < 0 ? 1 : 0);
  sleep(Math.max(0, remaining / 1000));
}
