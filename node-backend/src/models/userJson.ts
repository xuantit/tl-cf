import bcrypt from "bcryptjs";
import { configService } from "../services/configService.js";
import { randomUUID } from "crypto";
import type { ConfigUser } from "./configAccount.js";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Find user by email (from JSON config)
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  await configService.loadConfig();
  const user = await configService.getUserByEmail(email);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

/**
 * Find user by ID (from JSON config)
 */
export async function findUserById(id: string): Promise<User | null> {
  await configService.loadConfig();
  const user = await configService.getUserById(id);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

/**
 * Create new user (save to JSON config)
 */
export async function createUser(data: {
  email: string;
  passwordHash: string;
  role?: string;
}): Promise<User> {
  await configService.loadConfig();

  // Check if user already exists
  const existing = await configService.getUserByEmail(data.email);
  if (existing) {
    throw new Error("User with this email already exists");
  }

  const user = await configService.addUser({
    email: data.email,
    passwordHash: data.passwordHash,
    role: data.role || "user",
  });

  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}
