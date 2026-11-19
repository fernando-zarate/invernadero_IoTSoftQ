import { fail } from 'k6';
import { preflight, readback, slos, systemTags } from './protocol.js';

export const options = {systemTags, vus: 1, iterations: 1, thresholds: {
  http_req_failed: slos.http_req_failed, checks: slos.checks,
  'http_req_duration{operation:preflight}': ['p(95)<300'],
}};
export const setup = preflight;
export default function () {
  if (!readback()) fail('Persistence readback failed');
}
