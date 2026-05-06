import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { GatewayController } from "./gateway.controller";
import { GatewayService } from "./gateway.service";
import { JwtStrategy } from "./auth/jwt.strategy";
import { RolesGuard } from "./auth/roles.guard";
import { ChatController } from "./chat/chat.controller";
import { ChatService } from "./chat/chat.service";

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      envFilePath: '../../.env'
    }),
    JwtModule.register({}),
  ],
  controllers: [GatewayController, ChatController],
  providers: [GatewayService, JwtStrategy, RolesGuard, ChatService],
})
export class AppModule {}
