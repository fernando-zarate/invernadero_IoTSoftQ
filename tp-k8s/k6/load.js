import { cfg, arrival, preflight, slos, systemTags } from './protocol.js';
export { report } from './protocol.js';
export const options = {systemTags, scenarios: {nominal: arrival(`${cfg.duration}s`)},
  thresholds: {...slos, dropped_iterations: ['count==0']}};
export const setup = preflight;
