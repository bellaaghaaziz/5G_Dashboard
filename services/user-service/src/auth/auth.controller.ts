import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RefreshDto } from "./refresh.dto";
import { SignInDto } from "./signin.dto";
import { AuthService } from "./auth.service";
import { CreateUserDto } from "../users/create-user.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("signup")
  signUp(@Body() dto: CreateUserDto) {
    return this.authService.signUp(dto);
  }

  @Post("signin")
  signIn(@Body() dto: SignInDto) {
    return this.authService.signIn(dto);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post("signout")
  @UseGuards(JwtAuthGuard)
  signOut(@Req() req: { user: { id: string } }) {
    return this.authService.signOut(req.user.id);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: { id: string; email: string; role: string } }) {
    return req.user;
  }
}
