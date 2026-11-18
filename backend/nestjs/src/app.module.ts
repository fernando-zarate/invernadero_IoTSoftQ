import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import { ControllersModule } from './controllers/controllers.module';
import { ServicesModule } from './services/services.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { databaseOptions } from './database/options';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        databaseOptions(configService),
    }),
    ControllersModule,
    ServicesModule,
    RepositoriesModule,
  ],
})
export class AppModule {}
