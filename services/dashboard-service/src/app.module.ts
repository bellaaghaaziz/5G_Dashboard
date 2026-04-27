import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class AppModule {}
