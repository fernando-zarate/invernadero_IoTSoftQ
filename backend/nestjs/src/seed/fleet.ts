import { DataSource, In } from 'typeorm';
import { Device } from '../models/entities/device.entity';
import { Sensor } from '../models/entities/sensor.entity';

export function fleetSize(value = '2000'): number {
  const count = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 10000
  ) {
    throw new Error('SEED_DEVICE_COUNT must be an integer between 1 and 10000');
  }
  return count;
}

export const sensorConfiguration = [
  { type: 'temp', pin: 'GPIO23' },
  { type: 'airHum', pin: 'GPIO23' },
  { type: 'soilHum', pin: 'GPIO34' },
  { type: 'waterLevel', pin: 'GPIO5' },
];

export async function seedFleet(
  dataSource: DataSource,
  count: number,
): Promise<void> {
  fleetSize(String(count));
  await dataSource.transaction(async (manager) => {
    // Serialize overlapping/retried seed Jobs; all changes commit together.
    await manager.query('SELECT pg_advisory_xact_lock(1794960001)');
    const devices = manager.getRepository(Device);
    const sensors = manager.getRepository(Sensor);
    for (let offset = 0; offset < count; offset += 250) {
      const batch = Array.from(
        { length: Math.min(250, count - offset) },
        (_, index) => ({
          id: `ESP32-INV-${String(offset + index + 1).padStart(2, '0')}`,
          name: `Greenhouse ${offset + index + 1} (Mock)`,
          pumpStatus: false,
        }),
      );
      await devices
        .createQueryBuilder()
        .insert()
        .values(batch)
        .orIgnore()
        .execute();
      const existing = await sensors.find({
        where: { device: { id: In(batch.map((device) => device.id)) } },
        relations: { device: true },
      });
      const keys = new Set<string>();
      for (const sensor of existing) {
        const key = `${sensor.device.id}:${sensor.type}`;
        if (
          keys.has(key) &&
          sensorConfiguration.some((item) => item.type === sensor.type)
        ) {
          throw new Error(
            `Duplicate provisioned sensor: ${key}. Review existing data before seeding.`,
          );
        }
        keys.add(key);
      }
      const missing = batch.flatMap((device) =>
        sensorConfiguration
          .filter((sensor) => !keys.has(`${device.id}:${sensor.type}`))
          .map((sensor) => ({ ...sensor, device: { id: device.id } })),
      );
      if (missing.length) await sensors.insert(missing);
    }
  });
}
