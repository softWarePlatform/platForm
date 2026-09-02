import dns from "node:dns";
import http from "node:http";
import { loopbackUrl } from "./timeout.js";

dns.setDefaultResultOrder("ipv4first");

const extraNoProxy = "127.0.0.1,localhost,::1";
for (const key of ["NO_PROXY", "no_proxy"] as const) {
  const current = process.env[key]?.trim();
  process.env[key] = current ? `${current},${extraNoProxy}` : extraNoProxy;
}

const directAgent = new http.Agent({ keepAlive: true, maxSockets: 16, family: 4 });

export type HttpJson = { status: number; body: Record<string, unknown> };

function localLookup(_hostname: string, _options: unknown, callback: (err: Error | null, address: string, family: number) => void) {
  callback(null, "127.0.0.1", 4);
}

export function httpJson(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs: number },
): Promise<HttpJson> {
  const parsed = new URL(loopbackUrl(url));
  const hostname = parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname;
  const loopback = hostname === "127.0.0.1";
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const req = http.request(
      {
        hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method ?? "GET",
        family: 4,
        timeout: init.timeoutMs,
        agent: directAgent,
        lookup: loopback ? (localLookup as typeof dns.lookup) : dns.lookup,
        headers: {
          ...init.headers,
          ...(init.body
            ? {
                "content-type": init.headers?.["content-type"] ?? "application/json",
                "content-length": String(Buffer.byteLength(init.body)),
              }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          finish(() => {
            try {
              resolve({ status: res.statusCode ?? 0, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} });
            } catch {
              resolve({ status: res.statusCode ?? 0, body: {} });
            }
          });
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish(() => reject(new Error("http-timeout")));
    }, init.timeoutMs);
    req.on("timeout", () => {
      req.destroy();
      finish(() => reject(new Error("http-timeout")));
    });
    req.on("error", (error) => finish(() => reject(error)));
    if (init.body) req.write(init.body);
    req.end();
  });
}
