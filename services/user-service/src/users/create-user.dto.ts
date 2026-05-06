import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { ALL_ROLES, UserRole } from "../common/roles";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsIn(ALL_ROLES)
  role?: UserRole;
}
