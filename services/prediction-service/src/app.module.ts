import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PredictionController } from "./prediction.controller";
import { PredictionService } from "./prediction.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [PredictionController],
  providers: [PredictionService],
})
export class AppModule {}
