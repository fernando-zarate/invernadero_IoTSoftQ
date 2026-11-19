import { visit, versionThresholds, numberEnv } from './common.js';
export const options = {
  scenarios: { natural: { executor: 'constant-arrival-rate', rate: numberEnv('RATE', 40), timeUnit: '1s',
    duration: __ENV.DURATION || '2m', preAllocatedVUs: 30, maxVUs: 200 } },
  thresholds: versionThresholds,
};
export default function () { visit(); }
