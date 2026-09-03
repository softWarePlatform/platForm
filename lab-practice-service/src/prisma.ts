import { PrismaClient } from "@lab/prisma-client-v2";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});
