import { report, latest, thresholds } from './common.js';

export const options = { vus: 1, iterations: 1, thresholds };
export default function () {
  // Both boundaries of the deterministic fleet, not an unknown device returning 201.
  for (const index of [0, 1999]) {
    const startedAt = Date.now();
    report(index);
    const result = latest(index, startedAt);
    console.log(`READBACK ${index} status=${result.response.status} body=${result.response.body}`);
  }
}
