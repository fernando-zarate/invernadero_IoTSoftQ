\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(20261119);

CREATE TEMP TABLE fleet_ids ON COMMIT DROP AS
SELECT CASE WHEN n = 0 THEN 'ESP32-INV-01'
            ELSE 'TP-' || lpad(n::text, 4, '0') END AS id
FROM generate_series(0, 1999) AS n;

INSERT INTO devices (id, name, "pumpStatus")
SELECT id, 'TP greenhouse ' || id, false FROM fleet_ids
ON CONFLICT (id) DO NOTHING;

INSERT INTO sensors (type, "deviceId")
SELECT channel.type, fleet.id
FROM fleet_ids AS fleet
CROSS JOIN (VALUES ('temp'), ('airHum'), ('soilHum'), ('waterLevel')) AS channel(type)
WHERE NOT EXISTS (
  SELECT 1 FROM sensors
  WHERE sensors."deviceId" = fleet.id AND sensors.type = channel.type
);

DO $$
BEGIN
  IF (SELECT count(*) FROM devices JOIN fleet_ids USING (id)) <> 2000
     OR (SELECT count(*) FROM sensors JOIN fleet_ids ON sensors."deviceId" = fleet_ids.id
         WHERE type IN ('temp', 'airHum', 'soilHum', 'waterLevel')) <> 8000 THEN
    RAISE EXCEPTION 'Expected exactly 2000 devices and 8000 channels; inspect existing data';
  END IF;
END $$;

SELECT count(*) AS fleet_devices FROM devices JOIN fleet_ids USING (id);
SELECT type, count(*) AS fleet_channels FROM sensors
JOIN fleet_ids ON sensors."deviceId" = fleet_ids.id
GROUP BY type ORDER BY type;
COMMIT;
