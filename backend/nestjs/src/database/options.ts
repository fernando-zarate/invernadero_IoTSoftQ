import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import { Device } from '../models/entities/device.entity';
import { Sensor } from '../models/entities/sensor.entity';
import { Metric } from '../models/entities/metric.entity';
import { InitialSchema1794960000000 } from './migrations/1794960000000-initial-schema';

export function databaseOptions(config: ConfigService): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.getOrThrow<string>('POSTGRES_HOST'),
    port: Number(config.getOrThrow<string>('POSTGRES_PORT')),
    username: config.getOrThrow<string>('POSTGRES_USER'),
    password: config.getOrThrow<string>('POSTGRES_PASSWORD'),
    database: config.getOrThrow<string>('POSTGRES_DB'),
    entities: [Device, Sensor, Metric],
    migrations: [InitialSchema1794960000000],
    synchronize: false,
    migrationsRun: false,
    extra: { max: 10, connectionTimeoutMillis: 10000 },
  };
}
