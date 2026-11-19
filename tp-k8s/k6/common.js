import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

export const API = (__ENV.API_URL || 'http://api.terrasense.local').replace(/\/$/, '');
export const WEB = (__ENV.WEB_URL || 'http://terrasense.local').replace(/\/$/, '');
export const channels = ['temp', 'airHum', 'soilHum', 'waterLevel'];
export const payload = { temp: 24.5, airHum: 60, soilHum: 45, waterLevel: 90 };
export const thresholds = {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{op:report}': ['p(95)<300'],
  checks: ['rate>0.99'],
};

export function numberEnv(name, fallback, min = 1, max = 10000) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

export function deviceId(index) {
  const normalized = index % 2000;
  return normalized === 0 ? 'ESP32-INV-01' : `TP-${String(normalized).padStart(4, '0')}`;
}

export function requestFor(index) {
  return {
    method: 'POST', url: `${API}/metrics/${deviceId(index)}`,
    body: JSON.stringify(payload),
    params: { headers: { 'Content-Type': 'application/json' }, timeout: '5s', tags: { name: 'POST /metrics/:device', op: 'report' } },
  };
}

export function verifyReport(response) {
  let body;
  try { body = response.json(); } catch (_) { body = null; }
  const ok = response.status === 201 && body && body.status === 'success';
  check(response, { 'report accepted (201 + success)': () => !!ok });
  return !!ok;
}

export function report(index = exec.scenario.iterationInTest) {
  const request = requestFor(index);
  const response = http.post(request.url, request.body, request.params);
  verifyReport(response);
  return response;
}

export function validLatest(body) {
  return Array.isArray(body) && channels.every((type) => body.some((item) =>
    item.sensorType === type && typeof item.value === 'number' &&
    item.value === payload[type] && Number.isFinite(Date.parse(item.date))));
}

export function latest(index = 0, notBefore = 0) {
  const response = http.get(`${API}/metrics/${deviceId(index)}/latest?sensorType=${channels.join(',')}`, {
    timeout: '5s', tags: { op: 'latest', name: 'GET /metrics/:device/latest' },
  });
  let body;
  try { body = response.json(); } catch (_) { body = null; }
  const ok = response.status === 200 && validLatest(body) && body.every((item) => Date.parse(item.date) >= notBefore);
  check(response, { 'latest contains four persisted values and fresh dates': () => ok });
  return { response, ok };
}
