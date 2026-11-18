// Runs only against disposable containers; no host .env or database is used.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { setTimeout } = require('node:timers/promises');

const image = process.argv[2] || 'greenhouse-backend:local';
const prefix = `greenhouse-check-${randomUUID().slice(0, 8)}`;
const network = `${prefix}-net`;
const db = `${prefix}-db`;
const api = `${prefix}-api`;
const password = randomUUID();
const connection = [
  '-e',
  `POSTGRES_HOST=${db}`,
  '-e',
  'POSTGRES_PORT=5432',
  '-e',
  'POSTGRES_USER=greenhouse',
  '-e',
  `POSTGRES_PASSWORD=${password}`,
  '-e',
  'POSTGRES_DB=greenhouse',
];

function docker(args, allowFailure = false) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 120000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`Docker command failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function sql(query, database = 'greenhouse') {
  return docker([
    'exec',
    db,
    'psql',
    '-U',
    'greenhouse',
    '-d',
    database,
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    query,
  ]).stdout.trim();
}

function init(command = 'init', extraEnv = [], allowFailure = false) {
  return docker(
    [
      'run',
      '--rm',
      '--network',
      network,
      ...connection,
      ...extraEnv,
      image,
      'node',
      'dist/database/cli.js',
      command,
    ],
    allowFailure,
  );
}

async function main() {
  let networkCreated = false;
  let dbCreated = false;
  let apiCreated = false;
  try {
    docker(['network', 'create', network]);
    networkCreated = true;
    docker([
      'create',
      '--name',
      db,
      '--network',
      network,
      '-e',
      'POSTGRES_USER=greenhouse',
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      '-e',
      'POSTGRES_DB=greenhouse',
      'postgres:16-alpine',
    ]);
    dbCreated = true;
    docker(['start', db]);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (
        docker(
          ['exec', db, 'pg_isready', '-U', 'greenhouse', '-d', 'greenhouse'],
          true,
        ).status === 0
      ) {
        ready = true;
        break;
      }
      await setTimeout(1000);
    }
    assert.ok(ready, 'Disposable PostgreSQL must become ready');

    init();
    assert.equal(sql('SELECT count(*) FROM devices'), '2000');
    assert.equal(sql('SELECT count(*) FROM sensors'), '8000');
    assert.equal(sql('SELECT count(*) FROM metrics'), '0');
    assert.equal(
      sql(`SELECT count(*) FROM (
      SELECT "deviceId" FROM sensors GROUP BY "deviceId"
      HAVING count(*) <> 4 OR count(DISTINCT type) <> 4
    ) invalid`),
      '0',
    );

    // Simulate an interrupted old seed: keep the device but remove one sensor.
    sql(`DELETE FROM sensors WHERE "deviceId" = 'ESP32-INV-01' AND type = 'waterLevel';
      UPDATE devices SET name = 'Existing greenhouse', "pumpStatus" = true WHERE id = 'ESP32-INV-01'`);
    init();
    const sensorIds = sql(
      "SELECT string_agg(id::text, ',' ORDER BY id) FROM sensors",
    );
    init('seed', ['-e', 'SEED_DEVICE_COUNT=1']);
    assert.equal(
      sql("SELECT string_agg(id::text, ',' ORDER BY id) FROM sensors"),
      sensorIds,
    );
    assert.equal(sql('SELECT count(*) FROM sensors'), '8000');
    assert.equal(sql('SELECT count(*) FROM devices'), '2000');
    assert.equal(
      sql(
        `SELECT name || ':' || "pumpStatus" FROM devices WHERE id = 'ESP32-INV-01'`,
      ),
      'Existing greenhouse:true',
    );
    assert.equal(sql('SELECT count(*) FROM migrations'), '1');

    // Refuse to baseline a pre-existing schema, preserving its data.
    sql('CREATE DATABASE legacy');
    sql(
      "CREATE TABLE devices (marker text); INSERT INTO devices VALUES ('keep')",
      'legacy',
    );
    const refused = init('migrate', ['-e', 'POSTGRES_DB=legacy'], true);
    assert.notEqual(refused.status, 0, 'Existing tables must be rejected');
    assert.match(
      refused.stdout + refused.stderr,
      /Existing application tables/,
    );
    assert.equal(sql('SELECT marker FROM devices', 'legacy'), 'keep');

    docker([
      'create',
      '--name',
      api,
      '--network',
      network,
      ...connection,
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      image,
    ]);
    apiCreated = true;
    docker(['start', api]);
    assert.equal(
      docker([
        'exec',
        api,
        'node',
        '-e',
        `
      const fs = require('node:fs'); const assert = require('node:assert/strict');
      assert.notEqual(process.getuid(), 0);
      assert.equal(process.cwd(), '/app');
      assert.ok(fs.existsSync('dist/main.js'));
      assert.ok(!fs.existsSync('dist/src/main.js'));
      assert.ok(!fs.existsSync('node_modules/typescript'));
      assert.ok(!fs.existsSync('node_modules/@nestjs/cli'));
      assert.ok(JSON.parse(fs.readFileSync('openapi.json')).openapi);
    `,
      ]).status,
      0,
    );
    docker([
      'exec',
      api,
      'node',
      '-e',
      `
      (async () => {
        for (let i = 0; i < 40; i++) {
          try { if ((await fetch('http://127.0.0.1:3000/api-docs')).ok) return; } catch {}
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        throw new Error('API did not become ready');
      })().catch(e => { console.error(e.message); process.exitCode = 1; });
    `,
    ]);
    assert.equal(
      sql('SELECT count(*) FROM metrics'),
      '0',
      'Replica startup must not seed metrics',
    );
    assert.equal(sql('SELECT count(*) FROM sensors'), '8000');
    assert.equal(sql('SELECT count(*) FROM migrations'), '1');
    docker(['exec', api, 'node', 'scripts/smoke-metrics.cjs']);
    assert.equal(sql('SELECT count(*) FROM metrics'), '4');
    docker([
      'exec',
      api,
      'node',
      '-e',
      `
      fetch('http://127.0.0.1:3000/metrics/missing-device', {
        method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({temp:24.5, airHum:60, soilHum:45, waterLevel:90})
      }).then(r => require('node:assert/strict').equal(r.status, 404))
        .catch(e => { console.error(e.message); process.exitCode = 1; });
    `,
    ]);
    assert.equal(sql('SELECT count(*) FROM metrics'), '4');
    docker(['stop', '-t', '10', api]);
    // Nest completes its shutdown hooks, then re-sends SIGTERM (128 + 15).
    assert.equal(
      docker(['inspect', '-f', '{{.State.ExitCode}}', api]).stdout.trim(),
      '143',
    );
    console.log(
      'Container verification passed: non-root production image, safe migrations, retryable 2000/8000 fleet, four persisted metrics, missing-sensor 404, graceful stop.',
    );
  } catch (error) {
    // Preserve diagnostics before cleaning up disposable containers.
    if (apiCreated) {
      const logs = docker(['logs', '--tail', '60', api], true);
      console.error(logs.stdout + logs.stderr);
    }
    if (dbCreated)
      console.error(docker(['logs', '--tail', '20', db], true).stderr);
    throw error;
  } finally {
    if (apiCreated) docker(['rm', '-f', '-v', api], true);
    if (dbCreated) docker(['rm', '-f', '-v', db], true);
    if (networkCreated) docker(['network', 'rm', network], true);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
