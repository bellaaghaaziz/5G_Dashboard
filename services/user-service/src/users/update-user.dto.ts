import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { ALL_ROLES, UserRole } from "../common/roles";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsIn(ALL_ROLES)
  role?: UserRole;
}
