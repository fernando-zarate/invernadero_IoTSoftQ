import { sleep } from 'k6';
import { numberEnv, report, thresholds } from './common.js';

const scale = numberEnv('VU_SCALE', 1, 0.1, 4);
const target = (value) => Math.max(1, Math.round(value * scale));
export const options = {
  scenarios: { stress: {
    executor: 'ramping-vus', startVUs: 1, gracefulRampDown: '10s', gracefulStop: '10s',
    stages: [
      { duration: '30s', target: target(10) }, { duration: '1m', target: target(10) },
      { duration: '30s', target: target(40) }, { duration: '1m', target: target(40) },
      { duration: '30s', target: target(100) }, { duration: '1m', target: target(100) },
      { duration: '30s', target: 0 },
    ],
  } },
  thresholds,
};
export default function () {
  report();
  sleep(numberEnv('PACE_SECONDS', 1, 0.1, 30));
}
