\set ON_ERROR_STOP on
DO $$
BEGIN
  IF (SELECT count(*) FROM devices WHERE id = 'ESP32-INV-01') <> 1
     OR (SELECT count(*) FROM sensors WHERE "deviceId" = 'ESP32-INV-01'
         AND type IN ('temp', 'airHum', 'soilHum', 'waterLevel')) <> 4 THEN
    RAISE EXCEPTION 'Demo seeder not ready: require one ESP32-INV-01 and exactly four channels';
  END IF;
END $$;
SELECT 'Demo device and four channels ready' AS seed_status;
