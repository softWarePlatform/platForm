import "dotenv/config";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { request as undiciRequest } from "undici";
import { config } from "./config.js";
import { classifyApiPath, downstreamPath, type Downstream } from "./routing.js";

const hopByHop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function toProxyBody(body: unknown): Buffer | undefined {
  if (body == null) return undefined;
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body);
  return Buffer.from(JSON.stringify(body));
}

function originFor(target: Downstream): string | null {
  switch (target) {
    case "homework":
      return config.homeworkServiceUrl;
    case "course":
      return config.courseServiceUrl;
    case "lab":
      return config.labServiceUrl;
    case "monolith":
      return config.monolithUrl;
    default:
      return null;
  }
}

async function proxy(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) {
  const requestId = String(request.headers["x-request-id"] ?? request.id ?? randomUUID());
  reply.header("x-request-id", requestId);
  const target = classifyApiPath(request.url);
  const origin = originFor(target);
  if (!origin) {
    return reply.code(404).send({ code: "NOT_FOUND", message: "网关未配置该路径", requestId });
  }
  const url = new URL(request.url, "http://gateway.local");
  const dest = `${origin}${downstreamPath(url.pathname)}${url.search}`;
  const headers: Record<string, string> = { "x-request-id": requestId };
  for (const [key, value] of Object.entries(request.headers)) {
    if (value == null || hopByHop.has(key.toLowerCase())) continue;
    headers[key] = Array.isArray(value) ? value.join(",") : String(value);
  }
  const method = request.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  try {
    const upstream = await undiciRequest(dest, {
      method,
      headers,
      body: hasBody ? toProxyBody(request.body) : undefined,
    });
    reply.code(upstream.statusCode);
    for (const [key, value] of Object.entries(upstream.headers)) {
      if (value == null || hopByHop.has(key.toLowerCase()) || key.toLowerCase() === "x-request-id") continue;
      reply.header(key, value as string);
    }
    reply.header("x-request-id", requestId);
    const payload = Buffer.from(await upstream.body.arrayBuffer());
    return reply.send(payload);
  } catch (error) {
    request.log.warn({ err: error, dest, target }, "downstream unavailable");
    return reply.code(502).send({
      code: "BAD_GATEWAY",
      message: `${target} 服务暂时不可用`,
      requestId,
    });
  }
}

async function main() {
  const app = Fastify({
    logger: true,
    requestIdHeader: "x-request-id",
    genReqId: (req) => String(req.headers["x-request-id"] ?? randomUUID()),
    bodyLimit: 20 * 1024 * 1024,
  });

  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    const origin = request.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-credentials", "true");
      reply.header("access-control-allow-headers", "authorization,content-type,x-request-id");
      reply.header("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      reply.header("access-control-expose-headers", "x-request-id");
    }
    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: "1 minute",
    allowList: ["/health/live", "/health/ready"],
  });

  app.get("/health/live", async () => ({ ok: true, service: "api-gateway", type: "live" }));
  app.get("/health/ready", async () => ({ ok: true, service: "api-gateway", type: "ready" }));
  app.all("/api", proxy);
  app.all("/api/*", proxy);

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
