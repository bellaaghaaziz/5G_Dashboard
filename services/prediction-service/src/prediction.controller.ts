import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { PredictionInputDto } from "./prediction-input.dto";
import { PredictionService } from "./prediction.service";

@Controller()
export class PredictionController {
  constructor(@Inject(PredictionService) private readonly predictionService: PredictionService) {}

  @Get("health")
  health() {
    return this.predictionService.health();
  }

  @Post("predict")
  predict(@Body() dto: PredictionInputDto) {
    return this.predictionService.predict(dto);
  }
}
