import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createProxyMiddleware } from "http-proxy-middleware";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  const dashboardUrl = process.env.DASHBOARD_SERVICE_URL ?? "http://dashboard-service:3003";

  // Proxy /socket.io (polling + WebSocket upgrade) → dashboard-service
  // Mount at root so Express doesn't strip the /socket.io prefix from req.url
  const wsProxy = createProxyMiddleware({
    target: dashboardUrl,
    ws: true,
    changeOrigin: true,
    pathFilter: "/socket.io",
  });
  app.use(wsProxy);

  const port = Number(process.env.API_GATEWAY_PORT ?? 3000);
  const server = await app.listen(port);

  // Forward raw TCP WebSocket upgrade events (needed for non-Express upgrade handling)
  server.on("upgrade", wsProxy.upgrade as any);

  console.log(`api-gateway running on ${port} (WebSocket proxy → ${dashboardUrl})`);
}
bootstrap();
