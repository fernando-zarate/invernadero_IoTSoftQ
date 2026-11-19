import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  getLiveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  async getReadiness() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ready', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'down',
      });
    }
  }
}
