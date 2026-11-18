import { NotFoundException } from '@nestjs/common';
import { MetricsService } from '../../src/services/metrics.service';

describe('MetricsService provisioning', () => {
  const payload = { temp: 24.5, airHum: 60, soilHum: 45, waterLevel: 90 };
  const metrics = {
    saveMetric: jest.fn(),
    findLatestMetrics: jest.fn(),
    findHistoryMetrics: jest.fn(),
  };
  const sensors = { findByDeviceAndType: jest.fn(), save: jest.fn() };
  const service = new MetricsService(metrics, sensors);

  beforeEach(() => {
    jest.resetAllMocks();
    metrics.findLatestMetrics.mockResolvedValue([]);
  });

  it.each([null, 'waterLevel'])(
    'rejects missing sensors (%s) before any write',
    async (missing) => {
      sensors.findByDeviceAndType.mockImplementation(
        (_device: string, type: string) =>
          Promise.resolve(
            missing === null || type === missing ? null : { id: type },
          ),
      );
      await expect(
        service.registerMetrics('unprovisioned', payload),
      ).rejects.toThrow(NotFoundException);
      expect(metrics.saveMetric).not.toHaveBeenCalled();
    },
  );

  it('persists one value per provisioned sensor', async () => {
    sensors.findByDeviceAndType.mockImplementation(
      (_device: string, type: string) => Promise.resolve({ id: type }),
    );
    await expect(
      service.registerMetrics('ESP32-INV-01', payload),
    ).resolves.toMatchObject({ status: 'success' });
    expect(metrics.saveMetric).toHaveBeenCalledTimes(4);
    for (const [type, value] of Object.entries(payload)) {
      expect(metrics.saveMetric).toHaveBeenCalledWith(
        value,
        expect.any(Date),
        type,
      );
    }
  });
});
