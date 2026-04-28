import { BadRequestException, Inject, Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UserRole } from "../common/roles";
import { CreateUserDto } from "../users/create-user.dto";
import { User } from "../users/user.entity";
import { UsersService } from "../users/users.service";
import { RefreshDto } from "./refresh.dto";
import { SignInDto } from "./signin.dto";

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const adminEmail = this.config.get<string>("ADMIN_EMAIL", "admin@5g.local");
    const adminPassword = this.config.get<string>("ADMIN_PASSWORD", "admin12345");
    const adminName = this.config.get<string>("ADMIN_FULL_NAME", "Platform Admin");

    const existing = await this.usersService.findByEmail(adminEmail);
    if (!existing) {
      await this.usersService.create(
        {
          email: adminEmail,
          fullName: adminName,
          password: adminPassword,
        },
        "admin",
      );
    }
  }

  private sanitize(user: User) {
    const { passwordHash, refreshTokenHash, ...safe } = user;
    return safe;
  }

  private async signTokens(userId: string, email: string, role: UserRole) {
    const accessSecret = this.config.get<string>("JWT_ACCESS_SECRET", "change-me-access");
    const refreshSecret = this.config.get<string>("JWT_REFRESH_SECRET", "change-me-refresh");
    const accessExpires = this.config.get<string>("JWT_ACCESS_EXPIRES", "15m");
    const refreshExpires = this.config.get<string>("JWT_REFRESH_EXPIRES", "7d");

    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { secret: accessSecret, expiresIn: accessExpires as any }),
      this.jwtService.signAsync(payload, { secret: refreshSecret, expiresIn: refreshExpires as any }),
    ]);

    return { accessToken, refreshToken };
  }

  async signUp(dto: CreateUserDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new BadRequestException("Email already exists");

    const role = dto.role ?? "network_operator";
    const user = await this.usersService.create(dto, role);
    const tokens = await this.signTokens(user.id, user.email, user.role);
    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.setRefreshTokenHash(user.id, refreshHash);

    return { user: this.sanitize(user), tokens };
  }

  async signIn(dto: SignInDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid credentials");

    const tokens = await this.signTokens(user.id, user.email, user.role);
    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.setRefreshTokenHash(user.id, refreshHash);

    return { user: this.sanitize(user), tokens };
  }

  async refresh(dto: RefreshDto) {
    const refreshSecret = this.config.get<string>("JWT_REFRESH_SECRET", "change-me-refresh");
    const payload = await this.jwtService.verifyAsync<{ sub: string; email: string; role: UserRole }>(dto.refreshToken, {
      secret: refreshSecret,
    });

    const user = await this.usersService.findById(payload.sub);
    if (!user.refreshTokenHash) throw new UnauthorizedException("Session expired");

    const ok = await bcrypt.compare(dto.refreshToken, user.refreshTokenHash);
    if (!ok) throw new UnauthorizedException("Invalid refresh token");

    const tokens = await this.signTokens(user.id, user.email, user.role);
    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.setRefreshTokenHash(user.id, refreshHash);

    return { user: this.sanitize(user), tokens };
  }

  async signOut(userId: string) {
    await this.usersService.setRefreshTokenHash(userId, null);
    return { success: true };
  }
}
