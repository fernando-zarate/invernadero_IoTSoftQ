const assert = require('node:assert/strict');
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    const device = 'ESP32-INV-01';
    const payload = { temp: 24.5, airHum: 60, soilHum: 45, waterLevel: 90 };
    const query = `SELECT m.id, s.type, m.value FROM metrics m
      JOIN sensors s ON s.id = m."sensorId" WHERE s."deviceId" = $1`;
    const before = await client.query(`${query} ORDER BY m.id DESC LIMIT 1`, [
      device,
    ]);
    const lastId = before.rows[0]?.id || '0';
    const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
    const response = await fetch(`${baseUrl}/metrics/${device}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(
      response.status,
      201,
      `Unexpected HTTP status: ${response.status}`,
    );
    assert.equal((await response.json()).status, 'success');
    const after = await client.query(`${query} AND m.id > $2`, [
      device,
      lastId,
    ]);
    assert.equal(
      after.rowCount,
      4,
      'POST must persist exactly four new metric rows',
    );
    assert.deepEqual(
      after.rows.map(({ type, value }) => [type, value]).sort(),
      Object.entries(payload).sort(),
      'Persisted sensor types and values must match the request',
    );
    console.log(
      'Metrics smoke passed: HTTP 201 and four matching PostgreSQL rows.',
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
