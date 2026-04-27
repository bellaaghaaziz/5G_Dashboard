import { Body, Controller, Get, Post } from "@nestjs/common";
import { PredictionInputDto } from "./prediction-input.dto";
import { PredictionService } from "./prediction.service";

@Controller()
export class PredictionController {
  constructor(private readonly predictionService: PredictionService) {}

  @Get("health")
  health() {
    return this.predictionService.health();
  }

  @Post("predict")
  predict(@Body() dto: PredictionInputDto) {
    return this.predictionService.predict(dto);
  }
}
