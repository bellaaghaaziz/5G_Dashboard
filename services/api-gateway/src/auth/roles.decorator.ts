import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";
export const Roles = (
  ...roles: Array<"admin" | "network_operator" | "data_scientist" | "ml_engineer">
) => SetMetadata(ROLES_KEY, roles);
