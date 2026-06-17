import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { findUserByEmail, createUser } from "../models/userJson.js";
import { env } from "../utils/env.js";
import logger from "../utils/logger.js";

export const authRouter = Router();

// Allow creating first admin user without authentication
authRouter.post("/setup", async (req, res) => {
  try {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });
    const body = bodySchema.parse(req.body);

    // Check if any users exist
    const { configService } = await import("../services/configService.js");
    await configService.loadConfig();
    const existingUsers = await configService.getAllUsers();

    if (existingUsers.length > 0) {
      return res.status(403).json({ detail: "Initial setup already completed. Use /register instead." });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await createUser({ email: body.email, passwordHash, role: "admin" });

    logger.info("Initial admin user created", { userId: user.id, email: user.email });
    res.json({ id: user.id, email: user.email, role: user.role });
  } catch (error: any) {
    logger.error("Setup error", { error: error.message });
    res.status(400).json({ detail: error.message || "Failed to setup initial user" });
  }
});

authRouter.post("/register", async (req, res) => {
  try {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });
    const body = bodySchema.parse(req.body);

    const existing = await findUserByEmail(body.email);
    if (existing) {
      logger.warn("Registration attempt with existing email", { email: body.email });
      return res.status(409).json({ detail: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await createUser({ email: body.email, passwordHash, role: "user" });

    logger.info("User registered", { userId: user.id, email: user.email });
    res.json({ id: user.id, email: user.email, role: user.role });
  } catch (error) {
    logger.error("Registration error", { error, email: req.body?.email });
    throw error;
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const body = bodySchema.parse(req.body);

    const user = await findUserByEmail(body.email);
    if (!user) {
      logger.warn("Login attempt with invalid email", { email: body.email });
      return res.status(401).json({ detail: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      logger.warn("Login attempt with invalid password", { email: body.email, userId: user.id });
      return res.status(401).json({ detail: "Invalid credentials" });
    }

    const jwtSecret = env.JWT_SECRET || "default-jwt-secret-change-in-production";
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, jwtSecret, {
      expiresIn: "7d",
    });

    logger.info("User logged in", { userId: user.id, email: user.email, role: user.role });
    res.json({ token });
  } catch (error) {
    logger.error("Login error", { error, email: req.body?.email });
    throw error;
  }
});

