import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { KafkaService } from "./kafka.service";
import { EventsGateway } from "./events.gateway";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [DashboardController],
  providers: [DashboardService, KafkaService, EventsGateway],
})
export class AppModule {}
