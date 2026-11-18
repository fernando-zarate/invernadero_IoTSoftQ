import 'reflect-metadata';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { databaseOptions } from './options';
import { fleetSize, seedFleet } from '../seed/fleet';

async function main() {
  const command = process.argv[2];
  if (!['migrate', 'seed', 'init'].includes(command)) {
    throw new Error('Usage: node dist/database/cli.js migrate|seed|init');
  }
  await ConfigModule.forRoot({ envFilePath: '.env' });
  const count =
    command === 'migrate' ? 0 : fleetSize(process.env.SEED_DEVICE_COUNT);
  const dataSource = new DataSource(databaseOptions(new ConfigService()));
  await dataSource.initialize();
  try {
    if (command !== 'seed') {
      const lock = dataSource.createQueryRunner();
      await lock.connect();
      try {
        // TypeORM uses another connection for migrations; keep this session lock held.
        await lock.query('SELECT pg_advisory_lock(1794960000)');
        await dataSource.runMigrations({ transaction: 'all' });
      } finally {
        await lock.query('SELECT pg_advisory_unlock(1794960000)');
        await lock.release();
      }
    }
    if (command !== 'migrate') await seedFleet(dataSource, count);
    console.log(
      `Database ${command} completed${count ? ` (${count} fleet devices)` : ''}.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: Error) => {
  console.error(`Database initialization failed: ${error.message}`);
  process.exitCode = 1;
});
