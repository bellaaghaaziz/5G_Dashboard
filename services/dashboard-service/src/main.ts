import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = Number(process.env.DASHBOARD_SERVICE_PORT ?? 3003);
  await app.listen(port);
  console.log(`dashboard-service running on ${port}`);
}
bootstrap();
