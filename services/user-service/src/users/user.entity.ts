import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { UserRole } from "../common/roles";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", unique: true })
  email!: string;

  @Column({ type: "varchar" })
  fullName!: string;

  @Column({ type: "varchar" })
  passwordHash!: string;

  @Column({ type: "varchar", default: "network_operator" })
  role!: UserRole;

  @Column({ type: "varchar", nullable: true })
  refreshTokenHash?: string | null;

  @CreateDateColumn({ type: "timestamp" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updatedAt!: Date;
}
