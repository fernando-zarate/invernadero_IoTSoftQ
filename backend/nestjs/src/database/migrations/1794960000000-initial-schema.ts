import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1794960000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['devices', 'sensors', 'metrics']) {
      if (await queryRunner.hasTable(table)) {
        throw new Error(
          'Existing application tables detected. Back up and explicitly baseline the reviewed schema before running migrations; no tables were modified.',
        );
      }
    }
    await queryRunner.query(`
      CREATE TABLE "devices" (
        "id" varchar NOT NULL PRIMARY KEY,
        "name" varchar NOT NULL,
        "pumpStatus" boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "sensors" (
        "id" BIGSERIAL PRIMARY KEY,
        "type" varchar NOT NULL,
        "pin" varchar,
        "deviceId" varchar REFERENCES "devices"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "metrics" (
        "id" BIGSERIAL PRIMARY KEY,
        "value" double precision NOT NULL,
        "date" timestamp NOT NULL DEFAULT now(),
        "sensorId" bigint REFERENCES "sensors"("id") ON DELETE CASCADE
      )
    `);
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error('Automatic rollback is disabled to protect telemetry data.'),
    );
  }
}
