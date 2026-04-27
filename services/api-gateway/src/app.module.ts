import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { GatewayController } from "./gateway.controller";
import { GatewayService } from "./gateway.service";
import { JwtStrategy } from "./auth/jwt.strategy";
import { RolesGuard } from "./auth/roles.guard";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), JwtModule.register({})],
  controllers: [GatewayController],
  providers: [GatewayService, JwtStrategy, RolesGuard],
})
export class AppModule {}
