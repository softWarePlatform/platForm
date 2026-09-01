import { config } from "./config.js";

export type UpstreamStatus = "OK" | "UNAVAILABLE";

export type UpstreamResult<T> = {
  status: UpstreamStatus;
  data: T | null;
  reason?: "NOT_CONFIGURED" | "TIMEOUT" | "HTTP_ERROR" | "NETWORK_ERROR" | "INVALID_RESPONSE";
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function requestCourseSummaries<T>(
  serviceUrl: string,
  payload: { userId: string; courseIds: string[] },
  requestId: string,
  fetcher: FetchLike = fetch,
): Promise<UpstreamResult<T>> {
  if (!serviceUrl) return { status: "UNAVAILABLE", data: null, reason: "NOT_CONFIGURED" };

  try {
    const response = await fetcher(`${serviceUrl}/internal/dashboard/course-summaries:batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": config.internalServiceToken,
        "x-request-id": requestId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    if (!response.ok) return { status: "UNAVAILABLE", data: null, reason: "HTTP_ERROR" };
    const body = await response.json() as T;
    return { status: "OK", data: body };
  } catch (error) {
    if ((error as { name?: string }).name === "TimeoutError" || (error as { name?: string }).name === "AbortError") {
      return { status: "UNAVAILABLE", data: null, reason: "TIMEOUT" };
    }
    return { status: "UNAVAILABLE", data: null, reason: "NETWORK_ERROR" };
  }
}
