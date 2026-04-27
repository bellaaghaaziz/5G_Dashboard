import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Roles } from "../auth/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CreateUserDto } from "./create-user.dto";
import { UpdateUserDto } from "./update-user.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list() {
    const users = await this.usersService.findAll();
    return users.map(({ passwordHash, refreshTokenHash, ...safe }) => safe);
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    const { passwordHash, refreshTokenHash, ...safe } = user;
    return safe;
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    const user = await this.usersService.update(id, dto);
    const { passwordHash, refreshTokenHash, ...safe } = user;
    return safe;
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.usersService.delete(id);
    return { success: true };
  }
}
