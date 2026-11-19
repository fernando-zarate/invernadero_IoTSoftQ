import { cfg, preflight, slos, systemTags } from './protocol.js';
export { pacedReport } from './protocol.js';
export const options = {systemTags, scenarios: {stress: {
  executor: 'ramping-vus', exec: 'pacedReport', startVUs: 1, gracefulRampDown: '5s',
  stages: [
    {duration: '30s', target: 10}, {duration: '45s', target: 10},
    {duration: '15s', target: Math.floor(cfg.peak / 4)}, {duration: '60s', target: Math.floor(cfg.peak / 4)},
    {duration: '15s', target: Math.floor(cfg.peak / 2)}, {duration: '60s', target: Math.floor(cfg.peak / 2)},
    {duration: '15s', target: cfg.peak}, {duration: '60s', target: cfg.peak},
    {duration: '30s', target: 0},
  ],
}}, thresholds: slos};
export const setup = preflight;
