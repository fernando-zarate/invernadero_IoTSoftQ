import { ConfigService } from '@nestjs/config';
import { QueryRunner } from 'typeorm';
import { databaseOptions } from '../../src/database/options';
import { InitialSchema1794960000000 } from '../../src/database/migrations/1794960000000-initial-schema';
import { fleetSize } from '../../src/seed/fleet';

describe('Explicit database initialization', () => {
  it('never synchronizes or runs migrations when replicas connect', () => {
    const config = new ConfigService({
      POSTGRES_HOST: 'db',
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test-only',
      POSTGRES_DB: 'test',
    });
    expect(databaseOptions(config)).toMatchObject({
      synchronize: false,
      migrationsRun: false,
      port: 5432,
    });
  });

  it('defaults to 2000 devices and allows bounded configurable fleet sizes', () => {
    expect(fleetSize()).toBe(2000);
    expect(fleetSize('1')).toBe(1);
    expect(fleetSize('10000')).toBe(10000);
  });

  it.each(['0', '-1', '1.5', 'NaN', '', '10001'])(
    'rejects invalid fleet size %s',
    (value) => {
      expect(() => fleetSize(value)).toThrow('SEED_DEVICE_COUNT');
    },
  );

  it.each(['devices', 'sensors', 'metrics'])(
    'refuses to overwrite an existing %s table',
    async (table) => {
      const query = jest.fn();
      const runner = {
        hasTable: jest.fn((name: string) => Promise.resolve(name === table)),
        query,
      };
      await expect(
        new InitialSchema1794960000000().up(runner as unknown as QueryRunner),
      ).rejects.toThrow('Existing application tables');
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('disables destructive automatic rollback', async () => {
    await expect(new InitialSchema1794960000000().down()).rejects.toThrow(
      'disabled',
    );
  });
});
