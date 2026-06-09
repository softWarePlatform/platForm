import type { AxiosError } from "axios";

type ApiErrorBody = {
  error?: string;
  code?: string;
};

export function getApiError(e: unknown, fallback = "操作失败"): string {
  if (typeof e === "object" && e !== null && "response" in e) {
    const data = (e as AxiosError<ApiErrorBody>).response?.data;
    if (data?.error) return data.error;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function getApiErrorCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "response" in e) {
    return (e as AxiosError<ApiErrorBody>).response?.data?.code;
  }
  return undefined;
}
