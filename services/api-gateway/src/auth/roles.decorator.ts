import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";
export const Roles = (...roles: Array<"admin" | "network_operator" | "data_scientist">) => SetMetadata(ROLES_KEY, roles);
