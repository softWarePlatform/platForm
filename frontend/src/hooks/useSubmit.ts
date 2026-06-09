import { useCallback, useState } from "react";
import { getApiError } from "../api/errors";

export function useSubmit<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
  fallbackError = "操作失败",
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: TArgs) => {
      setBusy(true);
      setError(null);
      try {
        await fn(...args);
      } catch (e: unknown) {
        setError(getApiError(e, fallbackError));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [fn, fallbackError],
  );

  return { run, busy, error, setError };
}
