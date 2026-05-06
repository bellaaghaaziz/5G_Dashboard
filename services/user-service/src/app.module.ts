import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";
import { User } from "./users/user.entity";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get<string>("POSTGRES_HOST", "localhost"),
        port: Number(config.get<string>("POSTGRES_PORT", "5432")),
        username: config.get<string>("POSTGRES_USER", "platform"),
        password: config.get<string>("POSTGRES_PASSWORD", "platform123"),
        database: config.get<string>("POSTGRES_DB", "platform_users"),
        entities: [User],
        synchronize: true,
      }),
    }),
    JwtModule.register({}),
    AuthModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
