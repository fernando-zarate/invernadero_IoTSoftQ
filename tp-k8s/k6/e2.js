import { numberEnv, report, thresholds } from './common.js';

const peak = numberEnv('SPIKE_RPS', 200, 10, 1000);
const maxVUs = numberEnv('MAX_VUS', 150, 30, 500);
export const options = {
  scenarios: { spike: {
    executor: 'ramping-arrival-rate', startRate: 10, timeUnit: '1s',
    preAllocatedVUs: 30, maxVUs, gracefulStop: '10s',
    stages: [
      { duration: '30s', target: 10 },
      { duration: '1s', target: peak },
      { duration: '30s', target: peak },
      { duration: '1s', target: 10 },
      { duration: '1m', target: 10 },
    ],
  } },
  thresholds: { ...thresholds, dropped_iterations: ['count==0'] },
};
export default function () { report(); }
