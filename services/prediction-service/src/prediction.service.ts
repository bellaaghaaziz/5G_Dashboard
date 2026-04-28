import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { PredictionInputDto } from "./prediction-input.dto";

@Injectable()
export class PredictionService {
  private readonly baseUrl: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>("PYTHON_INFERENCE_BASE_URL", "http://localhost:8000");
  }

  async predict(payload: PredictionInputDto) {
    const { data } = await axios.post(`${this.baseUrl}/predict`, payload, { timeout: 10000 });
    return {
      ...data,
      source_service: "prediction-service",
      timestamp: new Date().toISOString(),
    };
  }

  health() {
    return { status: "ok", service: "prediction-service", pythonApiBaseUrl: this.baseUrl };
  }
}
