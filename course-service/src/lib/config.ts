const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173,http://localhost:8080";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  corsOrigins: corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean),
};
