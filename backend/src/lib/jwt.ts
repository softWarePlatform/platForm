import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { config } from "./config.js";

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
};

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
  return decoded;
}
